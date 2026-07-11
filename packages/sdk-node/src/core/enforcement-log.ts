import type { Clock } from '../types.js';

/**
 * One record of RateGuard intervening on an outbound call: a budget it stopped,
 * a rate limit it hit, a freeze it enforced. The pull-side audit trail behind
 * "where did the spend go, and when did enforcement fire" — queryable in-process
 * (RateGuard.enforcementEvents) and over the admin API (GET /admin/events),
 * never requiring a webhook. Mirrors Go's EnforcementEvent.
 */
export interface EnforcementEvent {
  at: string; // ISO-8601 timestamp
  type: string; // token_budget_exceeded, rate_limited, frozen
  customer?: string;
  provider?: string;
  model?: string;
  detail?: string;
}

/**
 * Bounded ring buffer of the most recent enforcement events. Fixed memory: the
 * oldest is overwritten once full, so a long-running process never grows it.
 */
export class EnforcementLog {
  private readonly buf: EnforcementEvent[];
  private head = 0;
  private full = false;
  private total = 0;

  constructor(
    private readonly clock: Clock,
    capacity = 1000,
  ) {
    this.buf = new Array<EnforcementEvent>(capacity);
  }

  record(event: Omit<EnforcementEvent, 'at'> & { at?: string }): void {
    const record: EnforcementEvent = { ...event, at: event.at ?? new Date(this.clock.now()).toISOString() };
    this.buf[this.head] = record;
    this.head = (this.head + 1) % this.buf.length;
    if (this.head === 0) this.full = true;
    this.total += 1;
  }

  /** Up to `limit` of the most recent events, newest first. limit <= 0 returns all. */
  recent(limit: number): EnforcementEvent[] {
    const n = this.buf.length;
    const count = this.full ? n : this.head;
    const take = limit <= 0 || limit > count ? count : limit;
    const out: EnforcementEvent[] = [];
    for (let i = 0; i < take; i += 1) {
      out.push(this.buf[(this.head - 1 - i + n) % n]!);
    }
    return out;
  }

  lifetimeTotal(): number {
    return this.total;
  }
}
