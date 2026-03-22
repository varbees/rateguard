package websocket

import (
	"fmt"
	"io"
	"testing"

	"go.uber.org/zap"
	"go.uber.org/zap/zapcore"
)

func TestGetClientCountForUser(t *testing.T) {
	manager := &Manager{
		clients: map[string]*Client{
			"client-1": {ID: "client-1", UserID: "user-1"},
			"client-2": {ID: "client-2", UserID: "user-1"},
			"client-3": {ID: "client-3", UserID: "user-2"},
		},
	}

	if got := manager.GetClientCountForUser("user-1"); got != 2 {
		t.Fatalf("count = %d, want 2", got)
	}

	if got := manager.GetClientCountForUser("user-2"); got != 1 {
		t.Fatalf("count = %d, want 1", got)
	}

	if got := manager.GetClientCountForUser("missing"); got != 0 {
		t.Fatalf("count = %d, want 0", got)
	}
}

func TestActiveClientCountForUser(t *testing.T) {
	manager := &Manager{
		clients: map[string]*Client{
			"client-1": {ID: "client-1", UserID: "user-1"},
			"client-2": {ID: "client-2", UserID: "user-1"},
		},
	}
	hub := &Hub{manager: manager}

	if got := hub.ActiveClientCountForUser("user-1"); got != 2 {
		t.Fatalf("count = %d, want 2", got)
	}

	if got := hub.ActiveClientCountForUser("missing"); got != 0 {
		t.Fatalf("count = %d, want 0", got)
	}
}

func BenchmarkBroadcastMessage(b *testing.B) {
	core := zapcore.NewCore(
		zapcore.NewConsoleEncoder(zap.NewDevelopmentEncoderConfig()),
		zapcore.AddSync(io.Discard),
		zapcore.ErrorLevel,
	)
	manager := &Manager{
		clients: make(map[string]*Client, 100),
		logger:  zap.New(core),
	}

	for i := 0; i < 100; i++ {
		id := fmt.Sprintf("client-%03d", i)
		manager.clients[id] = &Client{
			ID:   id,
			Send: make(chan []byte, 1),
		}
	}

	payload := []byte(`{"event_type":"metrics.update","occurred_at":"2026-03-22T00:00:00Z"}`)

	b.ResetTimer()
	for i := 0; i < b.N; i++ {
		manager.broadcastMessage(payload)
		for _, client := range manager.clients {
			select {
			case <-client.Send:
			default:
			}
		}
	}
}

func BenchmarkBroadcastToUser(b *testing.B) {
	core := zapcore.NewCore(
		zapcore.NewConsoleEncoder(zap.NewDevelopmentEncoderConfig()),
		zapcore.AddSync(io.Discard),
		zapcore.ErrorLevel,
	)
	manager := &Manager{
		clients: make(map[string]*Client, 100),
		logger:  zap.New(core),
	}

	for i := 0; i < 50; i++ {
		id := fmt.Sprintf("user-a-client-%03d", i)
		manager.clients[id] = &Client{
			ID:     id,
			UserID: "user-a",
			Send:   make(chan []byte, 1),
		}
	}
	for i := 0; i < 50; i++ {
		id := fmt.Sprintf("user-b-client-%03d", i)
		manager.clients[id] = &Client{
			ID:     id,
			UserID: "user-b",
			Send:   make(chan []byte, 1),
		}
	}

	payload := []byte(`{"event_type":"metrics.update","occurred_at":"2026-03-22T00:00:00Z"}`)

	b.ResetTimer()
	for i := 0; i < b.N; i++ {
		manager.BroadcastToUser("user-a", payload)
		for _, client := range manager.clients {
			select {
			case <-client.Send:
			default:
			}
		}
	}
}
