/**
 * Realtime session enforcement — the voice substrate.
 *
 * Voice sessions (OpenAI Realtime, Gemini Live) are one WebSocket that
 * can burn dollars per minute for hours; request-based rate limiting is
 * structurally blind to them. This module extracts token usage from
 * realtime SERVER events and budgets a session continuously.
 *
 * Transport-agnostic: RateGuard never touches the socket. The integrator
 * feeds each inbound server frame to the guard and acts on its decision.
 *
 * Schema provenance:
 * - Gemini Live: LIVE-VERIFIED 2026-07-10 against the real API
 *   (gemini-2.5-flash-native-audio-latest, free tier). usageMetadata is
 *   PER-TURN (proven with a two-turn session), with modality-split
 *   detail arrays and thoughtsTokenCount.
 * - OpenAI Realtime: documented response.done schema; live verification
 *   pending — no free tier. Counts are estimates vs the billing meter.
 *
 * Session semantics: usage events are SUMMED per session for both
 * providers — the opposite of SSE usage inside one response (MAX-merge),
 * because realtime events each describe a disjoint slice of work.
 *
 * Enforcement stance: the guard DECIDES, the integrator ACTS. Terminal
 * on first breach, onExceeded fires exactly once; close the socket with
 * a proper close frame, degrade to text, or downgrade the model. Frames
 * are never rewritten.
 */

import type { Clock } from '../types.js';

export type RealtimeProviderName = 'openai' | 'gemini';

/** One usage observation. All fields are token counts; 0 = not reported. */
export interface RealtimeUsage {
  inputTokens: number;
  outputTokens: number;
  totalTokens: number;
  inputTextTokens: number;
  inputAudioTokens: number;
  inputCachedTokens: number;
  outputTextTokens: number;
  outputAudioTokens: number;
  /** Gemini's thoughtsTokenCount. */
  thoughtsTokens: number;
}

export function emptyRealtimeUsage(): RealtimeUsage {
  return {
    inputTokens: 0,
    outputTokens: 0,
    totalTokens: 0,
    inputTextTokens: 0,
    inputAudioTokens: 0,
    inputCachedTokens: 0,
    outputTextTokens: 0,
    outputAudioTokens: 0,
    thoughtsTokens: 0,
  };
}

function addUsage(a: RealtimeUsage, b: RealtimeUsage): RealtimeUsage {
  return {
    inputTokens: a.inputTokens + b.inputTokens,
    outputTokens: a.outputTokens + b.outputTokens,
    totalTokens: a.totalTokens + b.totalTokens,
    inputTextTokens: a.inputTextTokens + b.inputTextTokens,
    inputAudioTokens: a.inputAudioTokens + b.inputAudioTokens,
    inputCachedTokens: a.inputCachedTokens + b.inputCachedTokens,
    outputTextTokens: a.outputTextTokens + b.outputTextTokens,
    outputAudioTokens: a.outputAudioTokens + b.outputAudioTokens,
    thoughtsTokens: a.thoughtsTokens + b.thoughtsTokens,
  };
}

/** Parsed view of one server frame; usage is undefined for most deltas. */
export interface RealtimeEvent {
  provider: RealtimeProviderName;
  type: string;
  usage?: RealtimeUsage;
  turnComplete: boolean;
}

function num(v: unknown): number {
  const n = Number(v ?? 0);
  return Number.isFinite(n) ? n : 0;
}

/** One OpenAI Realtime server event; usage rides "response.done". */
export function parseOpenAIRealtimeEvent(raw: string | Buffer): RealtimeEvent {
  const data = JSON.parse(typeof raw === 'string' ? raw : raw.toString('utf8')) as Record<string, unknown>;
  const type = String(data['type'] ?? 'unknown');
  const turnComplete = type === 'response.done';
  let usage: RealtimeUsage | undefined;
  if (turnComplete) {
    const response = (data['response'] ?? {}) as Record<string, unknown>;
    const u = response['usage'] as Record<string, unknown> | undefined;
    if (u) {
      const inD = (u['input_token_details'] ?? {}) as Record<string, unknown>;
      const outD = (u['output_token_details'] ?? {}) as Record<string, unknown>;
      usage = {
        inputTokens: num(u['input_tokens']),
        outputTokens: num(u['output_tokens']),
        totalTokens: num(u['total_tokens']),
        inputTextTokens: num(inD['text_tokens']),
        inputAudioTokens: num(inD['audio_tokens']),
        inputCachedTokens: num(inD['cached_tokens']),
        outputTextTokens: num(outD['text_tokens']),
        outputAudioTokens: num(outD['audio_tokens']),
        thoughtsTokens: 0,
      };
    }
  }
  return usage === undefined
    ? { provider: 'openai', type, turnComplete }
    : { provider: 'openai', type, turnComplete, usage };
}

interface GeminiModalitySpan {
  modality?: string;
  tokenCount?: number;
}

/**
 * One Gemini Live server message. usageMetadata is per-turn — verified
 * against the live API (see module comment).
 */
export function parseGeminiLiveEvent(raw: string | Buffer): RealtimeEvent {
  const data = JSON.parse(typeof raw === 'string' ? raw : raw.toString('utf8')) as Record<string, unknown>;
  let type = 'unknown';
  let turnComplete = false;
  if (data['setupComplete'] !== undefined) {
    type = 'setupComplete';
  } else if (data['serverContent'] !== undefined) {
    type = 'serverContent';
    turnComplete = Boolean((data['serverContent'] as Record<string, unknown>)['turnComplete']);
  }

  let usage: RealtimeUsage | undefined;
  const meta = data['usageMetadata'] as Record<string, unknown> | undefined;
  if (meta) {
    usage = emptyRealtimeUsage();
    usage.inputTokens = num(meta['promptTokenCount']);
    usage.outputTokens = num(meta['responseTokenCount']);
    usage.totalTokens = num(meta['totalTokenCount']);
    usage.thoughtsTokens = num(meta['thoughtsTokenCount']);
    for (const d of (meta['promptTokensDetails'] as GeminiModalitySpan[] | undefined) ?? []) {
      if (d.modality === 'TEXT') usage.inputTextTokens += num(d.tokenCount);
      else if (d.modality === 'AUDIO') usage.inputAudioTokens += num(d.tokenCount);
    }
    for (const d of (meta['responseTokensDetails'] as GeminiModalitySpan[] | undefined) ?? []) {
      if (d.modality === 'TEXT') usage.outputTextTokens += num(d.tokenCount);
      else if (d.modality === 'AUDIO') usage.outputAudioTokens += num(d.tokenCount);
    }
  }
  return usage === undefined
    ? { provider: 'gemini', type, turnComplete }
    : { provider: 'gemini', type, turnComplete, usage };
}

export function parseRealtimeEvent(provider: RealtimeProviderName, raw: string | Buffer): RealtimeEvent {
  if (provider === 'openai') return parseOpenAIRealtimeEvent(raw);
  if (provider === 'gemini') return parseGeminiLiveEvent(raw);
  throw new Error(`rateguard: unknown realtime provider ${String(provider)}`);
}

/**
 * Micro-USD per MILLION tokens per class (e.g. $32/M = 32_000_000).
 * Caller-priced: realtime pricing drifts too fast to bake in.
 */
export interface RealtimeCostRates {
  inputTextPerMTokens?: number;
  inputAudioPerMTokens?: number;
  inputCachedPerMTokens?: number;
  outputTextPerMTokens?: number;
  outputAudioPerMTokens?: number;
}

function costMicroUSD(rates: RealtimeCostRates, u: RealtimeUsage): number {
  // Cached input priced at its own rate; the un-cached remainder of text
  // input at the text rate. Absent detail splits stay zero — never guess
  // a split the provider didn't report.
  const uncachedText = Math.max(u.inputTextTokens - u.inputCachedTokens, 0);
  const total =
    uncachedText * (rates.inputTextPerMTokens ?? 0) +
    u.inputCachedTokens * (rates.inputCachedPerMTokens ?? 0) +
    u.inputAudioTokens * (rates.inputAudioPerMTokens ?? 0) +
    u.outputTextTokens * (rates.outputTextPerMTokens ?? 0) +
    u.outputAudioTokens * (rates.outputAudioPerMTokens ?? 0);
  return Math.floor(total / 1_000_000);
}

/** Bounds for one session. 0/undefined means unlimited. */
export interface RealtimeSessionLimits {
  maxTotalTokens?: number;
  /** input+output audio — the expensive class. */
  maxAudioTokens?: number;
  maxTurns?: number;
  maxDurationMs?: number;
  maxEstimatedCostMicroUSD?: number;
}

/** The guard's verdict. exceeded is terminal once committed. */
export interface RealtimeDecision {
  exceeded: boolean;
  /** "total_tokens" | "audio_tokens" | "turns" | "duration" | "cost" | "" */
  reason: string;
  totals: RealtimeUsage;
  turns: number;
  estimatedCostMicroUSD: number;
  elapsedMs: number;
}

export interface RealtimeSessionGuardOptions {
  limits?: RealtimeSessionLimits;
  costRates?: RealtimeCostRates;
  /**
   * Fires exactly once, on the observation that first breaches a limit.
   * Runs synchronously — keep it short (signal your socket loop).
   */
  onExceeded?: (decision: RealtimeDecision) => void;
  clock?: Clock;
}

/**
 * Accumulates realtime usage for ONE session and enforces its limits.
 * Create one per session.
 */
export class RealtimeSessionGuard {
  private readonly limits: RealtimeSessionLimits;
  private readonly costRates: RealtimeCostRates;
  private readonly onExceeded: ((d: RealtimeDecision) => void) | undefined;
  private readonly clock: Clock;
  private readonly startedMs: number;

  private totals = emptyRealtimeUsage();
  private turns = 0;
  private cost = 0;
  private exceeded = false;
  private reason = '';
  private notified = false;

  constructor(
    private readonly provider: RealtimeProviderName,
    options: RealtimeSessionGuardOptions = {},
  ) {
    this.limits = options.limits ?? {};
    this.costRates = options.costRates ?? {};
    this.onExceeded = options.onExceeded;
    this.clock = options.clock ?? { now: () => Date.now() };
    this.startedMs = this.clock.now();
  }

  /** Parse one inbound server frame and feed it to the guard. Throws on
   * unparseable frames without corrupting state. */
  observeRaw(raw: string | Buffer): { event: RealtimeEvent; decision: RealtimeDecision } {
    const event = parseRealtimeEvent(this.provider, raw);
    return { event, decision: this.observeEvent(event) };
  }

  observeEvent(ev: RealtimeEvent): RealtimeDecision {
    if (ev.usage) {
      this.totals = addUsage(this.totals, ev.usage);
      this.cost += costMicroUSD(this.costRates, ev.usage);
    }
    if (ev.turnComplete) {
      this.turns += 1;
    }
    return this.commit();
  }

  /**
   * An observation of nothing but time — for a timer loop enforcing
   * maxDurationMs on a quiet session. Mutating like observeEvent.
   */
  tick(): RealtimeDecision {
    return this.commit();
  }

  /**
   * Pre-flight verdict: no state change, never fires onExceeded. A
   * not-yet-committed duration breach is REPORTED (derived from the
   * clock) but not stored — the next observe/tick commits it.
   */
  peek(): RealtimeDecision {
    const elapsed = this.clock.now() - this.startedMs;
    const decision = this.decision(elapsed);
    if (!this.exceeded) {
      const reason = this.breach(elapsed);
      if (reason) {
        return { ...decision, exceeded: true, reason };
      }
    }
    return decision;
  }

  private breach(elapsedMs: number): string {
    const l = this.limits;
    if (l.maxTotalTokens && this.totals.totalTokens > l.maxTotalTokens) return 'total_tokens';
    if (l.maxAudioTokens && this.totals.inputAudioTokens + this.totals.outputAudioTokens > l.maxAudioTokens) {
      return 'audio_tokens';
    }
    if (l.maxTurns && this.turns > l.maxTurns) return 'turns';
    if (l.maxDurationMs && elapsedMs > l.maxDurationMs) return 'duration';
    if (l.maxEstimatedCostMicroUSD && this.cost > l.maxEstimatedCostMicroUSD) return 'cost';
    return '';
  }

  private commit(): RealtimeDecision {
    const elapsed = this.clock.now() - this.startedMs;
    if (!this.exceeded) {
      const reason = this.breach(elapsed);
      if (reason) {
        this.exceeded = true;
        this.reason = reason;
      }
    }
    const decision = this.decision(elapsed);
    if (this.exceeded && !this.notified && this.onExceeded) {
      this.notified = true;
      this.onExceeded(decision);
    }
    return decision;
  }

  private decision(elapsedMs: number): RealtimeDecision {
    return {
      exceeded: this.exceeded,
      reason: this.reason,
      totals: { ...this.totals },
      turns: this.turns,
      estimatedCostMicroUSD: this.cost,
      elapsedMs,
    };
  }
}
