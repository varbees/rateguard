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

/**
 * Build the default event emitter for a given SDK configuration.
 */
export function createEventEmitter(options: ResolvedRateGuardOptions): EventEmitterLike {
  if (options.eventEmitter) {
    return options.eventEmitter;
  }
  if (options.eventEndpoint) {
    return new HTTPEventEmitter(options.eventEndpoint);
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
