package proxy

import (
	"context"
	"encoding/json"
	"fmt"
	"strconv"
	"time"

	"github.com/google/uuid"
	"github.com/varbees/rateguard/internal/cache"
	"github.com/varbees/rateguard/pkg/logger"
	"go.uber.org/zap"
)

// RedisQueueManager handles Redis-based queue persistence
type RedisQueueManager struct {
	client *cache.RedisClient
}

// NewRedisQueueManager creates a new Redis queue manager
func NewRedisQueueManager(client *cache.RedisClient) *RedisQueueManager {
	return &RedisQueueManager{
		client: client,
	}
}

// QueueRequest represents a request in Redis queue
type QueueRequest struct {
	RequestID   string            `json:"request_id"`
	UserID      string            `json:"user_id"`
	TargetAPI   string            `json:"target_api"`
	Method      string            `json:"method"`
	Path        string            `json:"path"`
	Headers     map[string]string `json:"headers"`
	Body        []byte            `json:"body"`
	QueryParams map[string]string `json:"query_params"`
	EnqueuedAt  time.Time         `json:"enqueued_at"`
	Priority    int               `json:"priority"` // 1-10, higher = more priority
	RetryCount  int               `json:"retry_count"`
	MaxRetries  int               `json:"max_retries"`
}

// EnqueueRequest adds a request to Redis queue with priority support
func (r *RedisQueueManager) EnqueueRequest(ctx context.Context, userID uuid.UUID, apiName string, req *QueueRequest) error {
	if r.client == nil {
		return fmt.Errorf("Redis client not available")
	}

	// Set default values
	req.UserID = userID.String()
	req.TargetAPI = apiName
	req.EnqueuedAt = time.Now()
	if req.Priority == 0 {
		req.Priority = 5 // Default priority
	}
	if req.MaxRetries == 0 {
		req.MaxRetries = 3 // Default max retries
	}

	// Serialize request
	data, err := json.Marshal(req)
	if err != nil {
		return fmt.Errorf("failed to serialize request: %w", err)
	}

	// Queue key: queue:userID:apiName
	queueKey := fmt.Sprintf("queue:%s:%s", userID.String(), apiName)

	// Use Redis sorted set for priority queue (score = priority + timestamp for FIFO within priority)
	// Higher priority gets lower score (Redis ZRANGE returns lowest scores first)
	score := float64(10-req.Priority) + float64(time.Now().UnixNano())/1e18 // Microsecond precision for FIFO within priority

	err = r.client.ZAdd(queueKey, score, string(data))
	if err != nil {
		return fmt.Errorf("failed to enqueue request: %w", err)
	}

	// Set expiration for queue (24 hours)
	r.client.Expire(queueKey, 24*time.Hour)

	// Update queue stats
	r.updateQueueStats(userID, apiName, true, 0)

	logger.Info("Request enqueued to Redis",
		zap.String("user_id", userID.String()),
		zap.String("api_name", apiName),
		zap.String("request_id", req.RequestID),
		zap.Int("priority", req.Priority),
	)

	return nil
}

func (r *RedisQueueManager) acquireQueueCapacity(ctx context.Context, key string, limit int, ttl time.Duration) (bool, error) {
	if r.client == nil {
		return false, fmt.Errorf("Redis client not available")
	}

	script := `
local current = tonumber(redis.call("GET", KEYS[1]) or "0")
local max = tonumber(ARGV[1])
if max <= 0 then
	return 1
end
if current >= max then
	return 0
end
redis.call("INCR", KEYS[1])
redis.call("PEXPIRE", KEYS[1], ARGV[2])
return 1
`

	result, err := r.client.EvalScript(ctx, script, []string{key}, limit, ttl.Milliseconds())
	if err != nil {
		return false, fmt.Errorf("failed to reserve queue capacity: %w", err)
	}

	acquired, ok := result.(int64)
	if !ok {
		return false, fmt.Errorf("unexpected queue capacity response type %T", result)
	}

	return acquired == 1, nil
}

func (r *RedisQueueManager) releaseQueueCapacity(ctx context.Context, key string) error {
	if r.client == nil {
		return fmt.Errorf("Redis client not available")
	}

	script := `
local current = tonumber(redis.call("GET", KEYS[1]) or "0")
if current <= 1 then
	redis.call("DEL", KEYS[1])
	return 0
end
current = redis.call("DECR", KEYS[1])
redis.call("PEXPIRE", KEYS[1], ARGV[1])
return current
`

	_, err := r.client.EvalScript(ctx, script, []string{key}, (queueWaiterTTLBuffer + time.Minute).Milliseconds())
	if err != nil {
		return fmt.Errorf("failed to release queue capacity: %w", err)
	}

	return nil
}

// DequeueRequest removes and returns the highest priority request from queue
func (r *RedisQueueManager) DequeueRequest(ctx context.Context, userID uuid.UUID, apiName string) (*QueueRequest, error) {
	if r.client == nil {
		return nil, fmt.Errorf("Redis client not available")
	}

	queueKey := fmt.Sprintf("queue:%s:%s", userID.String(), apiName)

	// Get highest priority request (lowest score)
	results, err := r.client.ZRangeWithScores(queueKey, 0, 0)
	if err != nil {
		return nil, fmt.Errorf("failed to peek queue: %w", err)
	}

	if len(results) == 0 {
		return nil, nil // Queue is empty
	}

	// Remove the request from queue
	member := results[0].Member
	err = r.client.ZRem(queueKey, member)
	if err != nil {
		return nil, fmt.Errorf("failed to remove from queue: %w", err)
	}

	// Deserialize request
	var req QueueRequest
	err = json.Unmarshal([]byte(member.(string)), &req)
	if err != nil {
		return nil, fmt.Errorf("failed to deserialize request: %w", err)
	}

	// Calculate wait time
	waitTime := time.Since(req.EnqueuedAt)

	// Update queue stats
	r.updateQueueStats(userID, apiName, false, waitTime.Milliseconds())

	logger.Info("Request dequeued from Redis",
		zap.String("user_id", userID.String()),
		zap.String("api_name", apiName),
		zap.String("request_id", req.RequestID),
		zap.Duration("wait_time", waitTime),
	)

	return &req, nil
}

// GetQueueLength returns the number of requests in queue
func (r *RedisQueueManager) GetQueueLength(ctx context.Context, userID uuid.UUID, apiName string) (int64, error) {
	if r.client == nil {
		return 0, fmt.Errorf("Redis client not available")
	}

	queueKey := fmt.Sprintf("queue:%s:%s", userID.String(), apiName)
	return r.client.ZCard(queueKey)
}

// GetQueuedRequests returns all queued requests for a user
func (r *RedisQueueManager) GetQueuedRequests(ctx context.Context, userID uuid.UUID) ([]QueuedRequest, error) {
	if r.client == nil {
		return nil, fmt.Errorf("Redis client not available")
	}

	var result []QueuedRequest

	// Get all queue keys for this user
	pattern := fmt.Sprintf("queue:%s:*", userID.String())
	keys, err := r.client.Keys(pattern)
	if err != nil {
		return nil, fmt.Errorf("failed to get queue keys: %w", err)
	}

	now := time.Now()

	for _, key := range keys {
		// Extract API name from key
		parts := []rune(key)
		if len(parts) < 43 { // "queue:" + 36-char UUID + ":"
			continue
		}
		apiName := string(parts[43:]) // Everything after "queue:UUID:"

		// Get all requests in this queue
		members, err := r.client.ZRangeWithScores(key, 0, -1)
		if err != nil {
			continue
		}

		for i, member := range members {
			var req QueueRequest
			if err := json.Unmarshal([]byte(member.Member.(string)), &req); err != nil {
				continue
			}

			queuedForMs := now.Sub(req.EnqueuedAt).Milliseconds()
			estWaitTime := int64(i) * 500 // 500ms per request estimation

			result = append(result, QueuedRequest{
				RequestID:   req.RequestID,
				TargetAPI:   apiName,
				Method:      req.Method,
				Path:        req.Path,
				EnqueuedAt:  req.EnqueuedAt,
				QueuedFor:   queuedForMs,
				Position:    i,
				EstWaitTime: estWaitTime,
			})
		}
	}

	return result, nil
}

// CancelRequest removes a specific request from queue
func (r *RedisQueueManager) CancelRequest(ctx context.Context, userID uuid.UUID, requestID string) (bool, error) {
	if r.client == nil {
		return false, fmt.Errorf("Redis client not available")
	}

	// Search all queues for this user
	pattern := fmt.Sprintf("queue:%s:*", userID.String())
	keys, err := r.client.Keys(pattern)
	if err != nil {
		return false, fmt.Errorf("failed to get queue keys: %w", err)
	}

	for _, key := range keys {
		// Get all members
		members, err := r.client.ZRange(key, 0, -1)
		if err != nil {
			continue
		}

		for _, member := range members {
			var req QueueRequest
			if err := json.Unmarshal([]byte(member), &req); err != nil {
				continue
			}

			if req.RequestID == requestID {
				// Remove from queue
				err = r.client.ZRem(key, member)
				if err != nil {
					return false, fmt.Errorf("failed to remove request: %w", err)
				}

				logger.Info("Request cancelled from Redis queue",
					zap.String("user_id", userID.String()),
					zap.String("request_id", requestID),
				)

				return true, nil
			}
		}
	}

	return false, nil
}

// GetQueueStats returns comprehensive queue statistics
func (r *RedisQueueManager) GetQueueStats(ctx context.Context, userID uuid.UUID) (*QueueStats, error) {
	if r.client == nil {
		return nil, fmt.Errorf("Redis client not available")
	}

	stats := &QueueStats{
		Timestamp:   time.Now(),
		QueuedByAPI: []APIQueue{},
	}

	// Get stats from Redis
	statsKey := fmt.Sprintf("queue_stats:%s", userID.String())
	statsData, err := r.client.HGetAll(statsKey)
	if err == nil && len(statsData) > 0 {
		// Parse stored stats
		if val, ok := statsData["total_queued_24h"]; ok {
			if parsed, err := strconv.Atoi(val); err == nil {
				stats.TotalRequestsQueued24h = parsed
			}
		}
		if val, ok := statsData["avg_wait_time"]; ok {
			if parsed, err := strconv.ParseInt(val, 10, 64); err == nil {
				stats.AvgWaitTime = parsed
			}
		}
		if val, ok := statsData["peak_queue_length"]; ok {
			if parsed, err := strconv.Atoi(val); err == nil {
				stats.PeakQueueLength = parsed
			}
		}
	}

	// Get current queue status
	pattern := fmt.Sprintf("queue:%s:*", userID.String())
	keys, err := r.client.Keys(pattern)
	if err != nil {
		return stats, nil // Return partial stats
	}

	activeQueues := 0
	totalQueued := 0
	longestQueuedTime := int64(0)
	now := time.Now()

	for _, key := range keys {
		// Extract API name
		parts := []rune(key)
		if len(parts) < 43 {
			continue
		}
		apiName := string(parts[43:])

		// Get queue length
		length, err := r.client.ZCard(key)
		if err != nil {
			continue
		}

		if length > 0 {
			activeQueues++
			totalQueued += int(length)

			// Get oldest request to calculate longest queued time
			oldest, err := r.client.ZRange(key, 0, 0)
			if err == nil && len(oldest) > 0 {
				var req QueueRequest
				if err := json.Unmarshal([]byte(oldest[0]), &req); err == nil {
					queuedTime := now.Sub(req.EnqueuedAt).Milliseconds()
					if queuedTime > longestQueuedTime {
						longestQueuedTime = queuedTime
					}
				}
			}

			// Add API stats
			apiStats := APIQueue{
				APIName:        apiName,
				QueuedRequests: int(length),
			}

			// Get API-specific stats from Redis
			apiStatsKey := fmt.Sprintf("api_stats:%s:%s", userID.String(), apiName)
			apiData, err := r.client.HGetAll(apiStatsKey)
			if err == nil && len(apiData) > 0 {
				if val, ok := apiData["avg_wait_time"]; ok {
					if parsed, err := strconv.ParseInt(val, 10, 64); err == nil {
						apiStats.AvgWaitTime = parsed
					}
				}
				if val, ok := apiData["rate_limit_hits_24h"]; ok {
					if parsed, err := strconv.Atoi(val); err == nil {
						apiStats.RateLimitHits24h = parsed
					}
				}
			}

			stats.QueuedByAPI = append(stats.QueuedByAPI, apiStats)
		}
	}

	stats.ActiveQueues = activeQueues
	stats.TotalQueuedRequests = totalQueued
	stats.LongestQueuedTime = longestQueuedTime

	return stats, nil
}

// updateQueueStats updates queue statistics in Redis
func (r *RedisQueueManager) updateQueueStats(userID uuid.UUID, apiName string, isEnqueue bool, waitTimeMs int64) {
	if r.client == nil {
		return
	}

	// Update global stats
	statsKey := fmt.Sprintf("queue_stats:%s", userID.String())

	if isEnqueue {
		r.client.HIncrBy(statsKey, "total_queued_24h", 1)
		r.client.HIncrBy(statsKey, "total_queued", 1)
	} else {
		r.client.HIncrBy(statsKey, "total_queued", -1)

		// Update average wait time (weighted average)
		currentAvg, _ := r.client.HGet(statsKey, "avg_wait_time")
		if currentAvg == "" {
			r.client.HSet(statsKey, "avg_wait_time", strconv.FormatInt(waitTimeMs, 10))
		} else {
			if oldAvg, err := strconv.ParseInt(currentAvg, 10, 64); err == nil {
				newAvg := (oldAvg*7 + waitTimeMs*3) / 10 // 70% old, 30% new
				r.client.HSet(statsKey, "avg_wait_time", strconv.FormatInt(newAvg, 10))
			}
		}
	}

	// Set expiration for stats (7 days)
	r.client.Expire(statsKey, 7*24*time.Hour)

	// Update API-specific stats
	apiStatsKey := fmt.Sprintf("api_stats:%s:%s", userID.String(), apiName)

	if isEnqueue {
		r.client.HIncrBy(apiStatsKey, "rate_limit_hits_24h", 1)
	} else {
		// Update API-specific average wait time
		currentAvg, _ := r.client.HGet(apiStatsKey, "avg_wait_time")
		if currentAvg == "" {
			r.client.HSet(apiStatsKey, "avg_wait_time", strconv.FormatInt(waitTimeMs, 10))
		} else {
			if oldAvg, err := strconv.ParseInt(currentAvg, 10, 64); err == nil {
				newAvg := (oldAvg*7 + waitTimeMs*3) / 10
				r.client.HSet(apiStatsKey, "avg_wait_time", strconv.FormatInt(newAvg, 10))
			}
		}
	}

	// Set expiration for API stats (7 days)
	r.client.Expire(apiStatsKey, 7*24*time.Hour)
}

// CleanupExpiredRequests removes requests that have been in queue too long
func (r *RedisQueueManager) CleanupExpiredRequests(ctx context.Context, maxAge time.Duration) error {
	if r.client == nil {
		return fmt.Errorf("Redis client not available")
	}

	// Get all queue keys
	keys, err := r.client.Keys("queue:*")
	if err != nil {
		return fmt.Errorf("failed to get queue keys: %w", err)
	}

	cutoff := time.Now().Add(-maxAge)
	totalCleaned := 0

	for _, key := range keys {
		// Get all members
		members, err := r.client.ZRange(key, 0, -1)
		if err != nil {
			continue
		}

		for _, member := range members {
			var req QueueRequest
			if err := json.Unmarshal([]byte(member), &req); err != nil {
				continue
			}

			// Remove if too old
			if req.EnqueuedAt.Before(cutoff) {
				r.client.ZRem(key, member)
				totalCleaned++
			}
		}
	}

	if totalCleaned > 0 {
		logger.Info("Cleaned up expired queue requests",
			zap.Int("cleaned_count", totalCleaned),
			zap.Duration("max_age", maxAge),
		)
	}

	return nil
}
