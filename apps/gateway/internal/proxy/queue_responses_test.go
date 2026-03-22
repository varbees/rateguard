package proxy

import (
	"net/http"
	"testing"
	"time"

	"github.com/google/uuid"
	"github.com/varbees/rateguard/internal/models"
)

func TestBuildQueueLimitReachedResponse(t *testing.T) {
	t.Parallel()

	start := time.Unix(1700000100, 0)
	req := &models.ProxyRequest{ID: "req-queue-1", UserID: uuid.New()}
	resp := buildQueueLimitReachedResponse(req, start, "limit hit")

	if resp.StatusCode != http.StatusTooManyRequests {
		t.Fatalf("status = %d", resp.StatusCode)
	}
	if got := resp.Headers.Get("X-RateGuard-Limit-Type"); got != "preset" {
		t.Fatalf("limit type = %q", got)
	}
	if string(resp.Body) == "" {
		t.Fatal("expected response body")
	}
}

func TestBuildQueueTimeoutResponse(t *testing.T) {
	t.Parallel()

	req := &models.ProxyRequest{ID: "req-queue-2", UserID: uuid.New()}
	resp := buildQueueTimeoutResponse(req, time.Now(), 3*time.Second, 30*time.Second, "burst")

	if resp.StatusCode != http.StatusServiceUnavailable {
		t.Fatalf("status = %d", resp.StatusCode)
	}
	if resp.Error == nil || resp.Error.Code != "QUEUE_TIMEOUT" {
		t.Fatalf("unexpected error payload: %#v", resp.Error)
	}
}
