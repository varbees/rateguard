# WebSocket Architecture - RateGuard Real-Time System

## Overview

RateGuard uses WebSockets for real-time, bidirectional communication between the backend and frontend dashboard. This eliminates the need for constant polling and provides instant updates for critical events.

## Architecture Components

### Backend Components

#### 1. WebSocket Manager (`internal/websocket/manager.go`)

- **Responsibility**: Manages all active WebSocket connections
- **Key Features**:
  - Client registration/unregistration
  - Connection lifecycle management
  - Message broadcasting to all clients
  - User-specific message routing
  - Concurrent-safe client map with RWMutex
  - JWT token validation
  - Automatic ping/pong for connection health

```go
// Manager interface
type Manager struct {
    clients    map[string]*Client
    register   chan *Client
    unregister chan *Client
    broadcast  chan []byte
    mu         sync.RWMutex
}
```

#### 2. WebSocket Hub (`internal/websocket/hub.go`)

- **Responsibility**: Redis Pub/Sub integration for multi-instance broadcasting
- **Key Features**:
  - Publishes events to Redis channel
  - Subscribes to Redis channel
  - Forwards Redis messages to local WebSocket clients
  - Supports multiple backend instances (horizontal scaling)
  - Graceful fallback to local-only broadcasting if Redis unavailable

```go
// Hub with Redis Pub/Sub
type Hub struct {
    manager     *Manager
    redisClient *cache.RedisClient
    channelName string
}
```

#### 3. WebSocket Handler (`api/websocket_handler.go`)

- **Responsibility**: HTTP → WebSocket upgrade logic
- **Key Features**:
  - Handles `/ws` endpoint
  - Authenticates via JWT (query param or httpOnly cookie)
  - Upgrades HTTP connection to WebSocket
  - Fiber → net/http adapter for gorilla/websocket
  - Test broadcast endpoint for verification

#### 4. Event Types

```go
const (
    EventMetricsUpdate             = "metrics.update"
    EventAlertTriggered            = "alert.triggered"
    EventCircuitBreakerStateChange = "circuit_breaker.state_change"
    EventTest                      = "test.message"
)
```

### Frontend Components

#### 1. WebSocket Context (`lib/websocket/context.tsx`)

- **Responsibility**: React context provider for WebSocket connection
- **Key Features**:
  - Single WebSocket connection per user session
  - Automatic reconnection with exponential backoff (max 10 attempts)
  - Event subscription system with callbacks
  - Connection status tracking
  - httpOnly cookie authentication support
  - Heartbeat ping/pong for connection health

```typescript
interface WebSocketContextValue {
  connectionStatus: ConnectionStatus;
  lastMessage: WebSocketEvent | null;
  subscribe: (eventType, callback) => unsubscribe;
  sendMessage: (message) => void;
}
```

#### 2. Component Integration

Components subscribe to specific event types and react to real-time updates:

**AlertBanner** (`components/dashboard/AlertBanner.tsx`)

- Subscribes to: `alert.triggered`
- Actions: Invalidates queries, shows toast notifications
- Removed: 5-second polling

**CircuitBreakerMonitor** (`components/dashboard/CircuitBreakerMonitor.tsx`)

- Subscribes to: `circuit_breaker.state_change`
- Actions: Invalidates queries, shows state change notifications
- Removed: 5-second polling

## Authentication Flow

### Production (httpOnly Cookies)

```
1. User logs in
   ↓
2. Backend sets httpOnly cookies (access_token, refresh_token)
   ↓
3. Frontend makes WebSocket connection to /ws
   ↓
4. Browser automatically sends httpOnly cookies with upgrade request
   ↓
5. Backend validates cookie token and accepts connection
   ↓
6. WebSocket connection established
```

### Development (Query Parameter Fallback)

```
1. Frontend reads token from document.cookie (non-httpOnly)
   ↓
2. Constructs WebSocket URL: ws://host/ws?token=<token>
   ↓
3. Backend validates query token
   ↓
4. WebSocket connection established
```

**Priority**: Cookie authentication > Query parameter

## Message Flow

### 1. Metrics Update Flow

```
ProxyService completes request
  ↓
UsageTracker accumulates metrics (buffered, every 1 second)
  ↓
Hub.PublishMetricsUpdate(userID, data)
  ↓
Redis Pub/Sub → All backend instances
  ↓
Manager.BroadcastToUser(userID, message)
  ↓
All WebSocket clients for that user receive update
  ↓
Frontend components invalidate queries and update UI
```

### 2. Alert Flow

```
AlertDetector detects threshold breach
  ↓
Hub.PublishAlert(userID, alert)
  ↓
Redis Pub/Sub → All backend instances
  ↓
Manager.BroadcastToUser(userID, message)
  ↓
AlertBanner receives event
  ↓
Invalidates queries + Shows toast notification
```

### 3. Circuit Breaker Flow

```
Circuit breaker changes state (open/half-open/closed)
  ↓
Hub.PublishCircuitBreakerUpdate(userID, apiID, state)
  ↓
Redis Pub/Sub → All backend instances
  ↓
Manager.BroadcastToUser(userID, message)
  ↓
CircuitBreakerMonitor receives event
  ↓
Invalidates queries + Shows state notification
```

## Scaling Considerations

### Single Instance

- WebSocket Manager maintains local client map
- Events broadcast directly to connected clients
- No Redis required (falls back to local-only)

### Multiple Instances (Horizontal Scaling)

- Each instance has its own WebSocket Manager
- Redis Pub/Sub coordinates message distribution
- Events published to Redis channel: `ws:events`
- All instances subscribe and broadcast to their local clients

### Load Balancing

- Sticky sessions recommended (session affinity)
- Alternative: Each instance handles its own clients independently
- Redis ensures all instances receive all events

## Connection Lifecycle

### Connection Establishment

1. Frontend initiates WebSocket upgrade to `/ws`
2. Backend validates authentication (cookie or query token)
3. Backend creates Client struct with unique ID
4. Manager registers client
5. writePump and readPump goroutines started
6. Ping/pong heartbeat initiated (54s interval)

### Connection Maintenance

- **Ping**: Server sends ping every 54 seconds
- **Pong**: Client responds with pong
- **Timeouts**: Read deadline set to 60 seconds
- **Reconnection**: Frontend automatically reconnects on disconnect

### Connection Termination

1. Client or server closes connection
2. readPump detects closure
3. Manager unregisters client
4. Send channel closed
5. writePump terminates
6. Frontend initiates reconnection with exponential backoff

## Error Handling

### Backend

- **Invalid token**: Returns 401 Unauthorized
- **Upgrade failure**: Returns 400 Bad Request
- **Write errors**: Logs and closes connection
- **Redis unavailable**: Falls back to local broadcasting

### Frontend

- **Connection error**: Sets status to "error", attempts reconnection
- **Connection close**: Sets status to "disconnected", attempts reconnection
- **Max reconnect attempts**: Stops after 10 attempts (logs error)
- **Message parse error**: Logs error, continues listening

## Performance Optimizations

### Backend

1. **Buffered channels**: 256-byte buffer for broadcast/send channels
2. **Gorilla WebSocket**: Optimized WebSocket implementation
3. **Concurrent-safe maps**: RWMutex for read-heavy workloads
4. **Selective broadcasting**: User-specific vs. global broadcasts

### Frontend

1. **Single connection**: Reused across all components
2. **Subscription pattern**: Callbacks only for relevant events
3. **No polling**: Eliminated 5s/10s/30s/60s polling intervals
4. **Efficient invalidation**: Only invalidate queries when updates arrive

### Payload Optimization

- **Minimal JSON**: Only essential fields in messages
- **Type-specific data**: Tailored payloads per event type
- **Compression**: Consider gzip for large payloads (future)

## Monitoring and Debugging

### Backend Logs

```bash
# Connection logs
[WebSocket] Connected successfully
[WebSocket] Connection closed: 1000

# Event logs
Published event to Redis: circuit_breaker.state_change
Broadcast message sent: recipients=3, message_size=142
```

### Frontend Console

```javascript
[WebSocket] Connecting to: wss://api.example.com/ws
[WebSocket] Connected successfully
[WebSocket] Message received: alert.triggered
```

### Health Checks

```bash
# Check connected clients
curl http://localhost:8008/ready | jq '.websocket'

# Trigger test broadcast
curl -X POST http://localhost:8008/api/v1/test/broadcast \
  -H "Authorization: Bearer $TOKEN" \
  -d '{"message": "test", "global": false}'
```

### Load Testing

```bash
# Run comprehensive WebSocket load tests
./test-websocket-load.sh
```

## Migration from Polling

### Before (Polling)

```typescript
useQuery({
  queryKey: ["alerts"],
  queryFn: fetchAlerts,
  refetchInterval: 5000, // Poll every 5 seconds
});
```

### After (WebSocket)

```typescript
// Initial fetch (no polling)
useQuery({
  queryKey: ["alerts"],
  queryFn: fetchAlerts,
  // No refetchInterval
});

// Real-time updates
useEffect(() => {
  const unsubscribe = subscribe("alert.triggered", (event) => {
    queryClient.invalidateQueries({ queryKey: ["alerts"] });
    toast.error(event.data.title);
  });
  return unsubscribe;
}, []);
```

### Benefits

- **Reduced server load**: No constant polling requests
- **Instant updates**: Events delivered immediately (< 100ms vs. up to 5s)
- **Lower bandwidth**: Single persistent connection vs. repeated HTTP requests
- **Better UX**: Real-time notifications and updates

## Security Considerations

### Authentication

- ✅ JWT validation required for all connections
- ✅ httpOnly cookies prevent XSS attacks
- ✅ Token validation on every connection
- ✅ User-specific message routing

### Authorization

- ✅ Messages scoped to user_id
- ✅ No cross-user message delivery
- ✅ Backend enforces user isolation

### Transport Security

- ✅ WSS (WebSocket Secure) for production
- ✅ HTTPS-only cookies
- ✅ CORS validation
- ✅ Origin checking in WebSocket upgrader

## Deployment Checklist

### Backend

- [ ] Redis connection configured (optional but recommended)
- [ ] JWT_SECRET environment variable set
- [ ] WebSocket endpoint `/ws` accessible
- [ ] Load balancer configured for WebSocket (sticky sessions or upgrade support)
- [ ] Firewall allows WebSocket connections

### Frontend

- [ ] NEXT_PUBLIC_API_URL points to correct backend
- [ ] WebSocketProvider wraps application in providers.tsx
- [ ] Components using useWebSocket are within provider
- [ ] WSS protocol used for production (HTTPS)

### Testing

- [ ] Single connection stability test
- [ ] Multiple concurrent connections test
- [ ] Reconnection behavior test
- [ ] Message broadcasting test
- [ ] Performance under load test

## Troubleshooting

### Connection Issues

**Problem**: "useWebSocket must be used within WebSocketProvider"

- **Solution**: Ensure WebSocketProvider wraps your app in providers.tsx

**Problem**: WebSocket connection fails with 401

- **Solution**: Check JWT token validity, ensure cookies are being sent

**Problem**: WebSocket connection drops frequently

- **Solution**: Check load balancer WebSocket timeout settings

**Problem**: Messages not received

- **Solution**: Verify Redis connection, check user_id in events

### Performance Issues

**Problem**: High memory usage with many clients

- **Solution**: Implement connection limits, reduce message buffer sizes

**Problem**: Slow message delivery

- **Solution**: Check Redis latency, optimize payload size

## Future Enhancements

1. **Protobuf encoding**: Reduce payload size by 60-80%
2. **Message batching**: Aggregate multiple updates into single message
3. **Compression**: gzip for large payloads
4. **Presence system**: Track online/offline users
5. **Typing indicators**: Real-time collaboration features
6. **Binary messages**: Streaming large datasets
7. **WebSocket clustering**: Advanced load balancing strategies

## References

- [RFC 6455: The WebSocket Protocol](https://tools.ietf.org/html/rfc6455)
- [Gorilla WebSocket Documentation](https://github.com/gorilla/websocket)
- [Redis Pub/Sub](https://redis.io/docs/manual/pubsub/)
- [React Context API](https://react.dev/reference/react/useContext)
