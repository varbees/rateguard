import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { estimateTokens, estimateWith, TokenLimitGuardrail, type Tokenizer } from '../src/index.js';

const vectorsPath = fileURLToPath(new URL('../../../conformance/token_estimate_vectors.json', import.meta.url));
const vectors = JSON.parse(readFileSync(vectorsPath, 'utf-8')) as {
  vectors: Array<{ name: string; text: string; expected_tokens: number }>;
};

describe('CJK-aware token estimation', () => {
  it('matches the shared conformance oracle (Go/Node/Python must agree)', () => {
    expect(vectors.vectors.length).toBeGreaterThan(0);
    for (const vec of vectors.vectors) {
      expect(estimateTokens(vec.text), vec.name).toBe(vec.expected_tokens);
    }
  });

  it('does not undercount CJK the way length/4 did', () => {
    expect(estimateTokens('你好世界')).toBe(4);
    expect(estimateTokens('你好世界')).not.toBe(Math.floor('你好世界'.length / 4)); // old: 1
  });

  it('token-limit guardrail blocks a CJK prompt that length/4 would miss', () => {
    const prompt = '字'.repeat(40); // ~40 tokens
    const guard = new TokenLimitGuardrail(20);
    expect(guard.check(prompt)?.code).toBe('token_limit_exceeded');
    expect(guard.check('a'.repeat(40))).toBeNull(); // 40 ASCII ~= 10 tokens, under limit
  });

  it('accepts a custom tokenizer', () => {
    const huge: Tokenizer = { estimateTokens: () => 10_000 };
    const guard = new TokenLimitGuardrail(100, huge);
    expect(guard.check('hi')?.code).toBe('token_limit_exceeded');
    expect(estimateWith(huge, 'hi')).toBe(10_000);
    expect(estimateWith(undefined, 'hi')).toBe(estimateTokens('hi'));
  });
});
