/**
 * Small LRU cache for hot-path state — zero dependencies, stdlib only.
 * Mirrors Go's bounded_cache.go and Python's core/bounded_cache.py: a
 * `Map` already preserves insertion order, so re-inserting a key (delete
 * then set) moves it to the most-recently-used end. get() and getOrCreate()
 * both refresh recency on a hit, matching the other two SDKs.
 */
export class BoundedCache<K extends {}, V extends {}> {
  private readonly cache = new Map<K, V>();
  private readonly max: number;

  constructor(max: number) {
    this.max = max > 0 ? max : 1;
  }

  get(key: K): V | undefined {
    const value = this.cache.get(key);
    if (value === undefined) {
      return undefined;
    }
    this.cache.delete(key);
    this.cache.set(key, value);
    return value;
  }

  set(key: K, value: V): void {
    this.cache.delete(key);
    this.cache.set(key, value);
    this.evictIfNeeded();
  }

  delete(key: K): boolean {
    return this.cache.delete(key);
  }

  clear(): void {
    this.cache.clear();
  }

  has(key: K): boolean {
    return this.cache.has(key);
  }

  size(): number {
    return this.cache.size;
  }

  values(): IterableIterator<V> {
    return this.cache.values();
  }

  /**
   * Retrieve a value or initialize it once.
   */
  getOrCreate(key: K, factory: () => V): V {
    const existing = this.get(key);
    if (existing !== undefined) {
      return existing;
    }

    const value = factory();
    this.set(key, value);
    return value;
  }

  private evictIfNeeded(): void {
    while (this.cache.size > this.max) {
      const oldest = this.cache.keys().next();
      if (oldest.done) {
        break;
      }
      this.cache.delete(oldest.value);
    }
  }
}
