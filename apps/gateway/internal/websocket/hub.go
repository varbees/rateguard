package websocket

import (
	"context"
	"encoding/json"
	"fmt"
	"sync"
	"time"

	"github.com/google/uuid"
	"github.com/redis/go-redis/v9"
	"github.com/varbees/rateguard/internal/cache"
	"go.uber.org/zap"
)

const EventStreamName = "rateguard:events"

// EventType represents the type of WebSocket event
type EventType string

const (
	// EventMetricsUpdate is sent when metrics are updated
	EventMetricsUpdate EventType = "metrics.update"
	// EventAlertTriggered is sent when an alert is triggered
	EventAlertTriggered EventType = "alert.triggered"
	// EventCircuitBreakerStateChange is sent when a circuit breaker changes state
	EventCircuitBreakerStateChange EventType = "circuit_breaker.state_change"
	// EventSystemHealth is sent when system health status is updated
	EventSystemHealth EventType = "system.health"
	// EventAPIMetricsUpdate is sent when per-API metrics are updated
	EventAPIMetricsUpdate EventType = "api.metrics.update"
	// EventTest is used for testing
	EventTest EventType = "test.message"
)

// WebSocketEvent represents a message sent over WebSocket
type WebSocketEvent struct {
	EventID    string                 `json:"event_id"`
	EventType  string                 `json:"event_type"`
	TenantID   string                 `json:"tenant_id,omitempty"`
	RouteID    string                 `json:"route_id,omitempty"`
	UpstreamID string                 `json:"upstream_id,omitempty"`
	TraceID    string                 `json:"trace_id,omitempty"`
	OccurredAt time.Time              `json:"occurred_at"`
	Payload    map[string]interface{} `json:"payload,omitempty"`

	// Legacy fields are still exposed to websocket/dashboard consumers during the transition.
	Type      EventType              `json:"type,omitempty"`
	Timestamp int64                  `json:"timestamp,omitempty"`
	Data      map[string]interface{} `json:"data,omitempty"`
	UserID    string                 `json:"user_id,omitempty"` // If set, only broadcast to this user
}

// Hub manages Redis Pub/Sub for broadcasting events across multiple backend instances
type Hub struct {
	manager      *Manager
	redisClient  *cache.RedisClient
	logger       *zap.Logger
	channelName  string
	ctx          context.Context
	cancel       context.CancelFunc
	archiveMu    sync.RWMutex
	archive      []WebSocketEvent
	archiveLimit int
}

// NewHub creates a new WebSocket hub with Redis Pub/Sub
func NewHub(manager *Manager, redisClient *cache.RedisClient, logger *zap.Logger) *Hub {
	ctx, cancel := context.WithCancel(context.Background())

	return &Hub{
		manager:      manager,
		redisClient:  redisClient,
		logger:       logger,
		channelName:  "ws:events", // Single Redis channel for all WebSocket events
		ctx:          ctx,
		cancel:       cancel,
		archiveLimit: 1000,
	}
}

// Start begins listening for Redis Pub/Sub messages
func (h *Hub) Start() {
	if h.redisClient == nil {
		h.logger.Warn("Redis client not available, WebSocket broadcasting will be local-only")
		return
	}

	h.logger.Info("Starting WebSocket hub with Redis Pub/Sub",
		zap.String("channel", h.channelName),
	)

	go h.listen()
}

// ActiveClientCountForUser returns the number of active WebSocket clients for a user.
func (h *Hub) ActiveClientCountForUser(userID string) int {
	if h == nil || h.manager == nil {
		return 0
	}

	return h.manager.GetClientCountForUser(userID)
}

// listen subscribes to Redis channel and forwards messages to WebSocket clients
func (h *Hub) listen() {
	pubsub := h.redisClient.GetClient().Subscribe(h.ctx, h.channelName)
	defer pubsub.Close()

	// Wait for subscription confirmation
	_, err := pubsub.Receive(h.ctx)
	if err != nil {
		h.logger.Error("Failed to subscribe to Redis channel",
			zap.String("channel", h.channelName),
			zap.Error(err),
		)
		return
	}

	h.logger.Info("Subscribed to Redis channel",
		zap.String("channel", h.channelName),
	)

	h.consumeRedisMessages(pubsub.Channel())
}

func (h *Hub) consumeRedisMessages(ch <-chan *redis.Message) {
	var done <-chan struct{}
	if h.ctx != nil {
		done = h.ctx.Done()
	}

	for {
		select {
		case msg, ok := <-ch:
			if !ok || msg == nil {
				if h.logger != nil {
					h.logger.Info("Redis pubsub channel closed")
				}
				return
			}
			h.handleRedisMessage(msg.Payload)
		case <-done:
			if h.logger != nil {
				h.logger.Info("Stopping Redis listener")
			}
			return
		}
	}
}

// handleRedisMessage processes a message received from Redis
func (h *Hub) handleRedisMessage(payload string) {
	var event WebSocketEvent
	if err := json.Unmarshal([]byte(payload), &event); err != nil {
		if h.logger != nil {
			h.logger.Error("Failed to unmarshal WebSocket event from Redis",
				zap.Error(err),
				zap.String("payload", payload),
			)
		}
		return
	}

	// Convert event back to JSON for WebSocket clients
	messageBytes, err := json.Marshal(event)
	if err != nil {
		if h.logger != nil {
			h.logger.Error("Failed to marshal WebSocket event",
				zap.Error(err),
			)
		}
		return
	}

	// Broadcast to appropriate clients
	if event.UserID != "" {
		// User-specific event
		if h.manager == nil {
			if h.logger != nil {
				h.logger.Warn("WebSocket manager unavailable for user-specific event",
					zap.String("user_id", event.UserID),
					zap.String("event_type", string(event.Type)),
				)
			}
			return
		}
		h.manager.BroadcastToUser(event.UserID, messageBytes)
		if h.logger != nil {
			h.logger.Debug("Forwarded user-specific event from Redis to WebSocket clients",
				zap.String("event_type", string(event.Type)),
				zap.String("user_id", event.UserID),
			)
		}
	} else {
		// Global event
		if h.manager == nil {
			if h.logger != nil {
				h.logger.Warn("WebSocket manager unavailable for global event",
					zap.String("event_type", string(event.Type)),
				)
			}
			return
		}
		h.manager.Broadcast(messageBytes)
		if h.logger != nil {
			h.logger.Debug("Forwarded global event from Redis to WebSocket clients",
				zap.String("event_type", string(event.Type)),
				zap.Int("client_count", h.manager.GetClientCount()),
			)
		}
	}
}

// Publish sends an event to Redis for broadcasting to all backend instances
func (h *Hub) Publish(event WebSocketEvent) error {
	event = normalizeEvent(event)
	h.appendArchive(event)

	if h.redisClient == nil {
		// Fallback to local broadcasting if Redis is not available
		h.logger.Debug("Redis not available, using local broadcast",
			zap.String("event_type", string(event.Type)),
		)

		messageBytes, err := json.Marshal(event)
		if err != nil {
			return fmt.Errorf("failed to marshal event: %w", err)
		}

		if h.manager == nil {
			return fmt.Errorf("websocket manager not configured")
		}

		if event.UserID != "" {
			h.manager.BroadcastToUser(event.UserID, messageBytes)
		} else {
			h.manager.Broadcast(messageBytes)
		}
		return nil
	}

	if err := h.appendEventStream(event); err != nil {
		h.logger.Warn("Failed to append realtime event to Redis stream",
			zap.String("event_id", event.EventID),
			zap.String("event_type", event.EventType),
			zap.Error(err),
		)
	}

	// Publish to Redis
	messageBytes, err := json.Marshal(event)
	if err != nil {
		return fmt.Errorf("failed to marshal event: %w", err)
	}

	err = h.redisClient.GetClient().Publish(h.ctx, h.channelName, string(messageBytes)).Err()
	if err != nil {
		h.logger.Error("Failed to publish event to Redis",
			zap.String("event_type", string(event.Type)),
			zap.Error(err),
		)
		return fmt.Errorf("failed to publish to Redis: %w", err)
	}

	h.logger.Debug("Published event to Redis",
		zap.String("event_type", string(event.Type)),
		zap.String("channel", h.channelName),
	)

	return nil
}

// ArchivedEventsSince returns a stable snapshot from the in-memory fallback archive.
func (h *Hub) ArchivedEventsSince(since time.Time) []WebSocketEvent {
	h.archiveMu.RLock()
	defer h.archiveMu.RUnlock()

	if since.IsZero() {
		out := make([]WebSocketEvent, len(h.archive))
		copy(out, h.archive)
		return out
	}

	out := make([]WebSocketEvent, 0, len(h.archive))
	for _, event := range h.archive {
		if event.OccurredAt.After(since) || event.OccurredAt.Equal(since) {
			out = append(out, event)
		}
	}
	return out
}

// ReplayEventsSince returns a replay window from Redis or the in-memory archive.
func (h *Hub) ReplayEventsSince(since time.Time, limit int) ([]WebSocketEvent, error) {
	if limit <= 0 {
		limit = 100
	}

	if h.redisClient != nil {
		events, err := h.replayFromRedis(since, limit)
		if err == nil && len(events) > 0 {
			return events, nil
		}
		if err != nil {
			h.logger.Warn("Falling back to in-memory realtime archive for replay",
				zap.Error(err),
			)
		}
	}

	events := h.ArchivedEventsSince(since)
	if len(events) > limit {
		events = events[len(events)-limit:]
	}
	return events, nil
}

// Subscribe returns a Redis Pub/Sub subscription for the realtime channel.
func (h *Hub) Subscribe(ctx context.Context) (*redis.PubSub, error) {
	if h.redisClient == nil {
		return nil, fmt.Errorf("redis client not configured")
	}
	return h.redisClient.GetClient().Subscribe(ctx, h.channelName), nil
}

func (h *Hub) appendArchive(event WebSocketEvent) {
	h.archiveMu.Lock()
	defer h.archiveMu.Unlock()

	h.archive = append(h.archive, event)
	if h.archiveLimit > 0 && len(h.archive) > h.archiveLimit {
		start := len(h.archive) - h.archiveLimit
		h.archive = append([]WebSocketEvent(nil), h.archive[start:]...)
	}
}

func (h *Hub) appendEventStream(event WebSocketEvent) error {
	if h.redisClient == nil {
		return nil
	}

	payload, err := json.Marshal(event)
	if err != nil {
		return fmt.Errorf("marshal realtime event: %w", err)
	}

	_, err = h.redisClient.GetClient().XAdd(h.ctx, &redis.XAddArgs{
		Stream: EventStreamName,
		Values: map[string]any{
			"event_id":    event.EventID,
			"event_type":  event.EventType,
			"occurred_at": event.OccurredAt.UTC().Format(time.RFC3339Nano),
			"payload":     string(payload),
		},
	}).Result()
	if err != nil {
		return fmt.Errorf("xadd realtime event: %w", err)
	}
	return nil
}

func (h *Hub) replayFromRedis(since time.Time, limit int) ([]WebSocketEvent, error) {
	if h.redisClient == nil {
		return nil, nil
	}

	entries, err := h.redisClient.GetClient().XRevRangeN(h.ctx, EventStreamName, "+", "-", int64(limit*4)).Result()
	if err != nil {
		return nil, fmt.Errorf("read realtime stream: %w", err)
	}

	events := make([]WebSocketEvent, 0, len(entries))
	for i := len(entries) - 1; i >= 0; i-- {
		event, err := eventFromStreamEntry(entries[i])
		if err != nil {
			h.logger.Warn("Skipping malformed realtime event during replay",
				zap.Error(err),
			)
			continue
		}
		if !since.IsZero() && event.OccurredAt.Before(since) {
			continue
		}
		events = append(events, event)
		if len(events) >= limit {
			break
		}
	}

	return events, nil
}

func eventFromStreamEntry(entry redis.XMessage) (WebSocketEvent, error) {
	rawPayload, ok := entry.Values["payload"]
	if !ok {
		return WebSocketEvent{}, fmt.Errorf("payload field missing")
	}

	payload, ok := rawPayload.(string)
	if !ok {
		return WebSocketEvent{}, fmt.Errorf("payload field has unexpected type %T", rawPayload)
	}

	var event WebSocketEvent
	if err := json.Unmarshal([]byte(payload), &event); err != nil {
		return WebSocketEvent{}, fmt.Errorf("unmarshal realtime event: %w", err)
	}

	return normalizeEvent(event), nil
}

func normalizeEvent(event WebSocketEvent) WebSocketEvent {
	now := time.Now().UTC()
	if event.EventID == "" {
		event.EventID = uuid.NewString()
	}
	if event.EventType == "" && event.Type != "" {
		event.EventType = string(event.Type)
	}
	if event.Type == "" && event.EventType != "" {
		event.Type = EventType(event.EventType)
	}
	if event.OccurredAt.IsZero() {
		event.OccurredAt = now
	}
	if event.Timestamp == 0 {
		event.Timestamp = event.OccurredAt.Unix()
	}
	if event.Payload == nil && event.Data != nil {
		event.Payload = event.Data
	}
	if event.Data == nil && event.Payload != nil {
		event.Data = event.Payload
	}
	return event
}

// PublishMetricsUpdate publishes a metrics update event
func (h *Hub) PublishMetricsUpdate(userID string, data map[string]interface{}) error {
	event := NewRealtimeEvent(EventMetricsUpdate, userID, data)
	return h.Publish(event)
}

// PublishAlert publishes an alert event
func (h *Hub) PublishAlert(userID string, alert interface{}) error {
	// Convert alert to map or use as is if it serializes correctly
	var data map[string]interface{}

	// If alert is already a map, use it
	if m, ok := alert.(map[string]interface{}); ok {
		data = m
	} else {
		// Otherwise marshal and unmarshal to map
		jsonBytes, err := json.Marshal(alert)
		if err != nil {
			return err
		}
		if err := json.Unmarshal(jsonBytes, &data); err != nil {
			return err
		}
	}

	event := NewRealtimeEvent(EventAlertTriggered, userID, data)
	return h.Publish(event)
}

// PublishCircuitBreakerUpdate broadcasts a circuit breaker state change
func (h *Hub) PublishCircuitBreakerUpdate(userID, apiID, apiName, state string) error {
	data := map[string]interface{}{
		"api_id":   apiID,
		"api_name": apiName,
		"state":    state,
	}

	event := NewRealtimeEvent(EventCircuitBreakerStateChange, userID, data)
	return h.Publish(event)
}

// PublishTestMessage publishes a test message (for Phase 1 verification)
func (h *Hub) PublishTestMessage(userID string, message string) error {
	event := NewRealtimeEvent(EventTest, userID, map[string]interface{}{
		"message": message,
	})
	return h.Publish(event)
}

// NewRealtimeEvent creates a normalized realtime event envelope.
func NewRealtimeEvent(eventType EventType, userID string, payload map[string]interface{}) WebSocketEvent {
	now := time.Now().UTC()
	return WebSocketEvent{
		EventID:    uuid.NewString(),
		EventType:  string(eventType),
		OccurredAt: now,
		Payload:    payload,
		Type:       eventType,
		Timestamp:  now.Unix(),
		Data:       payload,
		UserID:     userID,
	}
}

// Stop gracefully shuts down the hub
func (h *Hub) Stop() {
	h.logger.Info("Stopping WebSocket hub")
	h.cancel()
}

// PublishSystemHealth publishes a system health update
func (h *Hub) PublishSystemHealth(healthData map[string]interface{}) error {
	return h.Publish(NewRealtimeEvent(EventSystemHealth, "", healthData))
}

// getCurrentTimestamp returns current Unix timestamp in milliseconds
func getCurrentTimestamp() int64 {
	return time.Now().UnixMilli()
}
