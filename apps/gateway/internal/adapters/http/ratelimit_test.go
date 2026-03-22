package httpadapter

import (
	"net/http"
	"strconv"
	"testing"
	"time"
)

func TestParseRateLimitHeaders(t *testing.T) {
	headers := http.Header{}
	headers.Set("X-RateLimit-Limit", "120")
	headers.Set("X-RateLimit-Remaining", "42")
	headers.Set("X-RateLimit-Reset", strconv.FormatInt(time.Now().Add(2*time.Minute).Unix(), 10))
	headers.Set("Retry-After", "17")

	info := ParseRateLimitHeaders(headers)
	if info.Limit == nil || *info.Limit != 120 {
		t.Fatalf("expected limit 120, got %#v", info.Limit)
	}
	if info.Remaining == nil || *info.Remaining != 42 {
		t.Fatalf("expected remaining 42, got %#v", info.Remaining)
	}
	if info.Reset == nil {
		t.Fatal("expected reset timestamp")
	}
	if info.RetryAfter == nil || *info.RetryAfter != 17 {
		t.Fatalf("expected retry-after 17, got %#v", info.RetryAfter)
	}
	if info.WindowSeconds == nil || *info.WindowSeconds <= 0 {
		t.Fatalf("expected positive window seconds, got %#v", info.WindowSeconds)
	}
}

func TestStreamingHelpers(t *testing.T) {
	headers := http.Header{}
	if !IsStreamingResponse("text/event-stream; charset=utf-8", headers) {
		t.Fatal("expected SSE response to be streaming")
	}
	if got := DetectStreamType("text/event-stream", headers); got != "sse" {
		t.Fatalf("expected sse, got %q", got)
	}

	headers.Set("Transfer-Encoding", "chunked")
	if !IsStreamingResponse("application/octet-stream", headers) {
		t.Fatal("expected chunked octet-stream to be streaming")
	}
	if got := DetectStreamType("application/octet-stream", headers); got != "chunked" {
		t.Fatalf("expected chunked, got %q", got)
	}
}
