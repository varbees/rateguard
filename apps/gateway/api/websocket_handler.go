package api

import (
	"bufio"
	"context"
	"database/sql"
	"encoding/json"
	"fmt"
	"net/http"
	"strconv"
	"strings"
	"time"

	"github.com/gofiber/fiber/v2"
	"github.com/google/uuid"
	ws "github.com/varbees/rateguard/internal/websocket"
	"go.uber.org/zap"
)

// WebSocketHandler handles WebSocket connections
type WebSocketHandler struct {
	manager   *ws.Manager
	hub       *ws.Hub
	jwtSecret string
	db        *sql.DB
	logger    *zap.Logger
}

// NewWebSocketHandler creates a new WebSocket handler
func NewWebSocketHandler(manager *ws.Manager, hub *ws.Hub, jwtSecret string, db *sql.DB, logger *zap.Logger) *WebSocketHandler {
	return &WebSocketHandler{
		manager:   manager,
		hub:       hub,
		jwtSecret: jwtSecret,
		db:        db,
		logger:    logger,
	}
}

// HandleWebSocket handles WebSocket connection upgrades
func (h *WebSocketHandler) HandleWebSocket(c *fiber.Ctx) error {
	// Extract JWT token from query parameter OR httpOnly cookie (fallback)
	token := c.Query("token")
	var userID string
	var err error

	if token == "" {
		// Try to get token from httpOnly cookie
		token = c.Cookies("access_token")
		if token == "" {
			h.logger.Warn("WebSocket connection attempt without token (checked both query and cookie)",
				zap.String("ip", c.IP()),
			)
			return c.Status(fiber.StatusUnauthorized).JSON(fiber.Map{
				"error": "Authentication token required",
			})
		}
		h.logger.Debug("Using token from httpOnly cookie for WebSocket auth",
			zap.String("ip", c.IP()),
		)
	}

	// Validate token and extract user ID
	userID, err = h.manager.ValidateToken(token, h.jwtSecret)
	if err != nil {
		h.logger.Warn("WebSocket connection attempt with invalid token",
			zap.String("ip", c.IP()),
			zap.Error(err),
		)
		return c.Status(fiber.StatusUnauthorized).JSON(fiber.Map{
			"error": "Invalid or expired token",
		})
	}

	// Upgrade to WebSocket using gorilla/websocket
	// We need to convert Fiber's fasthttp context to net/http compatible types
	if c.Get("Upgrade") != "websocket" {
		h.logger.Warn("Non-WebSocket upgrade request to /ws endpoint")
		return c.Status(fiber.StatusBadRequest).JSON(fiber.Map{
			"error": "Expected WebSocket upgrade",
		})
	}

	// Use Fiber's context to handle the WebSocket upgrade
	// Fiber v2 doesn't have direct WebSocket support, we need to use the underlying fasthttp
	// and adapt it to net/http for gorilla/websocket

	c.Set("Sec-WebSocket-Version", "13")

	// Create an adapter to convert fasthttp to net/http
	err = h.upgradeWebSocket(c, userID)
	if err != nil {
		h.logger.Error("Failed to upgrade WebSocket connection",
			zap.Error(err),
		)
		return err
	}

	return nil
}

// StreamEvents serves Server-Sent Events for live realtime updates.
func (h *WebSocketHandler) StreamEvents(c *fiber.Ctx) error {
	since := parseReplaySince(c)
	limit := parseReplayLimit(c, 100)

	c.Set("Content-Type", "text/event-stream")
	c.Set("Cache-Control", "no-cache")
	c.Set("Connection", "keep-alive")
	c.Set("X-Accel-Buffering", "no")
	c.Status(fiber.StatusOK)

	c.Context().SetBodyStreamWriter(func(w *bufio.Writer) {
		if replay, err := h.hub.ReplayEventsSince(since, limit); err == nil {
			for _, event := range replay {
				if err := writeSSEEvent(w, "replay", event); err != nil {
					h.logger.Debug("SSE replay write failed",
						zap.Error(err),
					)
					return
				}
			}
		} else {
			h.logger.Warn("Failed to load SSE replay window",
				zap.Error(err),
			)
		}

		done := c.Context().Done()
		if done == nil {
			done = make(chan struct{})
		}

		pubsub, err := h.hub.Subscribe(context.Background())
		if err != nil {
			h.logger.Warn("Realtime SSE live subscription unavailable",
				zap.Error(err),
			)
			return
		}
		defer pubsub.Close()

		heartbeat := time.NewTicker(15 * time.Second)
		defer heartbeat.Stop()

		messages := pubsub.Channel()
		for {
			select {
			case <-done:
				return
			case <-heartbeat.C:
				if err := writeSSEComment(w, "heartbeat"); err != nil {
					return
				}
			case msg, ok := <-messages:
				if !ok {
					return
				}
				var event ws.WebSocketEvent
				if err := json.Unmarshal([]byte(msg.Payload), &event); err != nil {
					h.logger.Warn("Failed to decode realtime SSE payload",
						zap.Error(err),
					)
					continue
				}
				if err := writeSSEEvent(w, event.EventType, event); err != nil {
					h.logger.Debug("SSE live write failed",
						zap.Error(err),
					)
					return
				}
			}

			if err := w.Flush(); err != nil {
				return
			}
		}
	})

	return nil
}

// ReplayEvents returns a JSON replay window for durable catch-up.
func (h *WebSocketHandler) ReplayEvents(c *fiber.Ctx) error {
	since := parseReplaySince(c)
	limit := parseReplayLimit(c, 100)

	events, err := h.hub.ReplayEventsSince(since, limit)
	if err != nil {
		h.logger.Error("Failed to replay realtime events",
			zap.Error(err),
		)
		return c.Status(fiber.StatusInternalServerError).JSON(fiber.Map{
			"error":   "Failed to replay events",
			"message": err.Error(),
		})
	}

	return c.JSON(fiber.Map{
		"since":  since.Format(time.RFC3339Nano),
		"count":  len(events),
		"events": events,
	})
}

// upgradeWebSocket performs the actual WebSocket upgrade
func (h *WebSocketHandler) upgradeWebSocket(c *fiber.Ctx, userID string) error {
	// Create a net/http request adapter
	req := &http.Request{
		Method: c.Method(),
		Header: make(http.Header),
	}

	// Copy headers from Fiber to net/http Request
	// c.Request().Header.VisitAll(func(key, value []byte) {
	// 	req.Header.Add(string(key), string(value))
	// })
	for k, vv := range c.Request().Header.All() {
		key := string(k)
		for _, v := range vv {
			req.Header.Add(key, string(v))
		}
	}

	// Create a response writer adapter
	respWriter := &fiberResponseWriter{ctx: c}

	// Upgrade the connection
	conn, err := h.manager.UpgradeConnection(respWriter, req)
	if err != nil {
		return err
	}

	// Create client
	client := &ws.Client{
		ID:     uuid.New().String(),
		UserID: userID,
		Conn:   conn,
		Send:   make(chan []byte, 256),
	}

	h.logger.Info("New WebSocket connection",
		zap.String("client_id", client.ID),
		zap.String("user_id", userID),
		zap.String("ip", c.IP()),
	)

	// Register client with manager
	h.manager.RegisterClient(client)

	// Start client read/write pumps
	client.StartPumps(h.logger, h.manager)

	return nil
}

// fiberResponseWriter adapts Fiber's context to http.ResponseWriter interface
type fiberResponseWriter struct {
	ctx        *fiber.Ctx
	statusCode int
	written    bool
}

func (w *fiberResponseWriter) Header() http.Header {
	headers := make(http.Header)
	w.ctx.Response().Header.VisitAll(func(key, value []byte) {
		headers.Add(string(key), string(value))
	})
	return headers
}

func (w *fiberResponseWriter) Write(data []byte) (int, error) {
	if !w.written {
		w.WriteHeader(http.StatusOK)
	}
	w.ctx.Response().AppendBody(data)
	return len(data), nil
}

func (w *fiberResponseWriter) WriteHeader(statusCode int) {
	if w.written {
		return
	}
	w.statusCode = statusCode
	w.ctx.Status(statusCode)
	w.written = true
}

// TestBroadcast handles test broadcast requests for Phase 1 verification
func (h *WebSocketHandler) TestBroadcast(c *fiber.Ctx) error {
	// Get user ID from context (set by auth middleware)
	var userID string

	// Handle different types for user_id in Locals
	switch v := c.Locals("user_id").(type) {
	case string:
		userID = v
	case int64:
		userID = fmt.Sprintf("%d", v)
	case float64:
		userID = fmt.Sprintf("%.0f", v)
	default:
		// Try to parse from JWT if not in Locals (fallback)
		// Or return error
		h.logger.Warn("User ID not found or invalid type in Locals", zap.Any("user_id", c.Locals("user_id")))
		return c.Status(fiber.StatusUnauthorized).JSON(fiber.Map{
			"error": "User not authenticated",
		})
	}

	// Parse request body
	type TestBroadcastRequest struct {
		Message string `json:"message"`
		Global  bool   `json:"global"` // If true, broadcast to all users
	}

	var req TestBroadcastRequest
	if err := c.BodyParser(&req); err != nil {
		return c.Status(fiber.StatusBadRequest).JSON(fiber.Map{
			"error": "Invalid request body",
		})
	}

	if req.Message == "" {
		req.Message = "Test broadcast from backend"
	}

	// Publish test message via hub (Redis Pub/Sub)
	targetUserID := userID
	if req.Global {
		targetUserID = "" // Empty string means broadcast to all users
	}

	err := h.hub.PublishTestMessage(targetUserID, req.Message)
	if err != nil {
		h.logger.Error("Failed to publish test message",
			zap.Error(err),
		)
		return c.Status(fiber.StatusInternalServerError).JSON(fiber.Map{
			"error": "Failed to broadcast message",
		})
	}

	h.logger.Info("Test broadcast triggered",
		zap.String("user_id", userID),
		zap.String("target_user_id", targetUserID),
		zap.String("message", req.Message),
		zap.Bool("global", req.Global),
	)

	return c.JSON(fiber.Map{
		"success":   true,
		"message":   "Broadcast sent successfully",
		"timestamp": time.Now().Unix(),
		"clients":   h.manager.GetClientCount(),
	})
}

func parseReplaySince(c *fiber.Ctx) time.Time {
	raw := strings.TrimSpace(c.Query("since"))
	if raw == "" {
		raw = strings.TrimSpace(c.Get("Last-Event-Time"))
	}
	if raw == "" {
		return time.Time{}
	}

	if ts, err := time.Parse(time.RFC3339Nano, raw); err == nil {
		return ts.UTC()
	}
	if ts, err := time.Parse(time.RFC3339, raw); err == nil {
		return ts.UTC()
	}
	if unixValue, err := strconv.ParseInt(raw, 10, 64); err == nil {
		if len(raw) > 10 {
			return time.UnixMilli(unixValue).UTC()
		}
		return time.Unix(unixValue, 0).UTC()
	}

	return time.Time{}
}

func parseReplayLimit(c *fiber.Ctx, defaultLimit int) int {
	limit := defaultLimit
	if raw := strings.TrimSpace(c.Query("limit")); raw != "" {
		if parsed, err := strconv.Atoi(raw); err == nil {
			limit = parsed
		}
	}
	if limit <= 0 {
		return defaultLimit
	}
	if limit > 500 {
		return 500
	}
	return limit
}

func writeSSEComment(w *bufio.Writer, comment string) error {
	if _, err := w.WriteString(": " + comment + "\n\n"); err != nil {
		return err
	}
	return nil
}

func writeSSEEvent(w *bufio.Writer, eventName string, event ws.WebSocketEvent) error {
	if eventName == "" {
		eventName = event.EventType
	}
	if eventName == "" && event.Type != "" {
		eventName = string(event.Type)
	}

	payload, err := json.Marshal(event)
	if err != nil {
		return err
	}

	if event.EventID != "" {
		if _, err := w.WriteString("id: " + event.EventID + "\n"); err != nil {
			return err
		}
	}
	if eventName != "" {
		if _, err := w.WriteString("event: " + eventName + "\n"); err != nil {
			return err
		}
	}
	if _, err := w.WriteString("data: " + string(payload) + "\n\n"); err != nil {
		return err
	}
	return nil
}
