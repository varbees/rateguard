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

// recordingRedisLimiterClient captures the script and args of the last Eval
// call and returns a fixed GCRA-shaped response, so tests can assert the
// Store methods dispatch the right script with the right arguments.
type recordingRedisLimiterClient struct {
	lastScript string
	lastKeys   []string
	lastArgs   []interface{}
	response   []interface{}
}

func (c *recordingRedisLimiterClient) Eval(_ context.Context, script string, keys []string, args ...interface{}) *redis.Cmd {
	c.lastScript = script
	c.lastKeys = keys
	c.lastArgs = args
	return redis.NewCmdResult(c.response, nil)
}

func TestRedisStoreIncrementSendsN(t *testing.T) {
	t.Parallel()

	client := &recordingRedisLimiterClient{response: []interface{}{int64(1), int64(7), int64(0), int64(0)}}
	clock := &fakeBudgetClock{now: time.Date(2026, 3, 20, 10, 0, 0, 0, time.UTC)}
	limiter := newRedisGCRALimiterWithClock(client, clock).(Store)
	policy := PolicyPreset{RequestsPerSecond: 10, Burst: 20}

	d, err := limiter.Increment(context.Background(), "tenant-a", policy, 5)
	if err != nil {
		t.Fatalf("Increment: %v", err)
	}
	if client.lastScript != luaRedisGCRAIncrementScript {
		t.Fatal("Increment must dispatch luaRedisGCRAIncrementScript")
	}
	if len(client.lastArgs) != 5 {
		t.Fatalf("Increment args = %v, want 5 (interval, burst, now, ttl, n)", client.lastArgs)
	}
	if n, ok := client.lastArgs[4].(float64); !ok || n != 5 {
		t.Fatalf("last arg (n) = %v, want 5", client.lastArgs[4])
	}
	if !d.Allowed || d.Remaining != 7 {
		t.Fatalf("Increment decision = %+v, want allowed with remaining=7", d)
	}
}

func TestRedisStoreGetDelegatesToPeek(t *testing.T) {
	t.Parallel()

	client := &recordingRedisLimiterClient{response: []interface{}{int64(1), int64(12), int64(0), int64(0)}}
	clock := &fakeBudgetClock{now: time.Date(2026, 3, 20, 10, 0, 0, 0, time.UTC)}
	limiter := newRedisGCRALimiterWithClock(client, clock).(Store)
	policy := PolicyPreset{RequestsPerSecond: 10, Burst: 20}

	state, err := limiter.Get(context.Background(), "tenant-a", policy)
	if err != nil {
		t.Fatalf("Get: %v", err)
	}
	if client.lastScript != luaRedisGCRAPeekScript {
		t.Fatal("Get must delegate to the read-only peek script, never the mutating one")
	}
	if state.Tokens != 12 || state.Capacity != 20 || state.Limit != 10 {
		t.Fatalf("Get = %+v, want tokens=12 capacity=20 limit=10", state)
	}
}

func TestRedisStoreResetSendsDelScript(t *testing.T) {
	t.Parallel()

	client := &recordingRedisLimiterClient{response: []interface{}{}}
	clock := &fakeBudgetClock{now: time.Date(2026, 3, 20, 10, 0, 0, 0, time.UTC)}
	limiter := newRedisGCRALimiterWithClock(client, clock).(Store)

	if err := limiter.Reset(context.Background(), "tenant-a"); err != nil {
		t.Fatalf("Reset: %v", err)
	}
	if client.lastScript != luaRedisGCRAResetScript {
		t.Fatal("Reset must dispatch luaRedisGCRAResetScript")
	}
	if len(client.lastKeys) != 1 || client.lastKeys[0] != "tenant-a" {
		t.Fatalf("Reset keys = %v, want [tenant-a]", client.lastKeys)
	}
}
