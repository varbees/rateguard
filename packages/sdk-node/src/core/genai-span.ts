/**
 * Public GenAI observability API — the stateful facade on top of the pure
 * attribute builders in genai.ts (`genaiSpanAttributes`/`genaiSpanEndAttributes`).
 *
 * Port of packages/sdk-go/genai_observability.go's `SDK.StartGenAICall` /
 * `GenAISpan.{RecordChunk,End}`. Go wires these into real OTel
 * tracer/meter providers (`s.otel`); Node's SDK does not bundle an OTel
 * dependency (rule 3 — no new dependencies without reason), so `GenAISpan`
 * computes the exact same merged `GenAICall` and end-of-span attributes Go's
 * `genaiObserver.EndSpan` publishes, and hands them to an optional observer
 * callback — bring your own OTel/Datadog/Grafana exporter, or omit the
 * observer and just use the returned `GenAICall` for logging/assertions.
 */

import type { Clock } from '../types.js';
import { estimateCost, genaiSpanAttributes, genaiSpanEndAttributes, type GenAICall } from './genai.js';

/** Observes GenAI span lifecycle events — bring your own exporter. */
export interface GenAIObserver {
  onSpanStart?(attrs: Record<string, string | number | boolean>, call: GenAICall): void;
  onSpanEnd?(attrs: Record<string, string | number | boolean>, call: GenAICall, latencyMs: number, error?: Error): void;
}

const ZERO_CALL: GenAICall = {
  model: '',
  provider: '',
  operation: 'chat',
  promptTokens: 0,
  completionTokens: 0,
  totalTokens: 0,
  streaming: false,
  streamChunks: 0,
  timeToFirstChunkMs: 0,
  timePerOutputChunkMs: 0,
  estimatedCostUSD: 0,
  rateLimitApplied: false,
  tokenBudgetApplied: false,
  tokenBudgetRemaining: 0,
  circuitBreakerState: 'closed',
};

/** Tracks one in-flight LLM call started with `startGenAICall`. */
export class GenAISpan {
  private readonly clock: Clock;
  private readonly observer: GenAIObserver | undefined;
  private readonly call: GenAICall;
  private readonly startedAt: number;
  private firstChunkAt: number | undefined;
  private chunks = 0;
  private finalCall: GenAICall | undefined;

  constructor(call: Partial<GenAICall>, clock: Clock, observer?: GenAIObserver) {
    this.clock = clock;
    this.observer = observer;
    this.call = { ...ZERO_CALL, ...call };
    this.startedAt = clock.now();
    this.observer?.onSpanStart?.(genaiSpanAttributes(this.call), this.call);
  }

  /** Marks a streaming chunk. The first call records time-to-first-chunk. */
  recordChunk(): void {
    this.chunks += 1;
    if (this.firstChunkAt === undefined) {
      this.firstChunkAt = this.clock.now();
    }
  }

  /**
   * Completes the span with final usage. Non-zero/non-empty fields in
   * `final` win over the values captured at start; zero-value fields fall
   * back to the start-time call. Cost is estimated automatically from the
   * pricing table (`estimateCost`) when not explicitly provided. Returns the
   * merged call so callers who don't wire an observer can still
   * log/inspect it. Calling `end` more than once is a no-op after the
   * first call.
   */
  end(final: Partial<GenAICall> = {}, error?: Error): GenAICall {
    if (this.finalCall) {
      return this.finalCall;
    }

    const call: GenAICall = { ...this.call };
    if (final.model) call.model = final.model;
    if (final.provider) call.provider = final.provider;
    if (final.operation) call.operation = final.operation;
    if (typeof final.promptTokens === 'number' && final.promptTokens > 0) call.promptTokens = final.promptTokens;
    if (typeof final.completionTokens === 'number' && final.completionTokens > 0) call.completionTokens = final.completionTokens;
    if (typeof final.totalTokens === 'number' && final.totalTokens > 0) call.totalTokens = final.totalTokens;
    if (call.totalTokens === 0) {
      call.totalTokens = call.promptTokens + call.completionTokens;
    }
    if (typeof final.estimatedCostUSD === 'number' && final.estimatedCostUSD > 0) call.estimatedCostUSD = final.estimatedCostUSD;
    if (call.estimatedCostUSD === 0) {
      call.estimatedCostUSD = estimateCost(call.model, call.promptTokens, call.completionTokens);
    }
    if (final.responseId) call.responseId = final.responseId;
    if (final.conversationId) call.conversationId = final.conversationId;

    const latencyMs = Math.max(0, this.clock.now() - this.startedAt);
    if (this.chunks > 0) {
      call.streaming = true;
      call.streamChunks = this.chunks;
      if (this.firstChunkAt !== undefined) {
        call.timeToFirstChunkMs = this.firstChunkAt - this.startedAt;
      }
      call.timePerOutputChunkMs = latencyMs / this.chunks;
    }
    if (typeof final.streamChunks === 'number' && final.streamChunks > 0) call.streamChunks = final.streamChunks;
    if (typeof final.timeToFirstChunkMs === 'number' && final.timeToFirstChunkMs > 0) call.timeToFirstChunkMs = final.timeToFirstChunkMs;
    if (typeof final.timePerOutputChunkMs === 'number' && final.timePerOutputChunkMs > 0) {
      call.timePerOutputChunkMs = final.timePerOutputChunkMs;
    }

    this.observer?.onSpanEnd?.(genaiSpanEndAttributes(call, latencyMs / 1000, error), call, latencyMs, error);
    this.finalCall = call;
    return call;
  }
}

/**
 * Opens a GenAI observability span for one LLM call. Wrap every provider
 * call:
 *
 *   const span = startGenAICall(clock, { provider: 'openai', model: 'gpt-4o', operation: 'chat' });
 *   const resp = await client.chat(req);
 *   span.end({ promptTokens: usage.input, completionTokens: usage.output });
 */
export function startGenAICall(clock: Clock, call: Partial<GenAICall> = {}, observer?: GenAIObserver): GenAISpan {
  return new GenAISpan(call, clock, observer);
}
