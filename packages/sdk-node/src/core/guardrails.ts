/**
 * Content Guardrails — prompt-level safety checks.
 *
 * Guardrails run BEFORE the LLM call. They reject prompts that contain
 * sensitive data (PII), prompt injection attempts, or toxic content.
 * Each guardrail is pluggable — bring your own or use built-ins.
 */

export interface GuardrailViolation {
  code: string;     // e.g. "pii_detected", "prompt_injection"
  message: string;  // human-readable explanation
  score: number;    // 0.0–1.0 severity
}

export interface Guardrail {
  check(content: string): GuardrailViolation | null;
}

/** Runs multiple guardrails in order. Stops at first violation. */
export class GuardrailChain implements Guardrail {
  private guardrails: Guardrail[];

  constructor(guardrails: Guardrail[]) {
    this.guardrails = guardrails;
  }

  check(content: string): GuardrailViolation | null {
    for (const g of this.guardrails) {
      const violation = g.check(content);
      if (violation) return violation;
    }
    return null;
  }
}

// ── Built-in guardrails ──

const CC_REGEX = /\b(?:\d[ -]*?){13,16}\b/;
const EMAIL_REGEX = /\b[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Z|a-z]{2,}\b/;
const PHONE_REGEX = /\b(?:\+\d{1,3}[-.]?)?\(?\d{3}\)?[-.]?\d{3}[-.]?\d{4}\b/;
const SSN_REGEX = /\b\d{3}[-]?\d{2}[-]?\d{4}\b/;

export class PIIGuardrail implements Guardrail {
  check(content: string): GuardrailViolation | null {
    if (CC_REGEX.test(content) || EMAIL_REGEX.test(content) ||
        PHONE_REGEX.test(content) || SSN_REGEX.test(content)) {
      return { code: 'pii_detected', message: 'prompt contains PII', score: 0.9 };
    }
    return null;
  }
}

const INJECTION_PATTERNS = [
  /ignore\s+(all\s+)?(previous|prior|above|your)\s+(instructions?|prompts?|rules?)/i,
  /you\s+are\s+now\s+(a\s+)?(DAN|jailbreak|unfiltered|evil|malicious)/i,
  /(print|show|reveal|display|output)\s+(your\s+)?(system\s+(prompt|message|instructions?)|initial\s+prompt)/i,
  /(from\s+now\s+on|starting\s+now|henceforth)\s+(you\s+(will|must|are))/i,
  /(decode|decrypt|translate)\s+(this|the\s+following)\s+(base64|hex|encoded|encrypted)/i,
];

export class PromptInjectionGuardrail implements Guardrail {
  check(content: string): GuardrailViolation | null {
    for (const p of INJECTION_PATTERNS) {
      if (p.test(content)) {
        return { code: 'prompt_injection', message: 'potential prompt injection', score: 0.8 };
      }
    }
    return null;
  }
}

export class TokenLimitGuardrail implements Guardrail {
  constructor(private maxTokens: number) {}
  check(content: string): GuardrailViolation | null {
    if (content.length / 4 > this.maxTokens) {
      return { code: 'token_limit_exceeded', message: 'prompt exceeds token limit', score: 1.0 };
    }
    return null;
  }
}

export class MaxLengthGuardrail implements Guardrail {
  constructor(private maxBytes: number) {}
  check(content: string): GuardrailViolation | null {
    if (content.length > this.maxBytes) {
      return { code: 'content_too_long', message: 'prompt exceeds byte limit', score: 1.0 };
    }
    return null;
  }
}

export function standardGuardrails(): GuardrailChain {
  return new GuardrailChain([
    new PIIGuardrail(),
    new PromptInjectionGuardrail(),
    new MaxLengthGuardrail(100_000),
  ]);
}

export function strictGuardrails(): GuardrailChain {
  return new GuardrailChain([
    new PIIGuardrail(),
    new PromptInjectionGuardrail(),
    new TokenLimitGuardrail(32_000),
    new MaxLengthGuardrail(50_000),
  ]);
}
