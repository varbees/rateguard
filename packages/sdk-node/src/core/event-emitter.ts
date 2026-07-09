import { randomUUID } from 'node:crypto';
import { toJson } from './utils.js';
import type {
  EventEmitterLike,
  RateGuardEventEnvelope,
  RateGuardEventPayload,
  RateGuardEventType,
  ResolvedRateGuardOptions,
} from '../types.js';

/**
 * Console-backed event emitter used when no control plane is configured.
 */
export class ConsoleEventEmitter implements EventEmitterLike {
  async emit(event: RateGuardEventEnvelope): Promise<void> {
    // Keep console output machine-readable for local dev debugging.
    // eslint-disable-next-line no-console
    console.info(toJson(event));
  }
}

/**
 * HTTP webhook event emitter — POSTs the JSON-marshaled event envelope to a
 * configured endpoint. Mirrors Go's HTTPEventEmitter (events.go): same
 * User-Agent, same Content-Type, same "status >= 300 is an error" rule,
 * same 5-second timeout. Event delivery must never break the request path,
 * so failures are logged, not thrown.
 */
export class HTTPEventEmitter implements EventEmitterLike {
  constructor(private readonly endpoint: string) {}

  async emit(event: RateGuardEventEnvelope): Promise<void> {
    if (!this.endpoint) {
      return;
    }

    try {
      const response = await fetch(this.endpoint, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'User-Agent': 'RateGuard-Node-SDK/0.1',
        },
        body: toJson(event),
        signal: AbortSignal.timeout(5_000),
      });

      // Drain the response body so the underlying connection can be reused,
      // mirroring Go's io.Copy(io.Discard, resp.Body).
      await response.text().catch(() => undefined);

      if (response.status >= 300) {
        // eslint-disable-next-line no-console
        console.warn(`RateGuard event delivery failed: ${response.status} ${response.statusText}`);
      }
    } catch (error) {
      // eslint-disable-next-line no-console
      console.warn('RateGuard event delivery failed', error);
    }
  }
}

type WebSocketCtor = new (url: string) => WebSocket;

/**
 * WebSocket-backed control-plane emitter with a console fallback.
 */
export class ControlPlaneEventEmitter implements EventEmitterLike {
  private readonly wsUrl: string | undefined;
  private readonly fallback: EventEmitterLike;
  private socket: WebSocket | undefined;
  private connecting = false;
  private reconnectAttempt = 0;
  private readonly queue: string[] = [];

  constructor(options: { wsUrl?: string; fallback?: EventEmitterLike }) {
    this.wsUrl = options.wsUrl;
    this.fallback = options.fallback ?? new ConsoleEventEmitter();
  }

  async emit(event: RateGuardEventEnvelope): Promise<void> {
    if (!this.wsUrl || typeof globalThis.WebSocket !== 'function') {
      await this.fallback.emit(event);
      return;
    }

    const payload = toJson(event);
    const socket = this.ensureSocket();
    if (!socket || socket.readyState !== WebSocket.OPEN) {
      if (this.queue.length >= 100) {
        await this.fallback.emit(event);
        return;
      }
      this.queue.push(payload);
      return;
    }

    socket.send(payload);
  }

  private ensureSocket(): WebSocket | undefined {
    if (this.socket && this.socket.readyState === WebSocket.OPEN) {
      return this.socket;
    }

    if (this.connecting || !this.wsUrl) {
      return this.socket;
    }

    this.connecting = true;
    const WebSocketImpl: WebSocketCtor = globalThis.WebSocket;
    const socket = new WebSocketImpl(this.wsUrl);
    this.socket = socket;

    socket.addEventListener('open', () => {
      this.connecting = false;
      this.reconnectAttempt = 0;
      while (this.queue.length > 0 && socket.readyState === WebSocket.OPEN) {
        const next = this.queue.shift();
        if (next) {
          socket.send(next);
        }
      }
    });

    socket.addEventListener('close', () => {
      this.connecting = false;
      this.socket = undefined;
      this.scheduleReconnect();
    });

    socket.addEventListener('error', () => {
      this.connecting = false;
      this.socket = undefined;
      this.scheduleReconnect();
    });

    return socket;
  }

  private scheduleReconnect(): void {
    if (!this.wsUrl) {
      return;
    }

    const delay = Math.min(30_000, 1_000 * 2 ** this.reconnectAttempt);
    this.reconnectAttempt += 1;
    globalThis.setTimeout(() => {
      this.ensureSocket();
    }, delay);
  }
}

const DEFAULT_EVENT_QUEUE_SIZE = 1024;

/**
 * Async wrapper: webhooks off the request hot path.
 *
 * HTTPEventEmitter awaits a network round-trip (up to its 5s timeout);
 * awaited from the middleware, that puts the webhook inside every
 * request. AsyncEventEmitter wraps any emitter with a bounded FIFO and a
 * single sequential pump so the hot path pays O(1): emit() enqueues and
 * resolves immediately.
 *
 * Semantics (mirrors Go's AsyncEventEmitter, events_async.go):
 * - emit() never blocks and never rejects. When the queue is full the
 *   incoming event is DROPPED and counted — telemetry must degrade,
 *   never the request path. Read `dropped` to alert on loss.
 * - close() stops intake and waits for the pump to drain, up to
 *   timeoutMs; on timeout it resolves `false` while the pump keeps
 *   draining in the background. Emitting after close counts as a drop.
 */
export class AsyncEventEmitter implements EventEmitterLike {
  private readonly queue: RateGuardEventEnvelope[] = [];
  private readonly queueSize: number;
  private droppedCount = 0;
  private closed = false;
  private pump: Promise<void> = Promise.resolve();
  private pumping = false;

  constructor(
    private readonly inner: EventEmitterLike,
    options: { queueSize?: number | undefined } = {},
  ) {
    this.queueSize = options.queueSize && options.queueSize > 0 ? options.queueSize : DEFAULT_EVENT_QUEUE_SIZE;
  }

  /** Events discarded (queue full, or emitted after close). */
  get dropped(): number {
    return this.droppedCount;
  }

  emit(event: RateGuardEventEnvelope): Promise<void> {
    if (this.closed || this.queue.length >= this.queueSize) {
      this.droppedCount += 1;
      return Promise.resolve();
    }
    this.queue.push(event);
    this.startPump();
    return Promise.resolve();
  }

  /**
   * Stop intake and wait for queued events to deliver. Resolves true when
   * fully drained, false if timeoutMs elapsed first (draining continues
   * in the background).
   */
  async close(timeoutMs = 5_000): Promise<boolean> {
    this.closed = true;
    let timer: ReturnType<typeof setTimeout> | undefined;
    const timedOut = new Promise<boolean>((resolve) => {
      timer = setTimeout(() => resolve(false), timeoutMs);
    });
    const drained = this.pump.then(() => true);
    const result = await Promise.race([drained, timedOut]);
    clearTimeout(timer);
    return result;
  }

  private startPump(): void {
    if (this.pumping) {
      return;
    }
    this.pumping = true;
    this.pump = this.pump.then(async () => {
      try {
        for (;;) {
          const event = this.queue.shift();
          if (!event) {
            return;
          }
          // Inner delivery failures are the inner emitter's story (the
          // HTTP emitter already logs them). A failed delivery is final —
          // no in-process retry queue by design.
          await this.inner.emit(event).catch(() => undefined);
        }
      } finally {
        this.pumping = false;
      }
    });
  }
}

/**
 * Build the default event emitter for a given SDK configuration.
 *
 * An eventEndpoint gets the async wrapper automatically so webhook
 * delivery never blocks the request path; a custom eventEmitter is used
 * exactly as given (wrap it in AsyncEventEmitter yourself if you want
 * the same behavior).
 */
export function createEventEmitter(options: ResolvedRateGuardOptions): EventEmitterLike {
  if (options.eventEmitter) {
    return options.eventEmitter;
  }
  if (options.eventEndpoint) {
    return new AsyncEventEmitter(new HTTPEventEmitter(options.eventEndpoint), {
      queueSize: options.eventQueueSize,
    });
  }
  if (options.wsUrl) {
    return new ControlPlaneEventEmitter({ wsUrl: options.wsUrl });
  }
  return new ConsoleEventEmitter();
}

/**
 * Construct the canonical RateGuard event envelope.
 */
export function buildEventEnvelope(
  eventType: RateGuardEventType,
  payload: RateGuardEventPayload,
  meta: {
    tenantId?: string;
    routeId?: string;
    upstreamId?: string;
    traceId?: string;
  },
): RateGuardEventEnvelope {
  return {
    event_id: randomUUID(),
    event_type: eventType,
    tenant_id: meta.tenantId,
    route_id: meta.routeId,
    upstream_id: meta.upstreamId,
    trace_id: meta.traceId,
    occurred_at: new Date().toISOString(),
    payload,
  };
}
