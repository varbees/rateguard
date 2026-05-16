from __future__ import annotations

from collections import OrderedDict
from threading import RLock
from typing import Callable, Generic, TypeVar

K = TypeVar("K")
V = TypeVar("V")


class BoundedCache(Generic[K, V]):
    """Small thread-safe LRU cache for hot-path state."""

    def __init__(self, maxsize: int) -> None:
        self._maxsize = max(1, maxsize)
        self._cache: OrderedDict[K, V] = OrderedDict()
        self._lock = RLock()

    def get(self, key: K) -> V | None:
        with self._lock:
            value = self._cache.get(key)
            if value is not None:
                self._cache.move_to_end(key)
            return value

    def set(self, key: K, value: V) -> None:
        with self._lock:
            self._cache[key] = value
            self._cache.move_to_end(key)
            self._evict_if_needed()

    def get_or_create(self, key: K, factory: Callable[[], V]) -> V:
        with self._lock:
            value = self._cache.get(key)
            if value is not None:
                self._cache.move_to_end(key)
                return value
            value = factory()
            self._cache[key] = value
            self._evict_if_needed()
            return value

    def delete(self, key: K) -> None:
        with self._lock:
            self._cache.pop(key, None)

    def _evict_if_needed(self) -> None:
        while len(self._cache) > self._maxsize:
            self._cache.popitem(last=False)
