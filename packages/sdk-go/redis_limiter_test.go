package rateguard

import (
	"context"
	"net/http"
	"net/http/httptest"
	"sync/atomic"
	"testing"

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
}

func (f *fakeRedisLimiterClient) Eval(_ context.Context, _ string, _ []string, _ ...interface{}) *redis.Cmd {
	if f.calls.Add(1) == 1 {
		return redis.NewCmdResult([]interface{}{int64(1), int64(0), int64(0), int64(0)}, nil)
	}

	return redis.NewCmdResult([]interface{}{int64(0), int64(0), int64(1), int64(1)}, nil)
}
