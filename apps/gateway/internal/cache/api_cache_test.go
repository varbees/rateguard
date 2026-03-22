package cache

import (
	"context"
	"encoding/json"
	"strings"
	"testing"
	"time"

	"github.com/alicebob/miniredis/v2"
	"github.com/google/uuid"
	"github.com/redis/go-redis/v9"
	"github.com/stretchr/testify/assert"
	"github.com/varbees/rateguard/internal/models"
	"github.com/varbees/rateguard/pkg/logger"
)

// setupTestRedis creates a miniredis instance and a RedisClient connected to it
func setupTestRedis(t testing.TB) (*miniredis.Miniredis, *RedisClient) {
	// Initialize logger for tests
	_ = logger.Initialize(logger.Config{
		Level:       "debug",
		Format:      "console",
		Development: true,
	})

	mr, err := miniredis.Run()
	if err != nil {
		if strings.Contains(err.Error(), "operation not permitted") {
			t.Skip("skipping miniredis-dependent test: local sockets are unavailable in this environment")
		}
		t.Fatalf("failed to start miniredis: %v", err)
	}

	client := redis.NewClient(&redis.Options{
		Addr: mr.Addr(),
	})

	redisClient := &RedisClient{
		client: client,
		ctx:    context.Background(),
	}

	return mr, redisClient
}

func TestGetAPIConfig_Hit(t *testing.T) {
	mr, redisClient := setupTestRedis(t)
	defer mr.Close()

	cacheLayer := NewAPICacheLayer(redisClient)
	apiID := uuid.New()
	expectedConfig := &models.APIConfig{
		ID:   apiID,
		Name: "Test API",
	}

	// Pre-populate cache
	data, _ := json.Marshal(expectedConfig)
	_ = redisClient.Set("apiconfig:"+apiID.String(), data, time.Minute)

	// Test Hit
	config, err := cacheLayer.GetAPIConfig(apiID)
	assert.NoError(t, err)
	assert.NotNil(t, config)
	assert.Equal(t, expectedConfig.ID, config.ID)
	assert.Equal(t, expectedConfig.Name, config.Name)
}

func TestGetAPIConfig_Miss(t *testing.T) {
	mr, redisClient := setupTestRedis(t)
	defer mr.Close()

	cacheLayer := NewAPICacheLayer(redisClient)
	apiID := uuid.New()

	// Test Miss
	config, err := cacheLayer.GetAPIConfig(apiID)
	assert.NoError(t, err)
	assert.Nil(t, config)
}

func TestSetAPIConfig(t *testing.T) {
	mr, redisClient := setupTestRedis(t)
	defer mr.Close()

	cacheLayer := NewAPICacheLayer(redisClient)
	apiID := uuid.New()
	config := &models.APIConfig{
		ID:   apiID,
		Name: "Test API",
	}

	// Test Set
	err := cacheLayer.SetAPIConfig(config)
	assert.NoError(t, err)

	// Verify in Redis
	key := "apiconfig:" + apiID.String()
	assert.True(t, mr.Exists(key))

	// Verify TTL (should be around 5 minutes)
	ttl := mr.TTL(key)
	assert.True(t, ttl > 0)
}

func TestInvalidateAPIConfig(t *testing.T) {
	mr, redisClient := setupTestRedis(t)
	defer mr.Close()

	cacheLayer := NewAPICacheLayer(redisClient)
	apiID := uuid.New()

	// Pre-populate
	key := "apiconfig:" + apiID.String()
	mr.Set(key, "some data")

	// Test Invalidate
	err := cacheLayer.InvalidateAPIConfig(apiID)
	assert.NoError(t, err)

	// Verify deleted
	assert.False(t, mr.Exists(key))
}

func TestGetAPIConfigByName_Hit(t *testing.T) {
	mr, redisClient := setupTestRedis(t)
	defer mr.Close()

	cacheLayer := NewAPICacheLayer(redisClient)
	userID := uuid.New()
	apiName := "test-api"
	expectedConfig := &models.APIConfig{
		ID:     uuid.New(),
		UserID: userID,
		Name:   apiName,
	}

	// Pre-populate cache
	data, _ := json.Marshal(expectedConfig)
	// Key format: apiconfig:user:<userID>:name:<apiName>
	key := "apiconfig:user:" + userID.String() + ":name:" + apiName
	_ = redisClient.Set(key, data, time.Minute)

	// Test Hit
	config, err := cacheLayer.GetAPIConfigByName(userID, apiName)
	assert.NoError(t, err)
	assert.NotNil(t, config)
	assert.Equal(t, expectedConfig.ID, config.ID)
	assert.Equal(t, expectedConfig.Name, config.Name)
}

func TestSetAPIConfigByName(t *testing.T) {
	mr, redisClient := setupTestRedis(t)
	defer mr.Close()

	cacheLayer := NewAPICacheLayer(redisClient)
	userID := uuid.New()
	apiName := "test-api"
	config := &models.APIConfig{
		ID:     uuid.New(),
		UserID: userID,
		Name:   apiName,
	}

	// Test Set
	err := cacheLayer.SetAPIConfigByName(userID, config)
	assert.NoError(t, err)

	// Verify in Redis
	// Key format: apiconfig:user:<userID>:name:<apiName>
	key := "apiconfig:user:" + userID.String() + ":name:" + apiName
	assert.True(t, mr.Exists(key))
}

func BenchmarkGetAPIConfig_Hit(b *testing.B) {
	mr, redisClient := setupTestRedis(b)
	defer mr.Close()

	cacheLayer := NewAPICacheLayer(redisClient)

	userID := uuid.New()
	apiName := "bench-api"
	config := &models.APIConfig{
		ID:     uuid.New(),
		UserID: userID,
		Name:   apiName,
	}

	// Pre-populate cache
	_ = cacheLayer.SetAPIConfigByName(userID, config)

	b.ResetTimer()
	for i := 0; i < b.N; i++ {
		_, _ = cacheLayer.GetAPIConfigByName(userID, apiName)
	}
}
