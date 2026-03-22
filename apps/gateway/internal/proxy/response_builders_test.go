package proxy

import (
	"errors"
	"net/http"
	"testing"
	"time"

	"github.com/varbees/rateguard/internal/models"
)

func TestBuildProxyExecutionErrorResponse(t *testing.T) {
	t.Parallel()

	ts := time.Unix(1700000000, 0)
	resp := buildProxyExecutionErrorResponse("req-1", ts, 2*time.Second, http.StatusBadGateway, "REQUEST_FAILED", "Failed", "boom")

	if resp.RequestID != "req-1" {
		t.Fatalf("request id = %q", resp.RequestID)
	}
	if !resp.Timestamp.Equal(ts) {
		t.Fatalf("timestamp = %v", resp.Timestamp)
	}
	if resp.StatusCode != http.StatusBadGateway {
		t.Fatalf("status = %d", resp.StatusCode)
	}
	if resp.Duration != 2*time.Second {
		t.Fatalf("duration = %v", resp.Duration)
	}
	if resp.Error == nil || resp.Error.Code != "REQUEST_FAILED" || resp.Error.Message != "Failed" || resp.Error.Details != "boom" {
		t.Fatalf("unexpected error payload: %#v", resp.Error)
	}
}

func TestBuildProxyCircuitOpenResponse(t *testing.T) {
	t.Parallel()

	resp := buildProxyCircuitOpenResponse("req-2", time.Now(), time.Second, ErrCircuitOpen)

	if resp.StatusCode != http.StatusServiceUnavailable {
		t.Fatalf("status = %d", resp.StatusCode)
	}
	if resp.Error == nil || resp.Error.Code != "CIRCUIT_OPEN" {
		t.Fatalf("unexpected error payload: %#v", resp.Error)
	}
}

func TestBuildProxyRequestFailureResponse(t *testing.T) {
	t.Parallel()

	circuitResp := buildProxyRequestFailureResponse("req-3", time.Now(), time.Second, ErrCircuitOpen)
	if circuitResp.StatusCode != http.StatusServiceUnavailable {
		t.Fatalf("circuit status = %d", circuitResp.StatusCode)
	}

	boomResp := buildProxyRequestFailureResponse("req-4", time.Now(), time.Second, errors.New("boom"))
	if boomResp.StatusCode != http.StatusBadGateway {
		t.Fatalf("failure status = %d", boomResp.StatusCode)
	}
}

func TestBuildProxyStreamingAndBufferedResponses(t *testing.T) {
	t.Parallel()

	base := &models.ProxyResponse{RequestID: "req-5"}
	header := http.Header{}
	header.Set("Content-Type", "text/event-stream")

	streaming := buildProxyStreamingResponse(base, http.StatusOK, header, 3*time.Second, "sse")
	if !streaming.IsStreaming || streaming.StreamingType != "sse" {
		t.Fatalf("unexpected streaming response: %#v", streaming)
	}

	buffered := buildProxyBufferedResponse(&models.ProxyResponse{RequestID: "req-6"}, http.StatusCreated, header, []byte("ok"), 4*time.Second)
	if buffered.StatusCode != http.StatusCreated || string(buffered.Body) != "ok" {
		t.Fatalf("unexpected buffered response: %#v", buffered)
	}
}
