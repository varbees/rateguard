package proxy

import (
	"context"
	"sync/atomic"
	"testing"
	"time"

	"github.com/google/uuid"
	"github.com/varbees/rateguard/internal/models"
)

func TestQueueStoreReserveSlotEnforcesLimit(t *testing.T) {
	t.Parallel()

	store := &queueStore{
		queueWaiters: make(map[string]*queueWaiterState),
	}

	key := queueCapacityKey(uuid.New(), "demo-api")

	release1, acquired1 := store.reserveQueueSlot(key, 1, time.Minute)
	if !acquired1 {
		t.Fatal("expected first reservation to succeed")
	}
	if release1 == nil {
		t.Fatal("expected release callback")
	}

	if _, acquired2 := store.reserveQueueSlot(key, 1, time.Minute); acquired2 {
		t.Fatal("expected second reservation to be rejected at capacity")
	}

	release1()

	if _, acquired3 := store.reserveQueueSlot(key, 1, time.Minute); !acquired3 {
		t.Fatal("expected reservation to succeed after release")
	}
}

func TestBuildQueueCapacityExceededResponse(t *testing.T) {
	t.Parallel()

	req := &models.ProxyRequest{ID: "req-queue-cap", UserID: uuid.New()}
	resp := buildQueueCapacityExceededResponse(req, time.Unix(1700000200, 0), 3, "demo-api")

	if resp.StatusCode != 429 {
		t.Fatalf("status = %d", resp.StatusCode)
	}
	if got := resp.Headers.Get("X-RateGuard-Limit-Type"); got != "queue" {
		t.Fatalf("limit type = %q", got)
	}
	if got := resp.Headers.Get("X-RateGuard-Queue-Max-Length"); got != "3" {
		t.Fatalf("max queue length = %q", got)
	}
	if len(resp.Body) == 0 {
		t.Fatal("expected response body")
	}
}

func TestQueueStoreSignalsWaitersInFIFOOrder(t *testing.T) {
	store := &queueStore{
		queueWaiters: make(map[string]*queueWaiterState),
	}

	key := queueCapacityKey(uuid.New(), "demo-api")

	release1, acquired1 := store.reserveQueueSlot(key, 2, time.Minute)
	if !acquired1 || release1 == nil {
		t.Fatal("expected first reservation to succeed")
	}
	release2, acquired2 := store.reserveQueueSlot(key, 2, time.Minute)
	if !acquired2 || release2 == nil {
		t.Fatal("expected second reservation to succeed")
	}

	waiter1 := store.enqueueQueueWaiter(key, time.Minute)
	waiter2 := store.enqueueQueueWaiter(key, time.Minute)
	if waiter1 == nil || waiter2 == nil {
		t.Fatal("expected waiters to be registered")
	}

	if !store.signalNextQueueWaiter(key) {
		t.Fatal("expected first waiter to be signaled")
	}

	select {
	case <-waiter1.token:
	default:
		t.Fatal("expected first waiter token to be closed")
	}

	select {
	case <-waiter2.token:
		t.Fatal("did not expect second waiter to be signaled yet")
	default:
	}

	if !store.removeQueueWaiter(key, waiter1) {
		t.Fatal("expected first waiter to be removable")
	}
	release1()

	if !store.signalNextQueueWaiter(key) {
		t.Fatal("expected second waiter to be signaled")
	}

	select {
	case <-waiter2.token:
	default:
		t.Fatal("expected second waiter token to be closed")
	}

	if !store.removeQueueWaiter(key, waiter2) {
		t.Fatal("expected second waiter to be removable")
	}
	release2()
}

type queueAdmissionPresetCheckerStub struct {
}

func (s *queueAdmissionPresetCheckerStub) GetUserPreset(context.Context, uuid.UUID) (string, error) {
	return "dev", nil
}

func (s *queueAdmissionPresetCheckerStub) CanMakeRequest(context.Context, uuid.UUID) (bool, int64, string, error) {
	return true, 99, "", nil
}

type queueAdmissionRateLimiterStub struct {
	calls atomic.Int32
	allow atomic.Bool
	stats map[string]interface{}
}

func (s *queueAdmissionRateLimiterStub) AllowForUser(uuid.UUID, string, int, int) bool {
	s.calls.Add(1)
	return s.allow.Load()
}

func (s *queueAdmissionRateLimiterStub) GetStats() map[string]interface{} {
	if s.stats == nil {
		return map[string]interface{}{}
	}
	return s.stats
}

func TestAdmitQueuedRequestSleepsUntilSignaled(t *testing.T) {
	originalQueueStore := queueStoreSingleton
	queueStoreSingleton = &queueStore{
		userConfigs:  make(map[uuid.UUID]QueueConfig),
		activeQueues: make(map[string][]QueuedRequest),
		queueWaiters: make(map[string]*queueWaiterState),
		queueStats:   make(map[uuid.UUID]*QueueStats),
		droppedJobs:  make(map[uuid.UUID]int64),
		maxWaitTimes: make(map[uuid.UUID]int64),
	}
	defer func() {
		queueStoreSingleton = originalQueueStore
	}()

	userID := uuid.New()
	apiName := "demo-api"
	queueStoreSingleton.mu.Lock()
	queueStoreSingleton.userConfigs[userID] = QueueConfig{
		Enabled:     true,
		MaxWaitTime: 30000,
		PerAPISettings: []APIQueueConfig{
			{
				APIName:        apiName,
				Enabled:        true,
				MaxQueueLength: 2,
			},
		},
	}
	queueStoreSingleton.mu.Unlock()

	presetStub := &queueAdmissionPresetCheckerStub{}
	limiterStub := &queueAdmissionRateLimiterStub{}
	service := &ProxyService{presetChecker: presetStub, rateLimiter: limiterStub}

	req := &models.ProxyRequest{
		ID:        "req-queued",
		UserID:    userID,
		TargetAPI: apiName,
	}
	apiConfig := &models.APIConfig{}
	ctx, cancel := context.WithTimeout(context.Background(), 2*time.Second)
	defer cancel()

	resultCh := make(chan queueAdmissionResult, 1)
	go func() {
		resultCh <- service.admitQueuedRequest(ctx, req, apiConfig, time.Unix(1700000000, 0))
	}()

	time.Sleep(120 * time.Millisecond)
	if got := limiterStub.calls.Load(); got != 1 {
		t.Fatalf("expected a single limit check before signal, got %d", got)
	}

	limiterStub.allow.Store(true)
	if !queueStoreSingleton.signalNextQueueWaiter(queueCapacityKey(userID, apiName)) {
		t.Fatal("expected queued waiter to be signaled")
	}

	result := <-resultCh
	if result.err != nil {
		t.Fatalf("unexpected error: %v", result.err)
	}
	if !result.queued {
		t.Fatal("expected queued request to be marked queued")
	}
	if result.release == nil {
		t.Fatal("expected completion release callback")
	}
	result.release()
}

func BenchmarkQueueStoreReserveSlot(b *testing.B) {
	store := &queueStore{
		queueWaiters: make(map[string]*queueWaiterState),
	}

	key := queueCapacityKey(uuid.New(), "bench-api")

	b.ResetTimer()
	for i := 0; i < b.N; i++ {
		release, acquired := store.reserveQueueSlot(key, 1000, time.Minute)
		if !acquired {
			b.Fatal("unexpected capacity rejection in benchmark")
		}
		release()
	}
}
