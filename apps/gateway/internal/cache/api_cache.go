package cache

import (
	"context"
	"encoding/json"
	"fmt"
	"time"

	"github.com/google/uuid"
	"github.com/varbees/rateguard/internal/models"
	"github.com/varbees/rateguard/pkg/logger"
	"go.uber.org/zap"
)

// APICacheLayer provides intelligent caching for API configs and user data
type APICacheLayer struct {
	redis *RedisClient
}

// NewAPICacheLayer creates a new cache layer
func NewAPICacheLayer(redis *RedisClient) *APICacheLayer {
	return &APICacheLayer{
		redis: redis,
	}
}

// ============================================================================
// API CONFIG CACHING (Cache-Aside Pattern)
// ============================================================================

const (
	// Cache TTLs
	APIConfigCacheTTL = 5 * time.Minute
	UserCacheTTL      = 10 * time.Minute
	APIKeyCacheTTL    = 15 * time.Minute
	
	// Key prefixes
	apiConfigPrefix = "apiconfig"
	userPrefix      = "user"
	apiKeyPrefix    = "apikey"
)

// GetAPIConfig retrieves API config from cache
// Returns nil if not found (cache miss)
func (c *APICacheLayer) GetAPIConfig(apiConfigID uuid.UUID) (*models.APIConfig, error) {
	key := fmt.Sprintf("%s:%s", apiConfigPrefix, apiConfigID.String())
	
	data, err := c.redis.GetBytes(key)
	if err != nil {
		if err.Error() == "redis: nil" {
			// Cache miss
			return nil, nil
		}
		return nil, err
	}
	
	var config models.APIConfig
	if err := json.Unmarshal(data, &config); err != nil {
		logger.Error("Failed to unmarshal API config from cache",
			zap.String("api_config_id", apiConfigID.String()),
			zap.Error(err),
		)
		return nil, err
	}
	
	logger.Debug("API config cache HIT",
		zap.String("api_config_id", apiConfigID.String()),
	)
	
	return &config, nil
}

// SetAPIConfig stores API config in cache
func (c *APICacheLayer) SetAPIConfig(config *models.APIConfig) error {
	key := fmt.Sprintf("%s:%s", apiConfigPrefix, config.ID.String())
	
	data, err := json.Marshal(config)
	if err != nil {
		return err
	}
	
	if err := c.redis.Set(key, data, APIConfigCacheTTL); err != nil {
		logger.Error("Failed to cache API config",
			zap.String("api_config_id", config.ID.String()),
			zap.Error(err),
		)
		return err
	}
	
	logger.Debug("API config cached",
		zap.String("api_config_id", config.ID.String()),
		zap.String("name", config.Name),
	)
	
	return nil
}

// InvalidateAPIConfig removes API config from cache
func (c *APICacheLayer) InvalidateAPIConfig(apiConfigID uuid.UUID) error {
	key := fmt.Sprintf("%s:%s", apiConfigPrefix, apiConfigID.String())
	return c.redis.Delete(key)
}

// GetAPIConfigByName retrieves API config by name (with user ID for scoping)
func (c *APICacheLayer) GetAPIConfigByName(userID uuid.UUID, apiName string) (*models.APIConfig, error) {
	key := fmt.Sprintf("%s:user:%s:name:%s", apiConfigPrefix, userID.String(), apiName)
	
	data, err := c.redis.GetBytes(key)
	if err != nil {
		if err.Error() == "redis: nil" {
			return nil, nil
		}
		return nil, err
	}
	
	var config models.APIConfig
	if err := json.Unmarshal(data, &config); err != nil {
		return nil, err
	}
	
	return &config, nil
}

// SetAPIConfigByName caches API config by name
func (c *APICacheLayer) SetAPIConfigByName(userID uuid.UUID, config *models.APIConfig) error {
	key := fmt.Sprintf("%s:user:%s:name:%s", apiConfigPrefix, userID.String(), config.Name)
	
	data, err := json.Marshal(config)
	if err != nil {
		return err
	}
	
	return c.redis.Set(key, data, APIConfigCacheTTL)
}

// InvalidateAPIConfigByName removes API config from cache by name
func (c *APICacheLayer) InvalidateAPIConfigByName(userID uuid.UUID, apiName string) error {
	key := fmt.Sprintf("%s:user:%s:name:%s", apiConfigPrefix, userID.String(), apiName)
	return c.redis.Delete(key)
}

// ============================================================================
// USER CACHING (for fast auth lookups)
// ============================================================================

// GetUser retrieves user from cache
func (c *APICacheLayer) GetUser(userID uuid.UUID) (*models.User, error) {
	key := fmt.Sprintf("%s:%s", userPrefix, userID.String())
	
	data, err := c.redis.GetBytes(key)
	if err != nil {
		if err.Error() == "redis: nil" {
			return nil, nil
		}
		return nil, err
	}
	
	var user models.User
	if err := json.Unmarshal(data, &user); err != nil {
		return nil, err
	}
	
	logger.Debug("User cache HIT",
		zap.String("user_id", userID.String()),
	)
	
	return &user, nil
}

// SetUser stores user in cache
func (c *APICacheLayer) SetUser(user *models.User) error {
	key := fmt.Sprintf("%s:%s", userPrefix, user.ID.String())
	
	data, err := json.Marshal(user)
	if err != nil {
		return err
	}
	
	if err := c.redis.Set(key, data, UserCacheTTL); err != nil {
		logger.Error("Failed to cache user",
			zap.String("user_id", user.ID.String()),
			zap.Error(err),
		)
		return err
	}
	
	return nil
}

// InvalidateUser removes user from cache
func (c *APICacheLayer) InvalidateUser(userID uuid.UUID) error {
	key := fmt.Sprintf("%s:%s", userPrefix, userID.String())
	return c.redis.Delete(key)
}

// ============================================================================
// API KEY → USER ID MAPPING (Hot Path Optimization)
// ============================================================================

// GetUserIDByAPIKey retrieves user ID from API key (cached)
// This is a critical hot path for auth - cache aggressively
func (c *APICacheLayer) GetUserIDByAPIKey(apiKey string) (uuid.UUID, error) {
	key := fmt.Sprintf("%s:%s", apiKeyPrefix, apiKey)
	
	userIDStr, err := c.redis.Get(key)
	if err != nil {
		if err.Error() == "redis: nil" {
			return uuid.Nil, nil
		}
		return uuid.Nil, err
	}
	
	userID, err := uuid.Parse(userIDStr)
	if err != nil {
		return uuid.Nil, err
	}
	
	logger.Debug("API key cache HIT",
		zap.String("api_key_prefix", apiKey[:10]+"..."),
	)
	
	return userID, nil
}

// SetUserIDByAPIKey caches API key → user ID mapping
func (c *APICacheLayer) SetUserIDByAPIKey(apiKey string, userID uuid.UUID) error {
	key := fmt.Sprintf("%s:%s", apiKeyPrefix, apiKey)
	
	if err := c.redis.Set(key, userID.String(), APIKeyCacheTTL); err != nil {
		logger.Error("Failed to cache API key mapping",
			zap.Error(err),
		)
		return err
	}
	
	return nil
}

// InvalidateAPIKey removes API key mapping from cache
func (c *APICacheLayer) InvalidateAPIKey(apiKey string) error {
	key := fmt.Sprintf("%s:%s", apiKeyPrefix, apiKey)
	return c.redis.Delete(key)
}

// ============================================================================
// BULK OPERATIONS
// ============================================================================

// InvalidateUserData removes all cached data for a user
func (c *APICacheLayer) InvalidateUserData(userID uuid.UUID) error {
	// Invalidate user
	if err := c.InvalidateUser(userID); err != nil {
		return err
	}
	
	// Invalidate user's API configs
	pattern := fmt.Sprintf("%s:user:%s:*", apiConfigPrefix, userID.String())
	keys, err := c.redis.Scan(pattern)
	if err != nil {
		return err
	}
	
	if len(keys) > 0 {
		if err := c.redis.Delete(keys...); err != nil {
			return err
		}
		logger.Info("Invalidated user cache",
			zap.String("user_id", userID.String()),
			zap.Int("keys_deleted", len(keys)),
		)
	}
	
	return nil
}

// WarmupCache pre-loads frequently accessed data into cache
func (c *APICacheLayer) WarmupCache(ctx context.Context, users []*models.User, configs []*models.APIConfig) error {
	logger.Info("Starting cache warmup",
		zap.Int("users", len(users)),
		zap.Int("configs", len(configs)),
	)
	
	// Cache users
	for _, user := range users {
		if err := c.SetUser(user); err != nil {
			logger.Warn("Failed to warmup user cache",
				zap.String("user_id", user.ID.String()),
				zap.Error(err),
			)
		}
		
		// Cache API key mapping
		if err := c.SetUserIDByAPIKey(user.APIKey, user.ID); err != nil {
			logger.Warn("Failed to warmup API key cache",
				zap.String("user_id", user.ID.String()),
				zap.Error(err),
			)
		}
	}
	
	// Cache API configs
	for _, config := range configs {
		if err := c.SetAPIConfig(config); err != nil {
			logger.Warn("Failed to warmup API config cache",
				zap.String("config_id", config.ID.String()),
				zap.Error(err),
			)
		}
		
		if err := c.SetAPIConfigByName(config.UserID, config); err != nil {
			logger.Warn("Failed to warmup API config name cache",
				zap.String("config_id", config.ID.String()),
				zap.Error(err),
			)
		}
	}
	
	logger.Info("Cache warmup completed")
	return nil
}

// ============================================================================
// CACHE STATISTICS
// ============================================================================

// GetCacheStats returns cache statistics
func (c *APICacheLayer) GetCacheStats() (*CacheStats, error) {
	info, err := c.redis.Info()
	if err != nil {
		return nil, err
	}
	
	// Parse Redis INFO output (simplified)
	// In production, parse the full stats
	return &CacheStats{
		Info: info,
	}, nil
}

// CacheStats holds cache statistics
type CacheStats struct {
	Info string
}
