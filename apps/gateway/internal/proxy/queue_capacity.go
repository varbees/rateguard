package proxy

import (
	"context"
	"fmt"
	"time"

	"github.com/google/uuid"
)

const queueWaiterTTLBuffer = time.Minute

type queueWaiterState struct {
	count     int
	expiresAt time.Time
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
		if now.After(state.expiresAt) {
			delete(s.queueWaiters, key)
		}
	}
}
