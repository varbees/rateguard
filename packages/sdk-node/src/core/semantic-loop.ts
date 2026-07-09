/**
 * Semantic Loop Detection — catching the paraphrase loop.
 *
 * SHA-256 fingerprinting (loop detection) catches an agent repeating
 * itself byte-for-byte. It provably cannot catch the loop that actually
 * produced the documented $47K incident: two agents ping-ponging messages
 * that were semantically identical but worded differently on every turn.
 *
 * SemanticLoopDetector closes that gap: it embeds each step locally (see
 * static-embedder.ts — no network, no inference runtime) and compares the
 * incoming step against a sliding window of the sequence's recent steps.
 * Enough near-duplicates inside the window means the agent is circling.
 *
 * Defaults are calibrated against measured potion-base-2M cosine
 * separations (2026-07-09, mirrored from the Go reference): tight
 * paraphrases of one ask score 0.92-0.99; enumeration workloads (same
 * template, different entity) top out near 0.80; genuinely distinct task
 * steps stay under 0.67. The 0.90 default threshold sits in the gap.
 *
 * Honest limitation: loosely reworded repeats (measured 0.73-0.86) are
 * indistinguishable from enumeration at this model size and will NOT be
 * caught by the default — lowering the threshold below ~0.85 trades that
 * for false positives on template workloads.
 */

import { BoundedCache } from './bounded-cache.js';
import { cosineSimilarity, type Embedder } from './semantic-cache.js';

export const DEFAULT_SEMANTIC_LOOP_WINDOW = 8;
export const DEFAULT_SEMANTIC_LOOP_THRESHOLD = 0.9;
export const DEFAULT_SEMANTIC_LOOP_MIN_REPEATS = 2;
export const DEFAULT_SEMANTIC_LOOP_MAX_KEYS = 10000;

export interface SemanticLoopOptions {
  /** Recent steps kept per key. Default 8. */
  window?: number;
  /**
   * Cosine similarity at or above which two steps count as the same step
   * reworded. Default 0.90 — measured to separate reworded repeats
   * (0.92+) from same-template/different-entity steps (≤0.80) on
   * potion-base-2M; see the module comment for the data.
   */
  threshold?: number;
  /**
   * Window entries that must match the incoming step for a loop.
   * Default 2 — a two-agent ping-pong trips on the third appearance.
   */
  minRepeats?: number;
  /** Bound on distinct tracked sequence keys (LRU). Default 10000. */
  maxKeys?: number;
}

/** Outcome of a semantic loop check. */
export interface SemanticLoopDecision {
  /** True when the incoming step matched minRepeats+ window entries. */
  loop: boolean;
  /** How many window entries matched at or above the threshold. */
  matches: number;
  /** Highest cosine similarity observed (0 when the window is empty). */
  maxSimilarity: number;
}

interface SemanticWindow {
  vecs: number[][];
}

/**
 * Detects reworded agent loops via local embeddings. State is guarded by
 * JS's single-threaded execution; embedding happens outside the critical
 * section.
 */
export class SemanticLoopDetector {
  private readonly window: number;
  private readonly threshold: number;
  private readonly minRepeats: number;
  private readonly windows: BoundedCache<string, SemanticWindow>;

  constructor(
    private readonly embedder: Embedder,
    options: SemanticLoopOptions = {},
  ) {
    this.window = options.window && options.window > 0 ? options.window : DEFAULT_SEMANTIC_LOOP_WINDOW;
    this.threshold =
      options.threshold && options.threshold > 0 ? options.threshold : DEFAULT_SEMANTIC_LOOP_THRESHOLD;
    this.minRepeats =
      options.minRepeats && options.minRepeats > 0 ? options.minRepeats : DEFAULT_SEMANTIC_LOOP_MIN_REPEATS;
    const maxKeys = options.maxKeys && options.maxKeys > 0 ? options.maxKeys : DEFAULT_SEMANTIC_LOOP_MAX_KEYS;
    this.windows = new BoundedCache(maxKeys);
  }

  /**
   * Embed the step, compare against the key's recent window, and record
   * it for future checks. Recording happens regardless of the decision so
   * an operator who continues past a warning still has an accurate window.
   */
  async check(key: string, stepText: string): Promise<SemanticLoopDecision> {
    return this.evaluate(key, stepText, true);
  }

  /**
   * Non-consuming pre-flight variant: same decision, but the step is NOT
   * recorded. Rule: pre-flight queries never mutate state.
   */
  async peek(key: string, stepText: string): Promise<SemanticLoopDecision> {
    return this.evaluate(key, stepText, false);
  }

  /** Forget a key's window — call when a sequence legitimately restarts. */
  reset(key: string): void {
    this.windows.delete(key);
  }

  private async evaluate(key: string, stepText: string, record: boolean): Promise<SemanticLoopDecision> {
    const vec = await this.embedder.embed(stepText);

    const w = this.windows.get(key) ?? { vecs: [] };

    let matches = 0;
    let maxSimilarity = 0;
    for (const prev of w.vecs) {
      const sim = cosineSimilarity(vec, prev);
      if (sim > maxSimilarity) maxSimilarity = sim;
      if (sim >= this.threshold) matches++;
    }
    const loop = matches >= this.minRepeats;

    if (record) {
      w.vecs.push([...vec]);
      if (w.vecs.length > this.window) {
        w.vecs.splice(0, w.vecs.length - this.window);
      }
      this.windows.set(key, w);
    }
    return { loop, matches, maxSimilarity };
  }
}
