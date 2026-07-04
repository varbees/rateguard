import { describe, it, expect } from 'vitest';
import { LoopDetector } from '../src/core/mcp.js';

describe('LoopDetector', () => {
  it('produces identical fingerprints for identical inputs', () => {
    const fp1 = LoopDetector.fingerprint('system-a', 'user-input', 'tool-defs');
    const fp2 = LoopDetector.fingerprint('system-a', 'user-input', 'tool-defs');
    expect(fp1).toBe(fp2);
    expect(fp1).toHaveLength(64);
  });

  it('produces different fingerprints for different inputs', () => {
    const fp1 = LoopDetector.fingerprint('system-a', 'user-input', '');
    const fp2 = LoopDetector.fingerprint('system-b', 'user-input', '');
    expect(fp1).not.toBe(fp2);
  });

  it('allows first occurrence at any depth', () => {
    const ld = new LoopDetector(50);
    const fp = LoopDetector.fingerprint('system', 'hello', '');
    const result = ld.check(fp, 1);
    expect(result.allowed).toBe(true);
  });

  it('allows same fingerprint at same depth (retry)', () => {
    const ld = new LoopDetector(50);
    const fp = LoopDetector.fingerprint('system', 'hello', '');
    ld.check(fp, 1);
    const result = ld.check(fp, 1);
    expect(result.allowed).toBe(true);
  });

  it('detects loop when fingerprint repeats at higher depth', () => {
    const ld = new LoopDetector(50);
    const fp = LoopDetector.fingerprint('system', 'hello', '');
    ld.check(fp, 1);
    const result = ld.check(fp, 2);
    expect(result.allowed).toBe(false);
    expect(result.reason).toContain('loop detected');
  });

  it('blocks halted fingerprints permanently', () => {
    const ld = new LoopDetector(50);
    const fp = LoopDetector.fingerprint('system', 'hello', '');
    ld.check(fp, 1);
    ld.check(fp, 2); // halts
    const result = ld.check(fp, 3);
    expect(result.allowed).toBe(false);
    expect(result.reason).toContain('previously blocked');
  });

  it('allows different fingerprints independently', () => {
    const ld = new LoopDetector(50);
    const fp1 = LoopDetector.fingerprint('system', 'task-a', '');
    const fp2 = LoopDetector.fingerprint('system', 'task-b', '');

    expect(ld.check(fp1, 1).allowed).toBe(true);
    expect(ld.check(fp2, 1).allowed).toBe(true);
    expect(ld.check(fp1, 2).allowed).toBe(false); // fp1 loops
    expect(ld.check(fp2, 1).allowed).toBe(true);  // fp2 still ok at same depth
  });

  it('resets clears all state', () => {
    const ld = new LoopDetector(50);
    const fp = LoopDetector.fingerprint('s', 'u', 't');
    ld.check(fp, 1);
    ld.check(fp, 2); // halts
    ld.reset();
    expect(ld.check(fp, 1).allowed).toBe(true);
  });

  it('reports stats correctly', () => {
    const ld = new LoopDetector(50);
    const stats = ld.stats();
    expect(stats.enabled).toBe(true);
    expect(stats.max_depth).toBe(50);
    expect(stats.halted).toBe(0);

    const fp = LoopDetector.fingerprint('s', 'u', 't');
    ld.check(fp, 1);
    ld.check(fp, 2); // halts
    expect(ld.stats().halted).toBe(1);
  });

  it('loopCheck convenience method works', () => {
    const ld = new LoopDetector(50);
    const result = ld.loopCheck('system', 'user', 'tools', 1);
    expect(result.allowed).toBe(true);
  });
});

import { RateGuard } from '../src/index.js';
import { createMCPTools, mcpCall } from '../src/core/mcp.js';

describe('MCP tools', () => {
  it('exposes 5 tools matching the Go SDK', () => {
    const rg = new RateGuard({ preset: 'dev' });
    const tools = rg.mcpTools();
    expect(tools.map((t) => t.name).sort()).toEqual([
      'check_loop',
      'get_circuit_breaker_state',
      'get_rate_limit_state',
      'get_token_budget',
      'list_limits',
    ]);
  });

  it('get_rate_limit_state does not consume budget (peek semantics)', async () => {
    const rg = new RateGuard({ preset: 'dev' });
    const first = await rg.mcpCall('get_rate_limit_state', { key: 'agent-1' });
    const second = await rg.mcpCall('get_rate_limit_state', { key: 'agent-1' });
    const parse = (r: { content: Array<{ text: string }> }) => JSON.parse(r.content[0]!.text) as { remaining: number };
    expect(parse(first).remaining).toBe(parse(second).remaining);
  });

  it('check_loop blocks repeats at higher depth', async () => {
    const rg = new RateGuard({ preset: 'dev' });
    const args = { system_prompt: 'agent', user_input: 'book flight', sequence_depth: 1 };
    const first = await rg.mcpCall('check_loop', args);
    expect(JSON.parse(first.content[0]!.text).allowed).toBe(true);

    const second = await rg.mcpCall('check_loop', { ...args, sequence_depth: 4 });
    const parsed = JSON.parse(second.content[0]!.text) as { allowed: boolean; reason?: string };
    expect(parsed.allowed).toBe(false);
    expect(parsed.reason).toContain('loop detected');
  });

  it('list_limits aggregates all state', async () => {
    const rg = new RateGuard({ preset: 'dev' });
    const result = await rg.mcpCall('list_limits', { key: 'agent-1' });
    const parsed = JSON.parse(result.content[0]!.text) as Record<string, unknown>;
    expect(parsed.rate_limit).toBeDefined();
    expect(parsed.circuit_breaker).toBeDefined();
    expect(parsed.preset).toBeDefined();
    expect(parsed.loop_detector).toBeDefined();
  });

  it('rejects unknown tools with the available list', async () => {
    const rg = new RateGuard({ preset: 'dev' });
    const tools = createMCPTools(rg.runtime);
    await expect(mcpCall(tools, 'nonexistent')).rejects.toThrow(/available:/);
  });

  it('enforces max sequence depth', () => {
    const ld = new LoopDetector(5);
    const result = ld.check('a'.repeat(64), 9);
    expect(result.allowed).toBe(false);
    expect(result.reason).toContain('max sequence depth');
  });
});
