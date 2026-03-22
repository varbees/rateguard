package storage

import (
	"context"
	"encoding/json"
	"fmt"
	"strconv"
	"strings"
	"testing"
	"time"

	"github.com/DATA-DOG/go-sqlmock"
	"github.com/alicebob/miniredis/v2"
	"github.com/google/uuid"
	"github.com/stretchr/testify/assert"
	"github.com/varbees/rateguard/internal/cache"
	"github.com/varbees/rateguard/internal/models"
	"github.com/varbees/rateguard/pkg/logger"
)

// setupTestRedisAndCache creates a miniredis instance and an APICacheLayer
func setupTestRedisAndCache(t *testing.T) (*miniredis.Miniredis, *cache.APICacheLayer) {
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

	// Parse port from mr.Addr()
	addr := mr.Addr()
	var port int
	for i := len(addr) - 1; i >= 0; i-- {
		if addr[i] == ':' {
			port, _ = strconv.Atoi(addr[i+1:])
			break
		}
	}

	redisConfig := &cache.RedisConfig{
		Host:     mr.Host(),
		Port:     port,
		PoolSize: 1,
	}

	redisClient, err := cache.NewRedisClient(redisConfig)
	if err != nil {
		t.Fatalf("failed to create redis client: %v", err)
	}

	cacheLayer := cache.NewAPICacheLayer(redisClient)
	return mr, cacheLayer
}

func TestGetAPIConfigByName_CacheHit(t *testing.T) {
	mr, cacheLayer := setupTestRedisAndCache(t)
	defer mr.Close()

	db, _, err := sqlmock.New()
	assert.NoError(t, err)
	defer db.Close()

	store := &PostgresStore{db: db}
	store.SetCacheLayer(cacheLayer)

	userID := uuid.New()
	apiName := "test-api"
	expectedConfig := &models.APIConfig{
		ID:     uuid.New(),
		UserID: userID,
		Name:   apiName,
	}

	// Pre-populate cache
	// Key format: apiconfig:user:<userID>:name:<apiName>
	key := fmt.Sprintf("apiconfig:user:%s:name:%s", userID.String(), apiName)
	data, _ := json.Marshal(expectedConfig)
	mr.Set(key, string(data))

	// Test Hit - DB should NOT be called (mock expectations empty)
	config, err := store.GetAPIConfigByName(context.Background(), apiName, userID)
	assert.NoError(t, err)
	assert.NotNil(t, config)
	assert.Equal(t, expectedConfig.ID, config.ID)
}

func TestGetAPIConfigByName_CacheMiss(t *testing.T) {
	mr, cacheLayer := setupTestRedisAndCache(t)
	defer mr.Close()

	db, mock, err := sqlmock.New()
	assert.NoError(t, err)
	defer db.Close()

	store := &PostgresStore{db: db}
	store.SetCacheLayer(cacheLayer)

	userID := uuid.New()
	apiName := "test-api"
	expectedConfig := &models.APIConfig{
		ID:        uuid.New(),
		UserID:    userID,
		Name:      apiName,
		TargetURL: "http://example.com",
		Enabled:   true,
	}

	// Expect DB query
	// Columns: id, user_id, name, target_url, rate_limit_per_second, burst_size, rate_limit_per_hour, rate_limit_per_day, rate_limit_per_month, enabled, allowed_origins, custom_headers, auth_type, auth_credentials, timeout_seconds, retry_attempts, created_at, updated_at
	// We need to match the SELECT in postgres.go (18 columns)

	rows := sqlmock.NewRows([]string{
		"id", "user_id", "name", "target_url",
		"rate_limit_per_second", "burst_size", "rate_limit_per_hour", "rate_limit_per_day", "rate_limit_per_month",
		"enabled", "allowed_origins", "custom_headers",
		"auth_type", "auth_credentials",
		"timeout_seconds", "retry_attempts",
		"created_at", "updated_at",
	}).AddRow(
		expectedConfig.ID, expectedConfig.UserID, expectedConfig.Name, expectedConfig.TargetURL,
		10, 20, 1000, 10000, 100000,
		expectedConfig.Enabled, "[]", "{}",
		"none", nil, // nil for auth_credentials to avoid decryption
		30, 3,
		time.Now(), time.Now(),
	)

	mock.ExpectQuery("SELECT .* FROM api_configs WHERE name = \\$1 AND user_id = \\$2").
		WithArgs(apiName, userID). // Adjusted args order to match method signature (name, userID)
		WillReturnRows(rows)

	// Test Miss
	config, err := store.GetAPIConfigByName(context.Background(), apiName, userID)
	assert.NoError(t, err)
	assert.NotNil(t, config)
	assert.Equal(t, expectedConfig.ID, config.ID)

	// Verify cache set
	key := fmt.Sprintf("apiconfig:user:%s:name:%s", userID.String(), apiName)
	assert.True(t, mr.Exists(key))

	assert.NoError(t, mock.ExpectationsWereMet())
}

func TestCreateAPIConfig_CacheSet(t *testing.T) {
	mr, cacheLayer := setupTestRedisAndCache(t)
	defer mr.Close()

	db, mock, err := sqlmock.New()
	assert.NoError(t, err)
	defer db.Close()

	store := &PostgresStore{db: db}
	store.SetCacheLayer(cacheLayer)

	config := &models.APIConfig{
		ID:        uuid.New(),
		UserID:    uuid.New(),
		Name:      "new-api",
		TargetURL: "http://example.com",
	}

	// Expect Insert
	// CreateAPIConfig uses QueryRowContext with RETURNING id, created_at, updated_at
	// We need to match the query and return rows
	rows := sqlmock.NewRows([]string{"id", "created_at", "updated_at"}).
		AddRow(config.ID, time.Now(), time.Now())

	mock.ExpectQuery("INSERT INTO api_configs").
		WithArgs(
			config.ID, config.UserID, config.Name, sqlmock.AnyArg(), config.TargetURL,
			sqlmock.AnyArg(), sqlmock.AnyArg(), sqlmock.AnyArg(), sqlmock.AnyArg(), sqlmock.AnyArg(),
			sqlmock.AnyArg(), sqlmock.AnyArg(), sqlmock.AnyArg(),
			sqlmock.AnyArg(), sqlmock.AnyArg(),
			sqlmock.AnyArg(), sqlmock.AnyArg(),
			sqlmock.AnyArg(), sqlmock.AnyArg(),
		).
		WillReturnRows(rows)

	err = store.CreateAPIConfig(context.Background(), config)
	assert.NoError(t, err)

	// Verify cache set (by name)
	key := fmt.Sprintf("apiconfig:user:%s:name:%s", config.UserID.String(), config.Name)
	assert.True(t, mr.Exists(key))

	assert.NoError(t, mock.ExpectationsWereMet())
}

func TestUpdateAPIConfig_CacheInvalidate(t *testing.T) {
	mr, cacheLayer := setupTestRedisAndCache(t)
	defer mr.Close()

	db, mock, err := sqlmock.New()
	assert.NoError(t, err)
	defer db.Close()

	store := &PostgresStore{db: db}
	store.SetCacheLayer(cacheLayer)

	config := &models.APIConfig{
		ID:        uuid.New(),
		UserID:    uuid.New(),
		Name:      "updated-api",
		TargetURL: "http://example.com",
	}

	// Pre-populate cache to verify invalidation
	key := fmt.Sprintf("apiconfig:user:%s:name:%s", config.UserID.String(), config.Name)
	mr.Set(key, "old-data")

	// Also ID-based cache
	idKey := fmt.Sprintf("apiconfig:%s", config.ID.String())
	mr.Set(idKey, "old-data")

	// Expect Update
	// UpdateAPIConfig uses QueryRowContext with RETURNING updated_at
	rows := sqlmock.NewRows([]string{"updated_at"}).
		AddRow(time.Now())

	mock.ExpectQuery("UPDATE api_configs").
		WithArgs(
			config.Name, config.TargetURL,
			sqlmock.AnyArg(), sqlmock.AnyArg(), sqlmock.AnyArg(), sqlmock.AnyArg(), sqlmock.AnyArg(),
			sqlmock.AnyArg(), sqlmock.AnyArg(), sqlmock.AnyArg(),
			sqlmock.AnyArg(), sqlmock.AnyArg(),
			sqlmock.AnyArg(), sqlmock.AnyArg(),
			sqlmock.AnyArg(), // updated_at
			config.ID, config.UserID,
		).
		WillReturnRows(rows)

	err = store.UpdateAPIConfig(context.Background(), config.ID, config.UserID, config)
	assert.NoError(t, err)

	// Verify cache invalidated
	assert.False(t, mr.Exists(key))
	assert.False(t, mr.Exists(idKey))

	assert.NoError(t, mock.ExpectationsWereMet())
}
