package websocket

import (
	"encoding/json"
	"io"
	"testing"
	"time"

	"github.com/redis/go-redis/v9"
	"go.uber.org/zap"
	"go.uber.org/zap/zapcore"
)

func testHubLogger() *zap.Logger {
	core := zapcore.NewCore(
		zapcore.NewConsoleEncoder(zap.NewDevelopmentEncoderConfig()),
		zapcore.AddSync(io.Discard),
		zapcore.DebugLevel,
	)
	return zap.New(core)
}

func TestConsumeRedisMessagesStopsOnClosedChannel(t *testing.T) {
	t.Parallel()

	hub := &Hub{
		logger: testHubLogger(),
	}

	ch := make(chan *redis.Message)
	close(ch)

	done := make(chan struct{})
	go func() {
		hub.consumeRedisMessages(ch)
		close(done)
	}()

	select {
	case <-done:
	case <-time.After(2 * time.Second):
		t.Fatal("consumer did not return on closed channel")
	}
}

func TestHandleRedisMessageWithoutManagerDoesNotPanic(t *testing.T) {
	t.Parallel()

	hub := &Hub{
		logger: testHubLogger(),
	}

	event := NewRealtimeEvent(EventTest, "user-1", map[string]interface{}{"message": "hello"})
	hub.handleRedisMessage(string(mustJSON(t, event)))
}

func mustJSON(t *testing.T, v interface{}) []byte {
	t.Helper()

	data, err := json.Marshal(v)
	if err != nil {
		t.Fatalf("marshal failed: %v", err)
	}
	return data
}
