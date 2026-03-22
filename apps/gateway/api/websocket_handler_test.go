package api

import (
	"bufio"
	"bytes"
	"encoding/json"
	"net/http"
	"net/http/httptest"
	"strings"
	"testing"
	"time"

	"github.com/gofiber/fiber/v2"
	"github.com/varbees/rateguard/internal/security"
	ws "github.com/varbees/rateguard/internal/websocket"
	"go.uber.org/zap"
)

func TestReplayEventsReturnsArchivedEvents(t *testing.T) {
	t.Parallel()

	logger := zap.NewNop()
	manager := ws.NewManager(logger, security.DefaultAllowedOrigins())
	hub := ws.NewHub(manager, nil, logger)
	handler := NewWebSocketHandler(manager, hub, "secret", nil, logger)

	if err := hub.PublishTestMessage("", "hello replay"); err != nil {
		t.Fatalf("PublishTestMessage error = %v", err)
	}

	app := fiber.New()
	app.Get("/events/replay", handler.ReplayEvents)

	req := httptest.NewRequest(http.MethodGet, "/events/replay", nil)
	resp, err := app.Test(req, -1)
	if err != nil {
		t.Fatalf("app.Test error = %v", err)
	}
	defer resp.Body.Close()

	if resp.StatusCode != http.StatusOK {
		t.Fatalf("status = %d, want %d", resp.StatusCode, http.StatusOK)
	}

	var payload struct {
		Count  int                 `json:"count"`
		Events []ws.WebSocketEvent `json:"events"`
		Since  string              `json:"since"`
	}
	if err := json.NewDecoder(resp.Body).Decode(&payload); err != nil {
		t.Fatalf("decode replay response: %v", err)
	}

	if payload.Count != 1 {
		t.Fatalf("count = %d, want 1", payload.Count)
	}
	if len(payload.Events) != 1 {
		t.Fatalf("events = %d, want 1", len(payload.Events))
	}
	if payload.Events[0].EventType != string(ws.EventTest) {
		t.Fatalf("event_type = %q, want %q", payload.Events[0].EventType, ws.EventTest)
	}
	if !strings.Contains(payload.Events[0].Payload["message"].(string), "hello replay") {
		t.Fatalf("payload = %#v, want replay message", payload.Events[0].Payload)
	}
}

func TestReplayEventsHonorsSinceFilter(t *testing.T) {
	t.Parallel()

	logger := zap.NewNop()
	manager := ws.NewManager(logger, security.DefaultAllowedOrigins())
	hub := ws.NewHub(manager, nil, logger)
	handler := NewWebSocketHandler(manager, hub, "secret", nil, logger)

	if err := hub.PublishTestMessage("", "hello replay"); err != nil {
		t.Fatalf("PublishTestMessage error = %v", err)
	}

	app := fiber.New()
	app.Get("/events/replay", handler.ReplayEvents)

	since := time.Now().Add(1 * time.Hour).UTC().Format(time.RFC3339Nano)
	req := httptest.NewRequest(http.MethodGet, "/events/replay?since="+since, nil)
	resp, err := app.Test(req, -1)
	if err != nil {
		t.Fatalf("app.Test error = %v", err)
	}
	defer resp.Body.Close()

	var payload struct {
		Count  int                 `json:"count"`
		Events []ws.WebSocketEvent `json:"events"`
	}
	if err := json.NewDecoder(resp.Body).Decode(&payload); err != nil {
		t.Fatalf("decode replay response: %v", err)
	}

	if payload.Count != 0 {
		t.Fatalf("count = %d, want 0", payload.Count)
	}
	if len(payload.Events) != 0 {
		t.Fatalf("events = %d, want 0", len(payload.Events))
	}
}

func TestHandleWebSocketRejectsLocalhostWithoutAuth(t *testing.T) {
	t.Parallel()

	logger := zap.NewNop()
	manager := ws.NewManager(logger, security.DefaultAllowedOrigins())
	hub := ws.NewHub(manager, nil, logger)
	handler := NewWebSocketHandler(manager, hub, "secret", nil, logger)

	app := fiber.New()
	app.Get("/ws", handler.HandleWebSocket)

	req := httptest.NewRequest(http.MethodGet, "/ws", nil)
	req.RemoteAddr = "127.0.0.1:12345"
	req.Header.Set("Connection", "Upgrade")
	req.Header.Set("Upgrade", "websocket")

	resp, err := app.Test(req, -1)
	if err != nil {
		t.Fatalf("app.Test error = %v", err)
	}
	defer resp.Body.Close()

	if resp.StatusCode != http.StatusUnauthorized {
		t.Fatalf("status = %d, want %d", resp.StatusCode, http.StatusUnauthorized)
	}
}

func TestWriteSSEEventFormatsEnvelope(t *testing.T) {
	t.Parallel()

	event := ws.NewRealtimeEvent(ws.EventMetricsUpdate, "user-1", map[string]interface{}{
		"latency_ms": 42,
	})

	var buf bytes.Buffer
	writer := bufio.NewWriter(&buf)
	if err := writeSSEEvent(writer, event.EventType, event); err != nil {
		t.Fatalf("writeSSEEvent error = %v", err)
	}
	if err := writer.Flush(); err != nil {
		t.Fatalf("flush error = %v", err)
	}

	body := buf.String()
	if !strings.Contains(body, "event: "+event.EventType) {
		t.Fatalf("missing SSE event line in %q", body)
	}
	if !strings.Contains(body, "data: ") {
		t.Fatalf("missing SSE data line in %q", body)
	}
	if !strings.Contains(body, event.EventID) {
		t.Fatalf("missing event id in %q", body)
	}
}
