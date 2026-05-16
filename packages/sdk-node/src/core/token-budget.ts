import { BoundedCache } from './bounded-cache.js';
import { extractTokenUsageFromHeaders, extractTokenUsageFromText } from './utils.js';
import type {
  Clock,
  RateGuardEventPayload,
  ResponseSnapshot,
  TokenBudgetDecision,
  TokenBudgetMode,
  TokenBudgetOptions,
  TokenUsage,
} from '../types.js';

interface TokenBudgetRecord {
  at: number;
  tokens: number;
}

interface TokenBudgetState {
  records: TokenBudgetRecord[];
  reservations: Map<string, TokenBudgetRecord>;
  nextReservationId: number;
}

export interface TokenBudgetReservation {
  decision: TokenBudgetDecision;
  reservationId?: string;
}

const reservationTtlMs = 15 * 60 * 1000;

/**
 * Rolling-window token budget manager.
 */
export class TokenBudgetManager {
  private readonly clock: Clock;
  private readonly states: BoundedCache<string, TokenBudgetState>;

  constructor(options: { clock: Clock; capacity?: number }) {
    this.clock = options.clock;
    this.states = new BoundedCache<string, TokenBudgetState>(options.capacity ?? 50_000);
  }

  check(key: string, options: Required<TokenBudgetOptions>): TokenBudgetDecision {
    const usage = this.usage(key, options);
    return decisionFromUsage(usage, options);
  }

  reserve(key: string, options: Required<TokenBudgetOptions>): TokenBudgetReservation {
    const decision = this.check(key, options);
    if (!decision.allowed || !decision.applied || options.mode !== 'hard-stop' || decision.remaining <= 0) {
      return { decision };
    }

    const state = this.state(key);
    state.nextReservationId += 1;
    const reservationId = String(state.nextReservationId);
    state.reservations.set(reservationId, {
      at: this.clock.now(),
      tokens: decision.remaining,
    });

    return {
      decision: {
        ...decision,
        remaining: 0,
      },
      reservationId,
    };
  }

  record(key: string, tokens: number): void {
    if (tokens <= 0) {
      return;
    }

    const now = this.clock.now();
    const state = this.state(key);
    state.records.push({ at: now, tokens });
  }

  recordFromSnapshot(key: string, snapshot: ResponseSnapshot, reservationId?: string): TokenUsage | undefined {
    const usage = extractTokenUsageFromHeaders(snapshot.headers) ?? extractTokenUsageFromText(snapshot.body);
    if (!usage) {
      this.releaseReservation(key, reservationId);
      return undefined;
    }

    this.commitReservation(key, reservationId, usage.totalTokens);
    return usage;
  }

  commitReservation(key: string, reservationId: string | undefined, tokens: number): void {
    if (reservationId) {
      this.releaseReservation(key, reservationId);
    }
    this.record(key, tokens);
  }

  releaseReservation(key: string, reservationId: string | undefined): void {
    if (!reservationId) {
      return;
    }
    this.state(key).reservations.delete(reservationId);
  }

  usage(key: string, options: Required<TokenBudgetOptions>): {
    hour: number;
    day: number;
    month: number;
    maxUsage: number;
    retryAfterMs: number;
    window: 'hour' | 'day' | 'month' | '';
  } {
    const now = this.clock.now();
    const state = this.state(key);
    const maxWindow = maxWindowDuration(options);
    state.records = pruneRecords(state.records, now, maxWindow);
    pruneReservations(state, now);
    const records = activeRecords(state.records, state.reservations, now, maxWindow);

    const hour = sumWithin(records, now, 60 * 60 * 1000);
    const day = sumWithin(records, now, 24 * 60 * 60 * 1000);
    const month = sumWithin(records, now, 30 * 24 * 60 * 60 * 1000);

    const hourlyLimit = options.hourLimit;
    const dailyLimit = options.dayLimit;
    const monthlyLimit = options.monthLimit;

    const active = activeWindowUsage(hour, day, month, options);
    const retryAfterMs = determineRetryAfter(records, now, hourlyLimit, dailyLimit, monthlyLimit);

    return {
      hour,
      day,
      month,
      maxUsage: active.used,
      retryAfterMs,
      window: active.window,
    };
  }

  private state(key: string): TokenBudgetState {
    return this.states.getOrCreate(key, () => ({
      records: [],
      reservations: new Map<string, TokenBudgetRecord>(),
      nextReservationId: 0,
    }));
  }
}

function pruneRecords(records: TokenBudgetRecord[], now: number, maxWindowMs: number): TokenBudgetRecord[] {
  if (maxWindowMs <= 0) {
    return [];
  }

  const cutoff = now - maxWindowMs;
  let index = 0;
  while (index < records.length) {
    const current = records[index];
    if (!current || current.at > cutoff) {
      break;
    }
    index += 1;
  }

  if (index === 0) {
    return records;
  }
  if (index >= records.length) {
    return [];
  }

  records.splice(0, index);
  return records;
}

function pruneReservations(state: TokenBudgetState, now: number): void {
  for (const [id, reservation] of state.reservations) {
    if (now - reservation.at >= reservationTtlMs) {
      state.reservations.delete(id);
    }
  }
}

function activeRecords(
  records: TokenBudgetRecord[],
  reservations: Map<string, TokenBudgetRecord>,
  now: number,
  maxWindowMs: number,
): TokenBudgetRecord[] {
  if (reservations.size === 0) {
    return records;
  }
  const cutoff = now - maxWindowMs;
  const active = records.slice();
  for (const reservation of reservations.values()) {
    if (maxWindowMs > 0 && reservation.at <= cutoff) {
      continue;
    }
    active.push(reservation);
  }
  return active;
}

function sumWithin(records: TokenBudgetRecord[], now: number, windowMs: number): number {
  const cutoff = now - windowMs;
  let total = 0;
  for (const record of records) {
    if (record.at > cutoff) {
      total += record.tokens;
    }
  }
  return total;
}

function determineRetryAfter(
  records: TokenBudgetRecord[],
  now: number,
  hourLimit: number,
  dayLimit: number,
  monthLimit: number,
): number {
  const windows: Array<[number, number]> = [
    [hourLimit, 60 * 60 * 1000],
    [dayLimit, 24 * 60 * 60 * 1000],
    [monthLimit, 30 * 24 * 60 * 60 * 1000],
  ];

  let maxRetry = 0;
  for (const [limit, windowMs] of windows) {
    if (limit <= 0) {
      continue;
    }
    const total = sumWithin(records, now, windowMs);
    if (total < limit) {
      continue;
    }
    for (const record of records) {
      if (record.at > now - windowMs) {
        maxRetry = Math.max(maxRetry, record.at + windowMs - now);
        break;
      }
    }
  }

  return Math.max(0, maxRetry);
}

function maxWindowDuration(options: Required<TokenBudgetOptions>): number {
  if (options.monthLimit > 0) {
    return 30 * 24 * 60 * 60 * 1000;
  }
  if (options.dayLimit > 0) {
    return 24 * 60 * 60 * 1000;
  }
  if (options.hourLimit > 0) {
    return 60 * 60 * 1000;
  }
  return 0;
}

function decisionFromUsage(
  usage: {
    hour: number;
    day: number;
    month: number;
    maxUsage: number;
    retryAfterMs: number;
    window: 'hour' | 'day' | 'month' | '';
  },
  options: Required<TokenBudgetOptions>,
): TokenBudgetDecision {
  const active = activeWindowUsage(usage.hour, usage.day, usage.month, options);
  const limit = active.limit;
  const warning = options.mode === 'soft-stop' && limit > 0 && active.used >= limit * options.softStopAt;

  if (options.mode === 'soft-stop') {
    return {
      allowed: true,
      applied: limit > 0,
      queued: false,
      remaining: limit > 0 ? Math.max(0, limit - active.used) : -1,
      retryAfterMs: 0,
      limit,
      window: active.window,
      warning,
    };
  }

  if (active.exceededWindow) {
    return {
      allowed: false,
      applied: true,
      queued: false,
      remaining: 0,
      retryAfterMs: usage.retryAfterMs,
      limit,
      window: active.window,
      warning: false,
    };
  }

  return {
    allowed: true,
    applied: limit > 0,
    queued: false,
    remaining: limit > 0 ? Math.max(0, limit - active.used) : -1,
    retryAfterMs: 0,
    limit,
    window: active.window,
    warning,
  };
}

function activeWindowUsage(
  hour: number,
  day: number,
  month: number,
  options: Required<TokenBudgetOptions>,
): {
  window: 'hour' | 'day' | 'month' | '';
  used: number;
  limit: number;
  exceededWindow: boolean;
} {
  const hourActive = options.hourLimit > 0;
  const dayActive = options.dayLimit > 0;
  const monthActive = options.monthLimit > 0;

  if (hourActive && (!dayActive || options.hourLimit <= options.dayLimit) && (!monthActive || options.hourLimit <= options.monthLimit)) {
    return {
      window: 'hour',
      used: hour,
      limit: options.hourLimit,
      exceededWindow: hour >= options.hourLimit,
    };
  }

  if (dayActive && (!monthActive || options.dayLimit <= options.monthLimit)) {
    return {
      window: 'day',
      used: day,
      limit: options.dayLimit,
      exceededWindow: day >= options.dayLimit,
    };
  }

  if (monthActive) {
    return {
      window: 'month',
      used: month,
      limit: options.monthLimit,
      exceededWindow: month >= options.monthLimit,
    };
  }

  return {
    window: '',
    used: 0,
    limit: 0,
    exceededWindow: false,
  };
}
