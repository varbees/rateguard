package proxy

import (
	"context"
	"sync"
	"time"

	"github.com/google/uuid"
	"github.com/varbees/rateguard/internal/cache"
	domainpolicy "github.com/varbees/rateguard/internal/domain/policy"
	"github.com/varbees/rateguard/pkg/logger"
	"go.uber.org/zap"
)

// Queue management methods for ProxyService

// Default queue configuration
var defaultQueueConfig = QueueConfig{
	Enabled:          true,
	MaxWaitTime:      30000, // 30 seconds
	QueueingStrategy: "fifo",
}

// Enhanced queue store with Redis persistence support
type queueStore struct {
	// Per-user queue configs
	userConfigs map[uuid.UUID]QueueConfig

	// Active requests in queues by user ID and API name (fallback for Redis unavailable)
	activeQueues map[string][]QueuedRequest // key: userID:apiName

	// Active queue waiters by user ID and API name (enforces max queue length)
	queueWaiters map[string]*queueWaiterState

	// Stats for completed requests (fallback for Redis unavailable)
	queueStats map[uuid.UUID]*QueueStats

	// Redis queue manager for persistence
	redisManager *RedisQueueManager

	// Mutex for thread safety
	mu sync.RWMutex

	// Dropped jobs counter
	droppedJobs map[uuid.UUID]int64

	// Max wait time tracking
	maxWaitTimes map[uuid.UUID]int64 // in milliseconds
}

// Initialize queue store
var queueStoreSingleton = &queueStore{
	userConfigs:  make(map[uuid.UUID]QueueConfig),
	activeQueues: make(map[string][]QueuedRequest),
	queueWaiters: make(map[string]*queueWaiterState),
	queueStats:   make(map[uuid.UUID]*QueueStats),
	droppedJobs:  make(map[uuid.UUID]int64),
	maxWaitTimes: make(map[uuid.UUID]int64),
}

// InitializeQueueStore initializes the queue store with Redis support
func InitializeQueueStore(redisClient *cache.RedisClient) {
	if redisClient != nil {
		queueStoreSingleton.redisManager = NewRedisQueueManager(redisClient)
		logger.Info("✅ Queue store initialized with Redis persistence")
	} else {
		logger.Warn("Queue store initialized without Redis - queues will be in-memory only")
	}
}

// GetQueueStats returns comprehensive queue statistics for a user
func (p *ProxyService) GetQueueStats(userID uuid.UUID) QueueStats {
	ctx := context.Background()

	// Try Redis first
	if queueStoreSingleton.redisManager != nil {
		if stats, err := queueStoreSingleton.redisManager.GetQueueStats(ctx, userID); err == nil {
			// Add dropped jobs and max wait time from in-memory tracking
			queueStoreSingleton.mu.RLock()
			if dropped, exists := queueStoreSingleton.droppedJobs[userID]; exists {
				stats.DroppedJobs = dropped
			}
			if maxWait, exists := queueStoreSingleton.maxWaitTimes[userID]; exists {
				stats.MaxWaitTime = maxWait
			}
			queueStoreSingleton.mu.RUnlock()
			return *stats
		}
	}

	// Fallback to in-memory
	queueStoreSingleton.mu.RLock()
	defer queueStoreSingleton.mu.RUnlock()

	// If stats don't exist yet, create empty stats
	stats, exists := queueStoreSingleton.queueStats[userID]
	if !exists {
		stats = &QueueStats{
			Timestamp:   time.Now(),
			QueuedByAPI: []APIQueue{},
		}
	}

	// Update timestamp for freshness
	stats.Timestamp = time.Now()

	// Add dropped jobs and max wait time
	if dropped, exists := queueStoreSingleton.droppedJobs[userID]; exists {
		stats.DroppedJobs = dropped
	}
	if maxWait, exists := queueStoreSingleton.maxWaitTimes[userID]; exists {
		stats.MaxWaitTime = maxWait
	}

	// Deep copy to avoid races after releasing lock
	result := *stats
	result.QueuedByAPI = make([]APIQueue, len(stats.QueuedByAPI))
	copy(result.QueuedByAPI, stats.QueuedByAPI)

	return result
}

// GetActiveQueues returns currently queued requests for a user
func (p *ProxyService) GetActiveQueues(userID uuid.UUID) []QueuedRequest {
	ctx := context.Background()

	// Try Redis first
	if queueStoreSingleton.redisManager != nil {
		if result, err := queueStoreSingleton.redisManager.GetQueuedRequests(ctx, userID); err == nil {
			return result
		}
	}

	// Fallback to in-memory
	queueStoreSingleton.mu.RLock()
	defer queueStoreSingleton.mu.RUnlock()

	var result []QueuedRequest

	// Aggregate all requests across APIs
	for key, requests := range queueStoreSingleton.activeQueues {
		userIDStr := key[:36] // UserIDs are 36 chars
		queueUserID, err := uuid.Parse(userIDStr)
		if err != nil || queueUserID != userID {
			continue
		}

		// Calculate current wait times
		now := time.Now()
		for i, req := range requests {
			queuedForMs := now.Sub(req.EnqueuedAt).Milliseconds()

			// Create copy with updated timing info
			updatedReq := req
			updatedReq.QueuedFor = queuedForMs
			updatedReq.Position = i

			// Simple estimation: position * average processing time
			// In a real implementation, this would be more sophisticated
			updatedReq.EstWaitTime = int64(i) * 500 // 500ms per request estimation

			result = append(result, updatedReq)
		}
	}

	return result
}

// GetQueueConfig returns queue configuration for a user
func (p *ProxyService) GetQueueConfig(userID uuid.UUID) QueueConfig {
	queueStoreSingleton.mu.RLock()
	defer queueStoreSingleton.mu.RUnlock()

	// If config doesn't exist yet, return default
	config, exists := queueStoreSingleton.userConfigs[userID]
	if !exists {
		return defaultQueueConfig
	}

	return config
}

// UpdateQueueConfig updates queue configuration for a user
func (p *ProxyService) UpdateQueueConfig(userID uuid.UUID, config QueueConfig) (QueueConfig, error) {
	// Validate configuration
	if config.MaxWaitTime <= 0 {
		return QueueConfig{}, ErrInvalidQueueConfig
	}

	// Phase 5: Enforce priority queue gating via the active policy preset.
	ctx := context.Background()
	preset, err := p.presetChecker.GetUserPreset(ctx, userID)
	if err != nil {
		// Log error but proceed with default behavior (allow priority) or fail safe?
		// We'll log and assume non-pro to be safe, or just proceed.
		// Let's proceed but log it.
		logger.Error("Failed to check policy preset for queue config",
			zap.String("user_id", userID.String()),
			zap.Error(err),
		)
	}

	// Only Pro users can have priority > 5
	allowsPriority := domainpolicy.SupportsPriorityQueues(preset)

	if !allowsPriority {
		for i := range config.PerAPISettings {
			if config.PerAPISettings[i].Priority > 5 {
				logger.Info("Downgrading queue priority for non-pro user",
					zap.String("user_id", userID.String()),
					zap.String("api_name", config.PerAPISettings[i].APIName),
					zap.Int("requested_priority", config.PerAPISettings[i].Priority),
					zap.String("preset", preset),
				)

				// Cap priority at 5
				config.PerAPISettings[i].Priority = 5

				// TODO: Add Prometheus metric for downgrade when metrics infra is ready
			}
		}
	}

	queueStoreSingleton.mu.Lock()
	defer queueStoreSingleton.mu.Unlock()

	// Store updated config
	queueStoreSingleton.userConfigs[userID] = config

	logger.Info("Queue configuration updated",
		zap.String("user_id", userID.String()),
		zap.Bool("enabled", config.Enabled),
		zap.Int64("max_wait_time_ms", config.MaxWaitTime),
		zap.String("strategy", config.QueueingStrategy),
	)

	return config, nil
}

// CancelQueuedRequest cancels a queued request
func (p *ProxyService) CancelQueuedRequest(userID uuid.UUID, requestID string) (bool, error) {
	ctx := context.Background()

	// Try Redis first
	if queueStoreSingleton.redisManager != nil {
		if cancelled, err := queueStoreSingleton.redisManager.CancelRequest(ctx, userID, requestID); err == nil {
			return cancelled, nil
		}
	}

	// Fallback to in-memory
	queueStoreSingleton.mu.Lock()
	defer queueStoreSingleton.mu.Unlock()

	// Search for request in all user's queues
	for key, requests := range queueStoreSingleton.activeQueues {
		userIDStr := key[:36] // UserIDs are 36 chars
		queueUserID, err := uuid.Parse(userIDStr)
		if err != nil || queueUserID != userID {
			continue
		}

		// Find and remove the request
		for i, req := range requests {
			if req.RequestID == requestID {
				// Remove from queue
				queueStoreSingleton.activeQueues[key] = append(
					requests[:i],
					requests[i+1:]...,
				)

				logger.Info("Request cancelled from queue",
					zap.String("user_id", userID.String()),
					zap.String("request_id", requestID),
				)

				return true, nil
			}
		}
	}

	return false, ErrRequestNotFound
}

// UpdateQueueStats updates queue statistics
func (p *ProxyService) updateQueueStats(userID uuid.UUID, apiName string, isEnqueue bool, waitTimeMs int64) {
	// Initialize stats if they don't exist
	stats, exists := queueStoreSingleton.queueStats[userID]
	if !exists {
		stats = &QueueStats{
			QueuedByAPI: []APIQueue{},
			Timestamp:   time.Now(),
		}
		queueStoreSingleton.queueStats[userID] = stats
	}

	// Update global stats
	if isEnqueue {
		stats.TotalRequestsQueued24h++
		stats.TotalQueuedRequests++
	} else {
		stats.TotalQueuedRequests--

		// Update average wait time
		if stats.AvgWaitTime == 0 {
			stats.AvgWaitTime = waitTimeMs
		} else {
			// Weighted average (70% old, 30% new)
			stats.AvgWaitTime = (stats.AvgWaitTime*7 + waitTimeMs*3) / 10
		}
	}

	// Find or create API stats
	var apiStats *APIQueue
	for i, aq := range stats.QueuedByAPI {
		if aq.APIName == apiName {
			apiStats = &stats.QueuedByAPI[i]
			break
		}
	}

	if apiStats == nil {
		// Create new API stats
		apiQueue := APIQueue{
			APIName:        apiName,
			QueuedRequests: 0,
			AvgWaitTime:    0,
		}
		stats.QueuedByAPI = append(stats.QueuedByAPI, apiQueue)
		apiStats = &stats.QueuedByAPI[len(stats.QueuedByAPI)-1]
	}

	// Update API-specific stats
	if isEnqueue {
		apiStats.QueuedRequests++
		apiStats.RateLimitHits24h++
	} else {
		apiStats.QueuedRequests--

		// Update API-specific average wait time
		if apiStats.AvgWaitTime == 0 {
			apiStats.AvgWaitTime = waitTimeMs
		} else {
			// Weighted average (70% old, 30% new)
			apiStats.AvgWaitTime = (apiStats.AvgWaitTime*7 + waitTimeMs*3) / 10
		}
	}

	// Count active queues
	activeQueues := 0
	for _, aq := range stats.QueuedByAPI {
		if aq.QueuedRequests > 0 {
			activeQueues++
		}
	}
	stats.ActiveQueues = activeQueues

	// Update timestamp
	stats.Timestamp = time.Now()
}
