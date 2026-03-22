package cache

import (
	"context"
	"fmt"
	"os"
	"strconv"
	"time"

	"github.com/redis/go-redis/v9"
	"github.com/varbees/rateguard/pkg/logger"
	"go.uber.org/zap"
)

// RedisClient wraps redis.Client with intelligent caching strategies
type RedisClient struct {
	client *redis.Client
	ctx    context.Context
}

// RedisConfig holds Redis connection configuration
type RedisConfig struct {
	Host           string
	Port           int
	Password       string
	DB             int
	PoolSize       int
	MinIdleConns   int
	MaxRetries     int
	DialTimeout    time.Duration
	ReadTimeout    time.Duration
	WriteTimeout   time.Duration
	ConnMaxIdleTime time.Duration
}

// LoadRedisConfigFromEnv loads Redis configuration from environment variables
func LoadRedisConfigFromEnv() *RedisConfig {
	return &RedisConfig{
		Host:            getEnv("REDIS_HOST", "localhost"),
		Port:            getEnvInt("REDIS_PORT", 6379),
		Password:        getEnv("REDIS_PASSWORD", ""),
		DB:              getEnvInt("REDIS_DB", 0),
		PoolSize:        getEnvInt("REDIS_POOL_SIZE", 10),
		MinIdleConns:    getEnvInt("REDIS_MIN_IDLE_CONNS", 5),
		MaxRetries:      getEnvInt("REDIS_MAX_RETRIES", 3),
		DialTimeout:     time.Duration(getEnvInt("REDIS_DIAL_TIMEOUT_SEC", 5)) * time.Second,
		ReadTimeout:     time.Duration(getEnvInt("REDIS_READ_TIMEOUT_SEC", 3)) * time.Second,
		WriteTimeout:    time.Duration(getEnvInt("REDIS_WRITE_TIMEOUT_SEC", 3)) * time.Second,
		ConnMaxIdleTime: 5 * time.Minute,
	}
}

// NewRedisClient creates a new Redis client with connection pooling
func NewRedisClient(config *RedisConfig) (*RedisClient, error) {
	rdb := redis.NewClient(&redis.Options{
		Addr:            fmt.Sprintf("%s:%d", config.Host, config.Port),
		Password:        config.Password,
		DB:              config.DB,
		PoolSize:        config.PoolSize,
		MinIdleConns:    config.MinIdleConns,
		MaxRetries:      config.MaxRetries,
		DialTimeout:     config.DialTimeout,
		ReadTimeout:     config.ReadTimeout,
		WriteTimeout:    config.WriteTimeout,
		ConnMaxIdleTime: config.ConnMaxIdleTime,
	})

	ctx := context.Background()

	// Test connection
	if err := rdb.Ping(ctx).Err(); err != nil {
		return nil, fmt.Errorf("failed to connect to Redis: %w", err)
	}

	logger.Info("Redis client connected successfully",
		zap.String("host", config.Host),
		zap.Int("port", config.Port),
		zap.Int("db", config.DB),
	)

	return &RedisClient{
		client: rdb,
		ctx:    ctx,
	}, nil
}

// Close gracefully closes the Redis connection
func (r *RedisClient) Close() error {
	return r.client.Close()
}

// ===========================================================================
// INTELLIGENT CACHING STRATEGIES
// ===========================================================================

// CacheStrategy defines different caching patterns
type CacheStrategy int

const (
	// CacheAside: Read from cache, if miss, load from DB and cache
	CacheAside CacheStrategy = iota
	// WriteThrough: Write to cache and DB simultaneously
	WriteThrough
	// WriteBack: Write to cache, async write to DB
	WriteBack
	// CacheOnly: Only cache, no DB persistence
	CacheOnly
)

// Set stores a key-value pair with TTL
func (r *RedisClient) Set(key string, value interface{}, ttl time.Duration) error {
	return r.client.Set(r.ctx, key, value, ttl).Err()
}

// Get retrieves a value by key
func (r *RedisClient) Get(key string) (string, error) {
	return r.client.Get(r.ctx, key).Result()
}

// GetBytes retrieves a value by key as bytes
func (r *RedisClient) GetBytes(key string) ([]byte, error) {
	return r.client.Get(r.ctx, key).Bytes()
}

// Delete removes a key
func (r *RedisClient) Delete(keys ...string) error {
	return r.client.Del(r.ctx, keys...).Err()
}

// Exists checks if a key exists
func (r *RedisClient) Exists(keys ...string) (int64, error) {
	return r.client.Exists(r.ctx, keys...).Result()
}

// Expire sets a timeout on a key
func (r *RedisClient) Expire(key string, ttl time.Duration) error {
	return r.client.Expire(r.ctx, key, ttl).Err()
}

// ExpireCtx sets a timeout on a key with context
func (r *RedisClient) ExpireCtx(ctx context.Context, key string, ttl time.Duration) error {
	return r.client.Expire(ctx, key, ttl).Err()
}

// ===========================================================================
// RATE LIMITING OPERATIONS (Atomic)
// ===========================================================================

// Incr atomically increments a counter
func (r *RedisClient) Incr(key string) (int64, error) {
	return r.client.Incr(r.ctx, key).Result()
}

// IncrBy atomically increments a counter by value
func (r *RedisClient) IncrBy(key string, value int64) (int64, error) {
	return r.client.IncrBy(r.ctx, key, value).Result()
}

// IncrWithExpire atomically increments and sets expiry (pipeline)
func (r *RedisClient) IncrWithExpire(key string, ttl time.Duration) (int64, error) {
	pipe := r.client.Pipeline()
	incr := pipe.Incr(r.ctx, key)
	pipe.Expire(r.ctx, key, ttl)
	
	if _, err := pipe.Exec(r.ctx); err != nil {
		return 0, err
	}
	
	return incr.Val(), nil
}

// ===========================================================================
// HASH OPERATIONS (for caching objects)
// ===========================================================================

// HSet sets a hash field
func (r *RedisClient) HSet(key string, field string, value interface{}) error {
	return r.client.HSet(r.ctx, key, field, value).Err()
}

// HGet retrieves a hash field
func (r *RedisClient) HGet(key string, field string) (string, error) {
	return r.client.HGet(r.ctx, key, field).Result()
}

// HGetAll retrieves all fields of a hash
func (r *RedisClient) HGetAll(key string) (map[string]string, error) {
	return r.client.HGetAll(r.ctx, key).Result()
}

// HMSet sets multiple hash fields
func (r *RedisClient) HMSet(key string, fields map[string]interface{}) error {
	return r.client.HMSet(r.ctx, key, fields).Err()
}

// HDel deletes hash fields
func (r *RedisClient) HDel(key string, fields ...string) error {
	return r.client.HDel(r.ctx, key, fields...).Err()
}

// HIncrBy increments a hash field by value
func (r *RedisClient) HIncrBy(key string, field string, incr int64) (int64, error) {
	return r.client.HIncrBy(r.ctx, key, field, incr).Result()
}

// ===========================================================================
// LIST OPERATIONS (for queue buffering)
// ===========================================================================

// LPush pushes values to the head of a list
func (r *RedisClient) LPush(key string, values ...interface{}) error {
	return r.client.LPush(r.ctx, key, values...).Err()
}

// RPush pushes values to the tail of a list
func (r *RedisClient) RPush(key string, values ...interface{}) error {
	return r.client.RPush(r.ctx, key, values...).Err()
}

// LPop pops a value from the head of a list
func (r *RedisClient) LPop(key string) (string, error) {
	return r.client.LPop(r.ctx, key).Result()
}

// RPop pops a value from the tail of a list
func (r *RedisClient) RPop(key string) (string, error) {
	return r.client.RPop(r.ctx, key).Result()
}

// LRange retrieves a range of elements from a list
func (r *RedisClient) LRange(key string, start, stop int64) ([]string, error) {
	return r.client.LRange(r.ctx, key, start, stop).Result()
}

// LLen returns the length of a list
func (r *RedisClient) LLen(key string) (int64, error) {
	return r.client.LLen(r.ctx, key).Result()
}

// ===========================================================================
// SORTED SET OPERATIONS (for priority queues)
// ===========================================================================

// ZAdd adds members to a sorted set
func (r *RedisClient) ZAdd(key string, score float64, member string) error {
	return r.client.ZAdd(r.ctx, key, redis.Z{Score: score, Member: member}).Err()
}

// ZRem removes members from a sorted set
func (r *RedisClient) ZRem(key string, members ...interface{}) error {
	return r.client.ZRem(r.ctx, key, members...).Err()
}

// ZRange returns a range of members from a sorted set
func (r *RedisClient) ZRange(key string, start, stop int64) ([]string, error) {
	return r.client.ZRange(r.ctx, key, start, stop).Result()
}

// ZRangeWithScores returns a range of members with scores from a sorted set
func (r *RedisClient) ZRangeWithScores(key string, start, stop int64) ([]redis.Z, error) {
	return r.client.ZRangeWithScores(r.ctx, key, start, stop).Result()
}

// ZCard returns the number of members in a sorted set
func (r *RedisClient) ZCard(key string) (int64, error) {
	return r.client.ZCard(r.ctx, key).Result()
}

// Keys returns all keys matching a pattern
func (r *RedisClient) Keys(pattern string) ([]string, error) {
	return r.client.Keys(r.ctx, pattern).Result()
}

// ===========================================================================
// PIPELINE OPERATIONS (for batching)
// ===========================================================================

// Pipeline returns a new pipeline for batched operations
func (r *RedisClient) Pipeline() redis.Pipeliner {
	return r.client.Pipeline()
}

// ===========================================================================
// SCAN OPERATIONS (for bulk operations)
// ===========================================================================

// Scan iterates over keys matching a pattern
func (r *RedisClient) Scan(pattern string) ([]string, error) {
	var keys []string
	iter := r.client.Scan(r.ctx, 0, pattern, 0).Iterator()
	
	for iter.Next(r.ctx) {
		keys = append(keys, iter.Val())
	}
	
	if err := iter.Err(); err != nil {
		return nil, err
	}
	
	return keys, nil
}

// ===========================================================================
// UTILITY FUNCTIONS
// ===========================================================================

func getEnv(key, defaultValue string) string {
	if value := os.Getenv(key); value != "" {
		return value
	}
	return defaultValue
}

func getEnvInt(key string, defaultValue int) int {
	if value := os.Getenv(key); value != "" {
		if intVal, err := strconv.Atoi(value); err == nil {
			return intVal
		}
	}
	return defaultValue
}

// Ping checks if Redis is available
func (r *RedisClient) Ping() error {
	return r.client.Ping(r.ctx).Err()
}

// FlushDB clears the current database (use with caution!)
func (r *RedisClient) FlushDB() error {
	return r.client.FlushDB(r.ctx).Err()
}

// Info returns Redis server information
func (r *RedisClient) Info() (string, error) {
	return r.client.Info(r.ctx).Result()
}

// ===========================================================================
// LUA SCRIPT EXECUTION (for atomic operations)
// ===========================================================================

// EvalScript executes a Lua script
func (r *RedisClient) EvalScript(ctx context.Context, script string, keys []string, args ...interface{}) (interface{}, error) {
	return r.client.Eval(ctx, script, keys, args...).Result()
}

// GetClient returns the underlying Redis client for advanced operations
func (r *RedisClient) GetClient() *redis.Client {
	return r.client
}

// GetContext returns the default context
func (r *RedisClient) GetContext() context.Context {
	return r.ctx
}

// ===========================================================================
// DISTRIBUTED LOCK OPERATIONS (for queue coordination)
// ===========================================================================

// AcquireLock attempts to acquire a distributed lock using SET NX EX pattern
// Returns true if lock acquired, false if already locked
func (r *RedisClient) AcquireLock(key string, ttl time.Duration) (bool, error) {
	ctx := context.Background()
	
	// SET key value NX EX ttl
	// NX: Only set if key doesn't exist
	// EX: Set expiry time in seconds
	result, err := r.client.SetNX(ctx, key, "locked", ttl).Result()
	if err != nil {
		return false, fmt.Errorf("failed to acquire lock: %w", err)
	}
	
	if result {
		logger.Debug("Distributed lock acquired",
			zap.String("key", key),
			zap.Duration("ttl", ttl),
		)
	}
	
	return result, nil
}

// ReleaseLock releases a distributed lock
func (r *RedisClient) ReleaseLock(key string) error {
	ctx := context.Background()
	
	err := r.client.Del(ctx, key).Err()
	if err != nil {
		return fmt.Errorf("failed to release lock: %w", err)
	}
	
	logger.Debug("Distributed lock released",
		zap.String("key", key),
	)
	
	return nil
}

// TryLockWithRetry attempts to acquire a lock with retries
// Useful for queue operations that need to wait for lock availability
func (r *RedisClient) TryLockWithRetry(key string, ttl time.Duration, maxRetries int, retryDelay time.Duration) (bool, error) {
	for i := 0; i < maxRetries; i++ {
		acquired, err := r.AcquireLock(key, ttl)
		if err != nil {
			return false, err
		}
		
		if acquired {
			return true, nil
		}
		
		// Lock not acquired, wait before retry
		if i < maxRetries-1 {
			time.Sleep(retryDelay)
		}
	}
	
	return false, nil // Max retries reached, lock not acquired
}

// IsLocked checks if a lock is currently held
func (r *RedisClient) IsLocked(key string) (bool, error) {
	ctx := context.Background()
	
	exists, err := r.client.Exists(ctx, key).Result()
	if err != nil {
		return false, fmt.Errorf("failed to check lock: %w", err)
	}
	
	return exists > 0, nil
}
