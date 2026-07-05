/**
 * Guardrail violation tracking — bounded ring buffer of recent violations
 * plus cumulative counts by code, mirroring Go's guardrail_log.go exactly.
 *
 * Deliberately excludes the request body/content that triggered a
 * violation — the log exists for operator visibility, not to store the
 * PII or injection payload it just caught.
 */

import type { GuardrailViolation } from './guardrails.js';

const GUARDRAIL_LOG_CAPACITY = 50;

/** A recorded violation: code, message, and when it happened. */
export interface GuardrailEvent {
  code: string;
  message: string;
  at: string;
}

export interface GuardrailLogStats {
  enabled: boolean;
  total?: number;
  by_code?: Record<string, number>;
  recent?: GuardrailEvent[];
}

/**
 * Small bounded ring buffer of recent violations plus cumulative counts by
 * code. Node is single-threaded so, unlike Go's mutex-guarded struct, no
 * locking is needed here.
 */
export class GuardrailLog {
  private recent: GuardrailEvent[] = [];
  private readonly counts = new Map<string, number>();
  private total = 0;

  record(violation: GuardrailViolation | null | undefined): void {
    if (!violation) {
      return;
    }

    this.total += 1;
    this.counts.set(violation.code, (this.counts.get(violation.code) ?? 0) + 1);
    this.recent.push({ code: violation.code, message: violation.message, at: new Date().toISOString() });
    if (this.recent.length > GUARDRAIL_LOG_CAPACITY) {
      this.recent = this.recent.slice(this.recent.length - GUARDRAIL_LOG_CAPACITY);
    }
  }

  /**
   * Mirrors Go's guardrailLog.Stats() shape convention — a plain object
   * ready to serialize into the admin API / list_limits MCP response.
   */
  stats(): GuardrailLogStats {
    const byCode: Record<string, number> = {};
    for (const [code, count] of this.counts) {
      byCode[code] = count;
    }

    return {
      enabled: true,
      total: this.total,
      by_code: byCode,
      recent: this.recent.slice(),
    };
  }
}
