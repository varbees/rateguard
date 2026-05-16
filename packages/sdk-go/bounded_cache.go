package rateguard

import "container/list"

type boundedCacheEntry[K comparable, V any] struct {
	key   K
	value V
}

type boundedCache[K comparable, V any] struct {
	capacity int
	items    map[K]*list.Element
	order    *list.List
}

func newBoundedCache[K comparable, V any](capacity int) *boundedCache[K, V] {
	if capacity <= 0 {
		capacity = 1
	}

	return &boundedCache[K, V]{
		capacity: capacity,
		items:    make(map[K]*list.Element, capacity),
		order:    list.New(),
	}
}

func (c *boundedCache[K, V]) get(key K) (V, bool) {
	var zero V
	if c == nil {
		return zero, false
	}

	elem, ok := c.items[key]
	if !ok {
		return zero, false
	}

	c.order.MoveToFront(elem)
	return elem.Value.(boundedCacheEntry[K, V]).value, true
}

func (c *boundedCache[K, V]) getOrCreate(key K, factory func() V) V {
	if value, ok := c.get(key); ok {
		return value
	}

	value := factory()
	c.set(key, value)
	return value
}

func (c *boundedCache[K, V]) set(key K, value V) {
	if c == nil {
		return
	}

	if elem, ok := c.items[key]; ok {
		elem.Value = boundedCacheEntry[K, V]{key: key, value: value}
		c.order.MoveToFront(elem)
		return
	}

	if c.order.Len() >= c.capacity {
		back := c.order.Back()
		if back != nil {
			entry := back.Value.(boundedCacheEntry[K, V])
			delete(c.items, entry.key)
			c.order.Remove(back)
		}
	}

	c.items[key] = c.order.PushFront(boundedCacheEntry[K, V]{key: key, value: value})
}

func (c *boundedCache[K, V]) len() int {
	if c == nil {
		return 0
	}

	return c.order.Len()
}
