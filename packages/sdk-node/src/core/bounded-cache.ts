import { LRUCache } from 'lru-cache';

/**
 * Small wrapper around an LRU cache for hot-path state.
 */
export class BoundedCache<K extends {}, V extends {}> {
  private readonly cache: LRUCache<K, V>;

  constructor(max: number) {
    this.cache = new LRUCache<K, V>({
      max: max > 0 ? max : 1,
    });
  }

  get(key: K): V | undefined {
    return this.cache.get(key);
  }

  set(key: K, value: V): void {
    this.cache.set(key, value);
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

  values(): Generator<V> {
    return this.cache.values() as Generator<V>;
  }

  /**
   * Retrieve a value or initialize it once.
   */
  getOrCreate(key: K, factory: () => V): V {
    const existing = this.cache.get(key);
    if (existing !== undefined) {
      return existing;
    }

    const value = factory();
    this.cache.set(key, value);
    return value;
  }
}
