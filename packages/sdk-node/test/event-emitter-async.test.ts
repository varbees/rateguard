/**
 * AsyncEventEmitter: webhooks off the request hot path — mirrors Go's
 * events_async_test.go semantics in single-threaded terms.
 */

import { describe, expect, it } from 'vitest';

import { AsyncEventEmitter, buildEventEnvelope, createEventEmitter } from '../src/core/event-emitter.js';
import { RateGuardRuntime } from '../src/runtime.js';
import { resolveRateGuardOptions } from '../src/config.js';
import type { RateGuardEventEnvelope } from '../src/types.js';

function envelope(id: string): RateGuardEventEnvelope {
  const e = buildEventEnvelope('request.completed', { method: 'GET', path: '/x', status_code: 200, latency_ms: 1 } as never, {});
  return { ...e, event_id: id };
}

/**
 * Inner emitter whose deliveries block until released. Releases are
 * credits: a release issued before the pump reaches the next event still
 * lets that event through (the pump processes sequentially, so waiters
 * can register after the release call).
 */
class GatedEmitter {
  readonly delivered: string[] = [];
  private waiters: Array<() => void> = [];
  private credits = 0;

  emit(event: RateGuardEventEnvelope): Promise<void> {
    return new Promise((resolve) => {
      const deliver = () => {
        this.delivered.push(event.event_id);
        resolve();
      };
      if (this.credits > 0) {
        this.credits -= 1;
        deliver();
        return;
      }
      this.waiters.push(deliver);
    });
  }

  release(n = 1): void {
    for (let i = 0; i < n; i++) {
      const w = this.waiters.shift();
      if (w) {
        w();
      } else {
        this.credits += 1;
      }
    }
  }
}

class InstantEmitter {
  readonly delivered: string[] = [];
  async emit(event: RateGuardEventEnvelope): Promise<void> {
    this.delivered.push(event.event_id);
  }
}

describe('AsyncEventEmitter', () => {
  it('emit resolves immediately even when delivery is blocked', async () => {
    const inner = new GatedEmitter();
    const e = new AsyncEventEmitter(inner, { queueSize: 8 });

    // With delivery fully blocked, emit must still resolve on its own —
    // a race against a zero-delay timer proves it doesn't wait on inner.
    let resolved = false;
    await e.emit(envelope('a')).then(() => {
      resolved = true;
    });
    expect(resolved).toBe(true);
    expect(inner.delivered).toHaveLength(0); // still blocked — not delivered

    inner.release(1);
    await e.close(1_000);
    expect(inner.delivered).toEqual(['a']);
  });

  it('delivers in order and drains on close', async () => {
    const inner = new InstantEmitter();
    const e = new AsyncEventEmitter(inner, { queueSize: 8 });
    for (const id of ['1', '2', '3', '4', '5']) {
      await e.emit(envelope(id));
    }
    expect(await e.close(1_000)).toBe(true);
    expect(inner.delivered).toEqual(['1', '2', '3', '4', '5']);
    expect(e.dropped).toBe(0);
  });

  it('drops on overflow and counts, never blocks', async () => {
    const inner = new GatedEmitter();
    const e = new AsyncEventEmitter(inner, { queueSize: 2 });

    // First emit starts the pump (in-flight, blocked); the queue then
    // holds up to 2; everything beyond drops.
    for (let i = 0; i < 13; i++) {
      await e.emit(envelope(String(i)));
    }
    expect(e.dropped).toBe(10); // 1 in flight + 2 queued accepted

    inner.release(3);
    expect(await e.close(1_000)).toBe(true);
    expect(inner.delivered.length + e.dropped).toBe(13);
  });

  it('close times out honestly and keeps draining in background', async () => {
    const inner = new GatedEmitter();
    const e = new AsyncEventEmitter(inner, { queueSize: 4 });
    await e.emit(envelope('slow'));

    expect(await e.close(30)).toBe(false); // blocked → timeout

    inner.release(1);
    expect(await e.close(1_000)).toBe(true); // drain observed
    expect(inner.delivered).toEqual(['slow']);
  });

  it('emit after close drops without throwing', async () => {
    const inner = new InstantEmitter();
    const e = new AsyncEventEmitter(inner, {});
    await e.close(100);
    await e.emit(envelope('late'));
    expect(e.dropped).toBe(1);
    expect(inner.delivered).toHaveLength(0);
  });

  it('inner delivery failures never reject the pump', async () => {
    const failing = {
      async emit(): Promise<void> {
        throw new Error('endpoint down');
      },
    };
    const e = new AsyncEventEmitter(failing, {});
    await e.emit(envelope('x'));
    await e.emit(envelope('y'));
    expect(await e.close(1_000)).toBe(true); // pump survived both failures
  });
});

describe('runtime wiring', () => {
  it('eventEndpoint config produces the async wrapper', () => {
    const resolved = resolveRateGuardOptions({ eventEndpoint: 'http://127.0.0.1:9/events' });
    expect(createEventEmitter(resolved)).toBeInstanceOf(AsyncEventEmitter);
  });

  it('a custom eventEmitter is used exactly as given', () => {
    const custom = new InstantEmitter();
    const resolved = resolveRateGuardOptions({ eventEmitter: custom });
    expect(createEventEmitter(resolved)).toBe(custom);
  });

  it('runtime.shutdown drains the async queue', async () => {
    const runtime = new RateGuardRuntime({ eventEndpoint: 'http://127.0.0.1:9/events' });
    // Port 9 (discard) is unreachable — delivery fails fast; shutdown
    // must still drain and resolve true.
    expect(runtime.eventEmitter).toBeInstanceOf(AsyncEventEmitter);
    expect(await runtime.shutdown(5_000)).toBe(true);
  });
});
