package storage

import (
	"context"
	"regexp"
	"testing"
	"time"

	"github.com/DATA-DOG/go-sqlmock"
	"github.com/google/uuid"
	"github.com/stretchr/testify/assert"
	"github.com/stretchr/testify/mock"
	"github.com/varbees/rateguard/internal/queue"
	"github.com/varbees/rateguard/internal/websocket"
	"github.com/varbees/rateguard/pkg/logger"
)

// MockEventQueue is a mock implementation of queue.EventQueue
type MockEventQueue struct {
	mock.Mock
}

func (m *MockEventQueue) Publish(ctx context.Context, event *queue.Event) error {
	args := m.Called(ctx, event)
	return args.Error(0)
}

func (m *MockEventQueue) StartConsumer(ctx context.Context, groupName string, consumerID string) error {
	args := m.Called(ctx, groupName, consumerID)
	return args.Error(0)
}

func (m *MockEventQueue) Close() error {
	args := m.Called()
	return args.Error(0)
}

func (m *MockEventQueue) GetStats(ctx context.Context) (*queue.QueueStats, error) {
	args := m.Called(ctx)
	if args.Get(0) == nil {
		return nil, args.Error(1)
	}
	return args.Get(0).(*queue.QueueStats), args.Error(1)
}

// Setup test
func setupUsageTrackerTest() (*UsageTracker, *MockEventQueue) {
	// Initialize logger
	_ = logger.Initialize(logger.Config{
		Level:       "debug",
		Format:      "console",
		Development: true,
	})

	mockQueue := new(MockEventQueue)

	// We pass nil for store since we are testing queue path primarily
	tracker := NewUsageTracker(nil, nil)
	tracker.SetEventQueue(mockQueue)

	return tracker, mockQueue
}

func TestRecordRequest_Queue(t *testing.T) {
	tracker, mockQueue := setupUsageTrackerTest()
	userID := uuid.New()
	apiName := "test-api"

	// Expect Publish to be called
	mockQueue.On("Publish", mock.Anything, mock.MatchedBy(func(e *queue.Event) bool {
		return e.Type == queue.EventTypeRequest &&
			e.UserID == userID &&
			e.Data.TargetAPI == apiName
	})).Return(nil)

	err := tracker.RecordRequest(context.Background(), userID, apiName)
	assert.NoError(t, err)
	mockQueue.AssertExpectations(t)
}

func TestRecordResponse_Queue(t *testing.T) {
	tracker, mockQueue := setupUsageTrackerTest()
	userID := uuid.New()
	apiName := "test-api"
	statusCode := 200
	duration := 100 * time.Millisecond

	// Expect Publish to be called
	mockQueue.On("Publish", mock.Anything, mock.MatchedBy(func(e *queue.Event) bool {
		return e.Type == queue.EventTypeResponse &&
			e.UserID == userID &&
			e.Data.TargetAPI == apiName &&
			e.Data.StatusCode == statusCode
	})).Return(nil)

	err := tracker.RecordResponse(context.Background(), userID, apiName, statusCode, duration)
	assert.NoError(t, err)
	mockQueue.AssertExpectations(t)
}

func TestRecordLLMResponse_Queue(t *testing.T) {
	tracker, mockQueue := setupUsageTrackerTest()
	userID := uuid.New()
	apiName := "llm-api"
	model := "gpt-4"
	inputTokens := int64(10)
	outputTokens := int64(20)
	costCents := 5
	statusCode := 200
	duration := 500 * time.Millisecond

	// Expect Publish to be called
	mockQueue.On("Publish", mock.Anything, mock.MatchedBy(func(e *queue.Event) bool {
		return e.Type == queue.EventTypeLLM &&
			e.UserID == userID &&
			e.Data.TargetAPI == apiName &&
			e.Data.Model == model &&
			e.Data.InputTokens == inputTokens
	})).Return(nil)

	err := tracker.RecordLLMResponse(
		context.Background(),
		userID,
		apiName,
		model,
		inputTokens,
		outputTokens,
		costCents,
		statusCode,
		duration,
	)
	assert.NoError(t, err)
	mockQueue.AssertExpectations(t)
}

func TestGetStreamingStatsCalculatesSuccessRate(t *testing.T) {
	db, mockDB, err := sqlmock.New()
	if err != nil {
		t.Fatalf("sqlmock.New error = %v", err)
	}
	defer db.Close()

	tracker := NewUsageTracker(db, websocket.NewHub(nil, nil, nil))
	userID := uuid.New()
	start := time.Now().Add(-24 * time.Hour).UTC()
	end := time.Now().UTC()

	mockDB.ExpectQuery(regexp.QuoteMeta(`
		SELECT 
			COUNT(*) as total_streams,
			COALESCE(SUM(bytes_streamed), 0) as total_bytes,
			COALESCE(AVG(stream_duration_ms), 0) as avg_stream_duration_ms,
			COALESCE(MAX(stream_duration_ms), 0) as max_stream_duration_ms,
			COALESCE(
				100.0 * SUM(CASE WHEN status_code >= 200 AND status_code < 300 THEN 1 ELSE 0 END)
				/ NULLIF(COUNT(*), 0),
				0
			) as success_rate
		FROM api_metrics
		WHERE user_id = $1 
			AND timestamp BETWEEN $2 AND $3
			AND is_streaming = true
	`)).
		WithArgs(userID, start, end).
		WillReturnRows(sqlmock.NewRows([]string{
			"total_streams",
			"total_bytes",
			"avg_stream_duration_ms",
			"max_stream_duration_ms",
			"success_rate",
		}).AddRow(int64(12), int64(4096), float64(250.5), int64(900), float64(91.6666666667)))

	stats, err := tracker.GetStreamingStats(context.Background(), userID, start, end)
	assert.NoError(t, err)
	assert.Equal(t, int64(12), stats["total_streams"])
	assert.Equal(t, int64(4096), stats["total_bytes"])
	assert.Equal(t, float64(250.5), stats["avg_stream_duration_ms"])
	assert.Equal(t, int64(900), stats["max_stream_duration_ms"])
	assert.Equal(t, float64(91.6666666667), stats["success_rate"])
	assert.Equal(t, 0, stats["active_streams"])
	assert.Equal(t, true, stats["streaming_enabled"])

	assert.NoError(t, mockDB.ExpectationsWereMet())
}

func BenchmarkRecordRequest_Queue(b *testing.B) {
	// Initialize logger
	_ = logger.Initialize(logger.Config{
		Level:       "error", // Reduce log noise
		Format:      "console",
		Development: true,
	})

	mockQueue := new(MockEventQueue)
	tracker := NewUsageTracker(nil, nil)
	tracker.SetEventQueue(mockQueue)

	userID := uuid.New()
	apiName := "bench-api"

	// Mock Publish to do nothing and return nil
	mockQueue.On("Publish", mock.Anything, mock.Anything).Return(nil)

	b.ResetTimer()
	for i := 0; i < b.N; i++ {
		_ = tracker.RecordRequest(context.Background(), userID, apiName)
	}
}
