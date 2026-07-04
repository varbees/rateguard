package rateguard

import (
	"context"
	"errors"
	"net/http"
	"net/http/httptest"
	"strings"
	"sync/atomic"
	"testing"
	"time"

	"github.com/redis/go-redis/v9"
)

func TestHTTPMiddlewareUsesRedisLimiterForRepeatRequests(t *testing.T) {
	t.Parallel()

	client := &fakeRedisLimiterClient{}

	sdk := New(Config{
		Preset:            PresetDev,
		RequestsPerSecond: 1,
		Burst:             1,
		RedisClient:       client,
	})

	var calls int32
	handler := sdk.HTTPMiddleware(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		atomic.AddInt32(&calls, 1)
		w.WriteHeader(http.StatusOK)
	}))

	firstReq := httptest.NewRequest(http.MethodGet, "http://example.com/api/v1/openapi.json", nil)
	firstRes := httptest.NewRecorder()
	handler.ServeHTTP(firstRes, firstReq)
	if firstRes.Code != http.StatusOK {
		t.Fatalf("first status = %d, want %d", firstRes.Code, http.StatusOK)
	}

	secondReq := httptest.NewRequest(http.MethodGet, "http://example.com/api/v1/openapi.json", nil)
	secondRes := httptest.NewRecorder()
	handler.ServeHTTP(secondRes, secondReq)

	if secondRes.Code != http.StatusTooManyRequests {
		t.Fatalf("second status = %d, want %d", secondRes.Code, http.StatusTooManyRequests)
	}
	if got := atomic.LoadInt32(&calls); got != 1 {
		t.Fatalf("handler calls = %d, want 1", got)
	}
	if got := secondRes.Header().Get("Retry-After"); got == "" {
		t.Fatal("Retry-After header should be set")
	}
}

type fakeRedisLimiterClient struct {
	calls atomic.Int32
	nowUs atomic.Int64
}

func (f *fakeRedisLimiterClient) Eval(_ context.Context, _ string, _ []string, args ...interface{}) *redis.Cmd {
	if len(args) >= 3 {
		if now, ok := args[2].(int64); ok {
			f.nowUs.Store(now)
		}
	}
	if f.calls.Add(1) == 1 {
		return redis.NewCmdResult([]interface{}{int64(1), int64(0), int64(0), int64(0)}, nil)
	}

	return redis.NewCmdResult([]interface{}{int64(0), int64(0), int64(1), int64(1)}, nil)
}

func TestRedisLimiterUsesInjectedClock(t *testing.T) {
	t.Parallel()

	client := &fakeRedisLimiterClient{}
	clock := &fakeBudgetClock{now: time.Date(2026, 3, 20, 10, 0, 0, 0, time.UTC)}
	limiter := newRedisGCRALimiterWithClock(client, clock)
	policy := PolicyPreset{RequestsPerSecond: 1, Burst: 1}

	_, err := limiter.Allow(context.Background(), "tenant-a", policy)
	if err != nil {
		t.Fatalf("allow returned error: %v", err)
	}

	want := clock.Now().UnixNano() / 1000
	if got := client.nowUs.Load(); got != want {
		t.Fatalf("redis nowUs = %d, want %d", got, want)
	}
}

func TestHTTPMiddlewareFailsClosedWhenRedisLimiterErrors(t *testing.T) {
	t.Parallel()

	client := failingRedisLimiterClient{}
	sdk := New(Config{
		Preset:            PresetDev,
		RequestsPerSecond: 100,
		Burst:             100,
		RedisClient:       client,
	})

	var calls int32
	handler := sdk.HTTPMiddleware(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		atomic.AddInt32(&calls, 1)
		w.WriteHeader(http.StatusOK)
	}))

	req := httptest.NewRequest(http.MethodGet, "http://example.com/api/v1/openapi.json", nil)
	res := httptest.NewRecorder()
	handler.ServeHTTP(res, req)

	if res.Code != http.StatusServiceUnavailable {
		t.Fatalf("status = %d, want %d", res.Code, http.StatusServiceUnavailable)
	}
	if got := atomic.LoadInt32(&calls); got != 0 {
		t.Fatalf("handler calls = %d, want 0", got)
	}
	if got := res.Body.String(); !strings.Contains(got, `"error":"rate_limit_unavailable"`) {
		t.Fatalf("body = %s, want rate_limit_unavailable", got)
	}
}

type failingRedisLimiterClient struct{}

func (failingRedisLimiterClient) Eval(context.Context, string, []string, ...interface{}) *redis.Cmd {
	return redis.NewCmdResult(nil, errors.New("redis unavailable"))
}
