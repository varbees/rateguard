package api

import (
	"context"
	"io"
	"net/http"
	"net/http/httptest"
	"os"
	"strings"
	"sync"
	"testing"
	"time"

	"github.com/gofiber/fiber/v2"
	"github.com/google/uuid"
	"github.com/varbees/rateguard/internal/models"
	internalproxy "github.com/varbees/rateguard/internal/proxy"
	"github.com/varbees/rateguard/pkg/logger"
	"go.uber.org/zap"
)

type streamingRecorderStub struct {
	mu   sync.Mutex
	done chan struct{}

	ctx        context.Context
	userID     uuid.UUID
	apiName    string
	statusCode int
	bytes      int64
	duration   time.Duration
	streamType string
}

type streamingTokenRecorderStub struct {
	mu   sync.Mutex
	done chan struct{}

	ctx        context.Context
	userID     uuid.UUID
	apiName    string
	provider   string
	model      string
	tokens     internalproxy.TokenUsage
	statusCode int
	duration   time.Duration
}

func TestMain(m *testing.M) {
	logger.Log = zap.NewNop()
	os.Exit(m.Run())
}

func (s *streamingRecorderStub) TrackStreamingMetrics(
	ctx context.Context,
	userID uuid.UUID,
	apiName string,
	statusCode int,
	bytesStreamed int64,
	duration time.Duration,
	streamType string,
) error {
	s.mu.Lock()
	s.ctx = ctx
	s.userID = userID
	s.apiName = apiName
	s.statusCode = statusCode
	s.bytes = bytesStreamed
	s.duration = duration
	s.streamType = streamType
	s.mu.Unlock()

	close(s.done)
	return nil
}

func (s *streamingTokenRecorderStub) TrackStreamingLLMResponse(
	ctx context.Context,
	userID uuid.UUID,
	apiName string,
	provider string,
	model string,
	tokenUsage internalproxy.TokenUsage,
	statusCode int,
	duration time.Duration,
) {
	s.mu.Lock()
	s.ctx = ctx
	s.userID = userID
	s.apiName = apiName
	s.provider = provider
	s.model = model
	s.tokens = tokenUsage
	s.statusCode = statusCode
	s.duration = duration
	s.mu.Unlock()

	close(s.done)
}

func TestStreamTransparentProxyResponseStreamsBodyAndTracksMetrics(t *testing.T) {
	recorder := &streamingRecorderStub{done: make(chan struct{})}
	tokenRecorder := &streamingTokenRecorderStub{done: make(chan struct{})}
	app := fiber.New()

	app.Get("/stream", func(c *fiber.Ctx) error {
		raw := "data: {\"usage\":{\"prompt_tokens\":3,\"completion_tokens\":5,\"total_tokens\":8},\"model\":\"gpt-4o\"}\n\n"
		response := &models.ProxyResponse{
			RequestID:     "req-1",
			StatusCode:    http.StatusOK,
			Headers:       http.Header{"Content-Type": []string{"text/event-stream"}},
			RawBody:       io.NopCloser(strings.NewReader(raw)),
			Duration:      42 * time.Millisecond,
			StreamingType: "sse",
			IsStreaming:   true,
			LLMProvider:   "openai",
			LLMModel:      "gpt-4o",
		}

		return streamTransparentProxyResponse(c, response, response.RequestID, uuid.MustParse("11111111-1111-1111-1111-111111111111"), "api-1", recorder, tokenRecorder)
	})

	req := httptest.NewRequest(http.MethodGet, "/stream", nil)
	resp, err := app.Test(req)
	if err != nil {
		t.Fatalf("app.Test failed: %v", err)
	}
	defer resp.Body.Close()

	body, err := io.ReadAll(resp.Body)
	if err != nil {
		t.Fatalf("failed to read response body: %v", err)
	}

	if resp.StatusCode != http.StatusOK {
		t.Fatalf("unexpected status code: %d", resp.StatusCode)
	}
	expectedBody := "data: {\"usage\":{\"prompt_tokens\":3,\"completion_tokens\":5,\"total_tokens\":8},\"model\":\"gpt-4o\"}\n\n"
	if got := string(body); got != expectedBody {
		t.Fatalf("unexpected body: %q", got)
	}

	select {
	case <-recorder.done:
	case <-time.After(2 * time.Second):
		t.Fatal("timed out waiting for streaming metrics")
	}

	recorder.mu.Lock()
	defer recorder.mu.Unlock()

	if recorder.ctx == nil {
		t.Fatal("expected metrics context to be recorded")
	}
	if recorder.userID.String() != "11111111-1111-1111-1111-111111111111" {
		t.Fatalf("unexpected user id: %s", recorder.userID)
	}
	if recorder.apiName != "api-1" {
		t.Fatalf("unexpected api name: %s", recorder.apiName)
	}
	if recorder.statusCode != http.StatusOK {
		t.Fatalf("unexpected status code recorded: %d", recorder.statusCode)
	}
	if recorder.bytes != int64(len(expectedBody)) {
		t.Fatalf("unexpected bytes recorded: %d", recorder.bytes)
	}
	if recorder.streamType != "sse" {
		t.Fatalf("unexpected stream type: %s", recorder.streamType)
	}

	select {
	case <-tokenRecorder.done:
	case <-time.After(2 * time.Second):
		t.Fatal("timed out waiting for streaming token accounting")
	}

	tokenRecorder.mu.Lock()
	defer tokenRecorder.mu.Unlock()

	if tokenRecorder.provider != "openai" {
		t.Fatalf("unexpected provider: %s", tokenRecorder.provider)
	}
	if tokenRecorder.model != "gpt-4o" {
		t.Fatalf("unexpected model: %s", tokenRecorder.model)
	}
	if tokenRecorder.tokens.TotalTokens != 8 {
		t.Fatalf("unexpected token total: %d", tokenRecorder.tokens.TotalTokens)
	}
}
