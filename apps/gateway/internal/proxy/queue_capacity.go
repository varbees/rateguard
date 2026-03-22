package proxy

import (
	"context"
	"fmt"
	"time"

	"github.com/google/uuid"
)

const queueWaiterTTLBuffer = time.Minute

type queueWaiter struct {
	token      chan struct{}
	enqueuedAt time.Time
	expiresAt  time.Time
	armed      bool
}

type queueWaiterState struct {
	count     int
	expiresAt time.Time
	waiters   []*queueWaiter
}

func queueCapacityKey(userID uuid.UUID, apiName string) string {
	return fmt.Sprintf("rateguard:queue:waiters:%s:%s", userID.String(), apiName)
}

func (p *ProxyService) queueLimitForAPI(userID uuid.UUID, apiName string) int {
	config := p.GetQueueConfig(userID)
	for _, setting := range config.PerAPISettings {
		if setting.APIName == apiName {
			if setting.MaxQueueLength > 0 {
				return setting.MaxQueueLength
			}
			return 0
		}
	}

	return 0
}

func (p *ProxyService) reserveQueueSlot(
	ctx context.Context,
	userID uuid.UUID,
	apiName string,
	limit int,
	ttl time.Duration,
) (func(), bool, error) {
	if limit <= 0 {
		return nil, true, nil
	}

	key := queueCapacityKey(userID, apiName)
	if queueStoreSingleton.redisManager != nil && queueStoreSingleton.redisManager.client != nil {
		acquired, err := queueStoreSingleton.redisManager.acquireQueueCapacity(ctx, key, limit, ttl)
		if err != nil {
			return nil, false, err
		}
		if !acquired {
			return nil, false, nil
		}

		return func() {
			_ = queueStoreSingleton.redisManager.releaseQueueCapacity(context.Background(), key)
		}, true, nil
	}

	released, acquired := queueStoreSingleton.reserveQueueSlot(key, limit, ttl)
	if !acquired {
		return nil, false, nil
	}

	return released, true, nil
}

func (s *queueStore) enqueueQueueWaiter(key string, ttl time.Duration) *queueWaiter {
	s.mu.Lock()
	defer s.mu.Unlock()

	now := time.Now()
	s.cleanupQueueWaitersLocked(now)

	state, exists := s.queueWaiters[key]
	if !exists {
		state = &queueWaiterState{}
		s.queueWaiters[key] = state
	}

	waiter := &queueWaiter{
		token:      make(chan struct{}),
		enqueuedAt: now,
		expiresAt:  now.Add(ttl),
		armed:      true,
	}
	state.waiters = append(state.waiters, waiter)
	state.expiresAt = waiter.expiresAt

	return waiter
}

func (s *queueStore) rearmQueueWaiter(key string, waiter *queueWaiter, ttl time.Duration) bool {
	s.mu.Lock()
	defer s.mu.Unlock()

	now := time.Now()
	s.cleanupQueueWaitersLocked(now)

	state, exists := s.queueWaiters[key]
	if !exists {
		return false
	}

	for _, current := range state.waiters {
		if current == waiter {
			current.token = make(chan struct{})
			current.armed = true
			current.expiresAt = now.Add(ttl)
			state.expiresAt = current.expiresAt
			return true
		}
	}

	return false
}

func (s *queueStore) removeQueueWaiter(key string, waiter *queueWaiter) bool {
	s.mu.Lock()
	defer s.mu.Unlock()

	now := time.Now()
	s.cleanupQueueWaitersLocked(now)

	state, exists := s.queueWaiters[key]
	if !exists {
		return false
	}

	for i, current := range state.waiters {
		if current != waiter {
			continue
		}

		state.waiters = append(state.waiters[:i], state.waiters[i+1:]...)
		if len(state.waiters) == 0 && state.count <= 0 {
			delete(s.queueWaiters, key)
			return true
		}

		if len(state.waiters) > 0 {
			state.expiresAt = state.waiters[len(state.waiters)-1].expiresAt
		}
		return true
	}

	return false
}

func (s *queueStore) signalNextQueueWaiter(key string) bool {
	s.mu.Lock()
	defer s.mu.Unlock()

	now := time.Now()
	s.cleanupQueueWaitersLocked(now)

	state, exists := s.queueWaiters[key]
	if !exists || len(state.waiters) == 0 {
		return false
	}

	waiter := state.waiters[0]
	if !waiter.armed {
		return false
	}

	waiter.armed = false
	close(waiter.token)
	return true
}

func (s *queueStore) reserveQueueSlot(key string, limit int, ttl time.Duration) (func(), bool) {
	s.mu.Lock()
	defer s.mu.Unlock()

	s.cleanupQueueWaitersLocked(time.Now())

	state, exists := s.queueWaiters[key]
	if !exists {
		state = &queueWaiterState{}
		s.queueWaiters[key] = state
	}

	if state.count >= limit {
		return nil, false
	}

	state.count++
	state.expiresAt = time.Now().Add(ttl)

	return func() {
		s.releaseQueueSlot(key, ttl)
	}, true
}

func (s *queueStore) releaseQueueSlot(key string, ttl time.Duration) {
	s.mu.Lock()
	defer s.mu.Unlock()

	state, exists := s.queueWaiters[key]
	if !exists {
		return
	}

	state.count--
	if state.count <= 0 {
		delete(s.queueWaiters, key)
		return
	}

	state.expiresAt = time.Now().Add(ttl)
}

func (s *queueStore) cleanupQueueWaitersLocked(now time.Time) {
	for key, state := range s.queueWaiters {
		if len(state.waiters) == 0 {
			if now.After(state.expiresAt) || state.count <= 0 {
				delete(s.queueWaiters, key)
			}
			continue
		}

		kept := state.waiters[:0]
		removed := 0
		for _, waiter := range state.waiters {
			if now.After(waiter.expiresAt) {
				removed++
				continue
			}
			kept = append(kept, waiter)
		}

		if removed > 0 {
			state.count -= removed
			if state.count < 0 {
				state.count = 0
			}
		}

		if len(kept) == 0 {
			if state.count <= 0 {
				delete(s.queueWaiters, key)
				continue
			}
			state.waiters = nil
			state.expiresAt = now.Add(queueWaiterTTLBuffer)
			continue
		}

		state.waiters = append([]*queueWaiter(nil), kept...)
		state.expiresAt = kept[len(kept)-1].expiresAt

		if state.count <= 0 && len(state.waiters) == 0 {
			delete(s.queueWaiters, key)
		}
	}
}
