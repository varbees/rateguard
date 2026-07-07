import { describe, it, expect } from 'vitest';
import { BoundedCache } from '../src/core/bounded-cache.js';

// Direct unit coverage for the stdlib-only replacement of the lru-cache
// dependency (AGENTS.md rule 3: no new dependencies without reason — Go and
// Python both implement this in ~100 lines of stdlib, Node was the only one
// reaching for an npm package for it). Mirrors sdk-go's
// TestMemoryLimiterEvictsLeastRecentlyUsedKeys/TestTokenBudgetManagerEvictsLeastRecentlyUsedKeys,
// but exercises the cache primitive directly rather than only through a
// consumer.
describe('BoundedCache', () => {
  it('evicts the least-recently-used key once over capacity', () => {
    const cache = new BoundedCache<string, number>(2);
    cache.set('a', 1);
    cache.set('b', 2);
    cache.set('c', 3);

    expect(cache.size()).toBe(2);
    expect(cache.has('a')).toBe(false);
    expect(cache.get('b')).toBe(2);
    expect(cache.get('c')).toBe(3);
  });

  it('get() refreshes recency, protecting a just-read key from eviction', () => {
    const cache = new BoundedCache<string, number>(2);
    cache.set('a', 1);
    cache.set('b', 2);
    cache.get('a'); // 'a' is now more recent than 'b'
    cache.set('c', 3); // should evict 'b', not 'a'

    expect(cache.has('a')).toBe(true);
    expect(cache.has('b')).toBe(false);
    expect(cache.has('c')).toBe(true);
  });

  it('set() on an existing key refreshes recency without growing size', () => {
    const cache = new BoundedCache<string, number>(2);
    cache.set('a', 1);
    cache.set('b', 2);
    cache.set('a', 10); // re-set 'a' — now more recent than 'b'
    cache.set('c', 3); // should evict 'b', not 'a'

    expect(cache.size()).toBe(2);
    expect(cache.get('a')).toBe(10);
    expect(cache.has('b')).toBe(false);
    expect(cache.get('c')).toBe(3);
  });

  it('getOrCreate only calls the factory once per key and refreshes recency on hits', () => {
    const cache = new BoundedCache<string, number>(2);
    let calls = 0;
    const factory = () => {
      calls += 1;
      return 42;
    };

    expect(cache.getOrCreate('a', factory)).toBe(42);
    expect(cache.getOrCreate('a', factory)).toBe(42);
    expect(calls).toBe(1);

    cache.set('b', 2);
    cache.getOrCreate('a', factory); // refresh 'a'
    cache.set('c', 3); // should evict 'b', not 'a'
    expect(cache.has('a')).toBe(true);
    expect(cache.has('b')).toBe(false);
  });

  it('delete/clear/has/values behave as expected', () => {
    const cache = new BoundedCache<string, number>(5);
    cache.set('a', 1);
    cache.set('b', 2);

    expect(cache.delete('a')).toBe(true);
    expect(cache.delete('a')).toBe(false);
    expect(cache.has('a')).toBe(false);
    expect([...cache.values()]).toEqual([2]);

    cache.clear();
    expect(cache.size()).toBe(0);
  });

  it('normalizes a non-positive max to 1', () => {
    const cache = new BoundedCache<string, number>(0);
    cache.set('a', 1);
    cache.set('b', 2);

    expect(cache.size()).toBe(1);
    expect(cache.has('b')).toBe(true);
  });
});
