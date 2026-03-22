package websocket

import (
	"context"
	"fmt"
	"net/http"
	"sync"
	"time"

	"github.com/golang-jwt/jwt/v5"
	"github.com/gorilla/websocket"
	"github.com/varbees/rateguard/internal/security"
	"go.uber.org/zap"
)

// Client represents a WebSocket client connection
type Client struct {
	ID     string          // Unique client identifier
	UserID string          // User ID from JWT (string to support UUIDs)
	Conn   *websocket.Conn // WebSocket connection
	Send   chan []byte     // Buffered channel for outbound messages
	mu     sync.Mutex      // Protects Conn for concurrent writes
}

// Manager manages all active WebSocket connections
type Manager struct {
	clients        map[string]*Client // Connected clients (key: client ID)
	register       chan *Client       // Register requests from clients
	unregister     chan *Client       // Unregister requests from clients
	broadcast      chan []byte        // Broadcast messages to all clients
	mu             sync.RWMutex       // Protects clients map
	logger         *zap.Logger
	upgrader       websocket.Upgrader
	allowedOrigins []string
}

// NewManager creates a new WebSocket manager
func NewManager(logger *zap.Logger, allowedOrigins []string) *Manager {
	if len(allowedOrigins) == 0 {
		allowedOrigins = security.DefaultAllowedOrigins()
	}

	return &Manager{
		clients:        make(map[string]*Client),
		register:       make(chan *Client),
		unregister:     make(chan *Client),
		broadcast:      make(chan []byte, 256),
		logger:         logger,
		allowedOrigins: allowedOrigins,
		upgrader: websocket.Upgrader{
			ReadBufferSize:  1024,
			WriteBufferSize: 1024,
			CheckOrigin: func(r *http.Request) bool {
				origin := r.Header.Get("Origin")
				if origin == "" {
					return true
				}

				return security.OriginAllowed(allowedOrigins, origin)
			},
		},
	}
}

// Start runs the manager's main loop
func (m *Manager) Start(ctx context.Context) {
	m.logger.Info("Starting WebSocket manager")

	for {
		select {
		case client := <-m.register:
			m.registerClient(client)

		case client := <-m.unregister:
			m.unregisterClient(client)

		case message := <-m.broadcast:
			m.broadcastMessage(message)

		case <-ctx.Done():
			m.logger.Info("Shutting down WebSocket manager")
			m.closeAllConnections()
			return
		}
	}
}

// registerClient adds a client to the manager
func (m *Manager) registerClient(client *Client) {
	m.mu.Lock()
	m.clients[client.ID] = client
	m.mu.Unlock()

	m.logger.Info("Client registered",
		zap.String("client_id", client.ID),
		zap.String("user_id", client.UserID),
		zap.Int("total_clients", len(m.clients)),
	)
}

// unregisterClient removes a client from the manager
func (m *Manager) unregisterClient(client *Client) {
	m.mu.Lock()
	if _, ok := m.clients[client.ID]; ok {
		delete(m.clients, client.ID)
		close(client.Send)
	}
	m.mu.Unlock()

	m.logger.Info("Client unregistered",
		zap.String("client_id", client.ID),
		zap.String("user_id", client.UserID),
		zap.Int("total_clients", len(m.clients)),
	)
}

// broadcastMessage sends a message to all connected clients
func (m *Manager) broadcastMessage(message []byte) {
	m.mu.RLock()
	defer m.mu.RUnlock()

	for _, client := range m.clients {
		select {
		case client.Send <- message:
			// Message sent successfully
		default:
			// Client's send buffer is full, skip this client
			m.logger.Warn("Client send buffer full, dropping message",
				zap.String("client_id", client.ID),
			)
		}
	}

	m.logger.Debug("Broadcast message sent",
		zap.Int("recipients", len(m.clients)),
		zap.Int("message_size", len(message)),
	)
}

// BroadcastToUser sends a message to all connections for a specific user
func (m *Manager) BroadcastToUser(userID string, message []byte) {
	m.mu.RLock()
	defer m.mu.RUnlock()

	count := 0
	for _, client := range m.clients {
		if client.UserID == userID {
			select {
			case client.Send <- message:
				count++
			default:
				m.logger.Warn("Client send buffer full, dropping message",
					zap.String("client_id", client.ID),
				)
			}
		}
	}

	m.logger.Debug("User-specific broadcast sent",
		zap.String("user_id", userID),
		zap.Int("recipients", count),
	)
}

// Broadcast sends a message to all connected clients (public API)
func (m *Manager) Broadcast(message []byte) {
	select {
	case m.broadcast <- message:
	default:
		m.logger.Warn("Broadcast channel full, dropping message")
	}
}

// GetClientCount returns the number of connected clients
func (m *Manager) GetClientCount() int {
	m.mu.RLock()
	defer m.mu.RUnlock()
	return len(m.clients)
}

// GetClientCountForUser returns the number of connected clients for a specific user.
func (m *Manager) GetClientCountForUser(userID string) int {
	m.mu.RLock()
	defer m.mu.RUnlock()

	count := 0
	for _, client := range m.clients {
		if client.UserID == userID {
			count++
		}
	}

	return count
}

// closeAllConnections gracefully closes all client connections
func (m *Manager) closeAllConnections() {
	m.mu.Lock()
	defer m.mu.Unlock()

	for _, client := range m.clients {
		client.Conn.Close()
		close(client.Send)
	}

	m.clients = make(map[string]*Client)
	m.logger.Info("All WebSocket connections closed")
}

// UpgradeConnection upgrades an HTTP connection to WebSocket
func (m *Manager) UpgradeConnection(w http.ResponseWriter, r *http.Request) (*websocket.Conn, error) {
	return m.upgrader.Upgrade(w, r, nil)
}

// RegisterClient adds a client (public API for handlers)
func (m *Manager) RegisterClient(client *Client) {
	m.register <- client
}

// UnregisterClient removes a client (public API for handlers)
func (m *Manager) UnregisterClient(client *Client) {
	m.unregister <- client
}

// ValidateToken validates a JWT token and returns the user ID
func (m *Manager) ValidateToken(tokenString string, jwtSecret string) (string, error) {
	token, err := jwt.Parse(tokenString, func(token *jwt.Token) (interface{}, error) {
		if _, ok := token.Method.(*jwt.SigningMethodHMAC); !ok {
			return nil, fmt.Errorf("unexpected signing method: %v", token.Header["alg"])
		}
		return []byte(jwtSecret), nil
	})

	if err != nil {
		return "", err
	}

	if claims, ok := token.Claims.(jwt.MapClaims); ok && token.Valid {
		// Handle both string and float64 (JSON number) for user_id
		if userIDStr, ok := claims["user_id"].(string); ok {
			return userIDStr, nil
		}
		if userIDFloat, ok := claims["user_id"].(float64); ok {
			return fmt.Sprintf("%.0f", userIDFloat), nil
		}
		return "", fmt.Errorf("user_id not found or invalid type in token")
	}

	return "", fmt.Errorf("invalid token")
}

// writePump pumps messages from the hub to the WebSocket connection
func (c *Client) writePump(logger *zap.Logger, manager *Manager) {
	ticker := time.NewTicker(54 * time.Second)
	defer func() {
		ticker.Stop()
		if manager != nil {
			manager.UnregisterClient(c)
		}
		c.Conn.Close()
	}()

	for {
		select {
		case message, ok := <-c.Send:
			c.Conn.SetWriteDeadline(time.Now().Add(10 * time.Second))
			if !ok {
				// Channel closed
				c.Conn.WriteMessage(websocket.CloseMessage, []byte{})
				return
			}

			c.mu.Lock()
			err := c.Conn.WriteMessage(websocket.TextMessage, message)
			c.mu.Unlock()

			if err != nil {
				logger.Error("Error writing message to client",
					zap.String("client_id", c.ID),
					zap.Error(err),
				)
				return
			}

		case <-ticker.C:
			c.Conn.SetWriteDeadline(time.Now().Add(10 * time.Second))
			c.mu.Lock()
			err := c.Conn.WriteMessage(websocket.PingMessage, nil)
			c.mu.Unlock()

			if err != nil {
				logger.Debug("Ping failed, client disconnected",
					zap.String("client_id", c.ID),
				)
				return
			}
		}
	}
}

// readPump pumps messages from the WebSocket connection to the hub
func (c *Client) readPump(logger *zap.Logger, manager *Manager) {
	defer func() {
		manager.UnregisterClient(c)
		c.Conn.Close()
	}()

	c.Conn.SetReadDeadline(time.Now().Add(60 * time.Second))
	c.Conn.SetPongHandler(func(string) error {
		c.Conn.SetReadDeadline(time.Now().Add(60 * time.Second))
		return nil
	})

	for {
		_, message, err := c.Conn.ReadMessage()
		if err != nil {
			if websocket.IsUnexpectedCloseError(err, websocket.CloseGoingAway, websocket.CloseAbnormalClosure) {
				logger.Error("WebSocket read error",
					zap.String("client_id", c.ID),
					zap.Error(err),
				)
			}
			break
		}

		// For Phase 1, we just log client messages
		// Future phases can handle bidirectional communication
		logger.Debug("Received message from client",
			zap.String("client_id", c.ID),
			zap.String("message", string(message)),
		)
	}
}

// StartPumps starts the read and write pumps for a client
func (c *Client) StartPumps(logger *zap.Logger, manager *Manager) {
	go c.writePump(logger, manager)
	go c.readPump(logger, manager)
}
