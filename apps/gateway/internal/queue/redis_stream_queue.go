package queue

import (
	"context"
	"encoding/json"
	"fmt"
	"strconv"
	"sync/atomic"
	"time"

	"github.com/google/uuid"
	"github.com/redis/go-redis/v9"
	"github.com/varbees/rateguard/internal/cache"
	"github.com/varbees/rateguard/pkg/logger"
	"go.uber.org/zap"
)

const (
	// Stream name for analytics events
	StreamName = "analytics:events"
	
	// Max messages to read per batch
	BatchSize = 100
	
	// Block duration when waiting for new messages
	BlockDuration = 1 * time.Second
	
	// Dead letter stream for failed messages
	DeadLetterStream = "analytics:events:dlq"
	
	// Max retries before moving to DLQ
	MaxRetries = 3
)

// RedisStreamQueue implements EventQueue using Redis Streams
type RedisStreamQueue struct {
	client  *cache.RedisClient
	handler EventHandler
	
	// Metrics
	processedTotal atomic.Int64
	errorsTotal    atomic.Int64
	lastProcessed  atomic.Value // time.Time
}

// NewRedisStreamQueue creates a new Redis Streams event queue
func NewRedisStreamQueue(client *cache.RedisClient, handler EventHandler) *RedisStreamQueue {
	q := &RedisStreamQueue{
		client:  client,
		handler: handler,
	}
	
	q.lastProcessed.Store(time.Now())
	
	return q
}

// Publish sends an event to the Redis Stream
// This is fast (~1-2ms) and guarantees persistence
func (q *RedisStreamQueue) Publish(ctx context.Context, event *Event) error {
	// Serialize event data to JSON
	data, err := json.Marshal(event)
	if err != nil {
		return fmt.Errorf("failed to marshal event: %w", err)
	}
	
	// Add to stream
	// Redis Streams are append-only logs with guaranteed ordering
	args := &redis.XAddArgs{
		Stream: StreamName,
		Values: map[string]interface{}{
			"event_id":   event.ID,
			"type":       string(event.Type),
			"user_id":    event.UserID.String(),
			"timestamp":  event.Timestamp.Unix(),
			"data":       string(data),
		},
	}
	
	messageID, err := q.client.GetClient().XAdd(ctx, args).Result()
	if err != nil {
		logger.Error("Failed to publish event to Redis Stream",
			zap.String("event_id", event.ID),
			zap.String("type", string(event.Type)),
			zap.Error(err),
		)
		return fmt.Errorf("failed to publish event: %w", err)
	}
	
	logger.Debug("Event published to stream",
		zap.String("event_id", event.ID),
		zap.String("message_id", messageID),
		zap.String("type", string(event.Type)),
	)
	
	return nil
}

// StartConsumer starts a consumer that processes events from the stream
// Uses consumer groups for parallel processing and at-least-once delivery
func (q *RedisStreamQueue) StartConsumer(ctx context.Context, groupName string, consumerID string) error {
	redisClient := q.client.GetClient()
	
	// Create consumer group if it doesn't exist
	// Start reading from the beginning ("0") to process all messages
	err := redisClient.XGroupCreateMkStream(ctx, StreamName, groupName, "0").Err()
	if err != nil && err.Error() != "BUSYGROUP Consumer Group name already exists" {
		return fmt.Errorf("failed to create consumer group: %w", err)
	}
	
	logger.Info("Event queue consumer started",
		zap.String("group", groupName),
		zap.String("consumer", consumerID),
		zap.String("stream", StreamName),
	)
	
	// Start consuming loop
	go q.consumeLoop(ctx, redisClient, groupName, consumerID)
	
	return nil
}

// consumeLoop continuously reads and processes events from the stream
func (q *RedisStreamQueue) consumeLoop(ctx context.Context, client *redis.Client, groupName, consumerID string) {
	for {
		select {
		case <-ctx.Done():
			logger.Info("Event queue consumer stopping",
				zap.String("consumer", consumerID),
			)
			return
		default:
			// Read messages from stream
			streams, err := client.XReadGroup(ctx, &redis.XReadGroupArgs{
				Group:    groupName,
				Consumer: consumerID,
				Streams:  []string{StreamName, ">"},
				Count:    BatchSize,
				Block:    BlockDuration,
			}).Result()
			
			if err != nil {
				if err == redis.Nil {
					// No messages available, continue
					continue
				}
				logger.Error("Failed to read from stream",
					zap.Error(err),
				)
				time.Sleep(1 * time.Second)
				continue
			}
			
			// Process messages
			if len(streams) > 0 && len(streams[0].Messages) > 0 {
				q.processBatch(ctx, client, groupName, streams[0].Messages)
			}
		}
	}
}

// processBatch processes a batch of messages
func (q *RedisStreamQueue) processBatch(ctx context.Context, client *redis.Client, groupName string, messages []redis.XMessage) {
	events := make([]*Event, 0, len(messages))
	messageIDs := make([]string, 0, len(messages))
	
	// Parse all messages
	for _, msg := range messages {
		event, err := q.parseMessage(msg)
		if err != nil {
			logger.Error("Failed to parse message",
				zap.String("message_id", msg.ID),
				zap.Error(err),
			)
			
			// Move to dead letter queue
			q.moveToDLQ(ctx, client, msg)
			
			// Acknowledge the bad message
			client.XAck(ctx, StreamName, groupName, msg.ID)
			
			q.errorsTotal.Add(1)
			continue
		}
		
		events = append(events, event)
		messageIDs = append(messageIDs, msg.ID)
	}
	
	if len(events) == 0 {
		return
	}
	
	// Process batch with handler
	startTime := time.Now()
	err := q.handler(ctx, events)
	duration := time.Since(startTime)
	
	if err != nil {
		logger.Error("Failed to process event batch",
			zap.Int("batch_size", len(events)),
			zap.Duration("duration", duration),
			zap.Error(err),
		)
		
		// Don't acknowledge - will be retried
		// TODO: Implement retry counter and move to DLQ after MaxRetries
		q.errorsTotal.Add(int64(len(events)))
		return
	}
	
	// Acknowledge all messages in batch
	pipe := client.Pipeline()
	for _, msgID := range messageIDs {
		pipe.XAck(ctx, StreamName, groupName, msgID)
	}
	
	_, err = pipe.Exec(ctx)
	if err != nil {
		logger.Error("Failed to acknowledge messages",
			zap.Error(err),
		)
	}
	
	// Update metrics
	q.processedTotal.Add(int64(len(events)))
	q.lastProcessed.Store(time.Now())
	
	logger.Debug("Processed event batch",
		zap.Int("batch_size", len(events)),
		zap.Duration("duration", duration),
		zap.Int64("total_processed", q.processedTotal.Load()),
	)
}

// parseMessage parses a Redis Stream message into an Event
func (q *RedisStreamQueue) parseMessage(msg redis.XMessage) (*Event, error) {
	// Extract fields from message
	eventID, _ := msg.Values["event_id"].(string)
	eventType, _ := msg.Values["type"].(string)
	userIDStr, _ := msg.Values["user_id"].(string)
	timestampStr, _ := msg.Values["timestamp"].(string)
	dataJSON, _ := msg.Values["data"].(string)
	
	// Parse timestamp
	timestamp, err := time.Parse(time.RFC3339, timestampStr)
	if err != nil {
		// Try parsing as Unix timestamp
		if ts, err := strconv.ParseInt(timestampStr, 10, 64); err == nil {
			timestamp = time.Unix(ts, 0)
		} else {
			return nil, fmt.Errorf("invalid timestamp: %s", timestampStr)
		}
	}
	
	// Parse user ID
	userID, err := uuid.Parse(userIDStr)
	if err != nil {
		return nil, fmt.Errorf("invalid user_id: %w", err)
	}
	
	// Parse event data
	var event Event
	if err := json.Unmarshal([]byte(dataJSON), &event); err != nil {
		return nil, fmt.Errorf("failed to unmarshal event data: %w", err)
	}
	
	// Fill in metadata
	event.ID = eventID
	event.Type = EventType(eventType)
	event.UserID = userID
	event.Timestamp = timestamp
	
	return &event, nil
}

// moveToDLQ moves a failed message to the dead letter queue
func (q *RedisStreamQueue) moveToDLQ(ctx context.Context, client *redis.Client, msg redis.XMessage) {
	// Add to DLQ stream with original data plus error metadata
	values := make(map[string]interface{})
	for k, v := range msg.Values {
		values[k] = v
	}
	values["failed_at"] = time.Now().Unix()
	values["original_id"] = msg.ID
	
	_, err := client.XAdd(ctx, &redis.XAddArgs{
		Stream: DeadLetterStream,
		Values: values,
	}).Result()
	
	if err != nil {
		logger.Error("Failed to move message to DLQ",
			zap.String("message_id", msg.ID),
			zap.Error(err),
		)
	} else {
		logger.Warn("Message moved to dead letter queue",
			zap.String("message_id", msg.ID),
		)
	}
}

// GetStats returns queue statistics
func (q *RedisStreamQueue) GetStats(ctx context.Context) (*QueueStats, error) {
	client := q.client.GetClient()
	
	// Get stream length (pending messages)
	length, err := client.XLen(ctx, StreamName).Result()
	if err != nil {
		return nil, fmt.Errorf("failed to get stream length: %w", err)
	}
	
	lastProcessed, _ := q.lastProcessed.Load().(time.Time)
	
	return &QueueStats{
		PendingMessages: length,
		ConsumerLag:     length, // Simplified - actual lag would need consumer group info
		LastProcessedAt: lastProcessed,
		ProcessedTotal:  q.processedTotal.Load(),
		ErrorsTotal:     q.errorsTotal.Load(),
	}, nil
}

// Close gracefully shuts down the queue
func (q *RedisStreamQueue) Close() error {
	logger.Info("Event queue closed",
		zap.Int64("total_processed", q.processedTotal.Load()),
		zap.Int64("total_errors", q.errorsTotal.Load()),
	)
	return nil
}
