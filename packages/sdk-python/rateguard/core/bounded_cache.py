from __future__ import annotations

from threading import RLock
from typing import Callable, Generic, TypeVar

from cachetools import LRUCache

K = TypeVar("K")
V = TypeVar("V")


class BoundedCache(Generic[K, V]):
    """Small thread-safe LRU cache for hot-path state."""

    def __init__(self, maxsize: int) -> None:
        self._cache: LRUCache[K, V] = LRUCache(maxsize=max(1, maxsize))
        self._lock = RLock()

    def get(self, key: K) -> V | None:
        with self._lock:
            return self._cache.get(key)

    def set(self, key: K, value: V) -> None:
        with self._lock:
            self._cache[key] = value

    def get_or_create(self, key: K, factory: Callable[[], V]) -> V:
        with self._lock:
            value = self._cache.get(key)
            if value is not None:
                return value
            value = factory()
            self._cache[key] = value
            return value

    def delete(self, key: K) -> None:
        with self._lock:
            self._cache.pop(key, None)

