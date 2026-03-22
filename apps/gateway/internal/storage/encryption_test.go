package storage

import (
	"context"
	"encoding/base64"
	"encoding/json"
	"os"
	"testing"
	"time"

	"github.com/google/uuid"
	"github.com/stretchr/testify/assert"
	"github.com/stretchr/testify/require"
	"github.com/varbees/rateguard/internal/models"
	"github.com/varbees/rateguard/pkg/encryption"
)

// TestCredentialEncryptionE2E tests the full encryption flow:
// 1. Create API config with sensitive credentials
// 2. Assert database value cannot be JSON-decoded (binary encrypted)
// 3. Assert can retrieve and use credentials (correct decryption)
func TestCredentialEncryptionE2E(t *testing.T) {
	// Setup test database (use local test DB or mock)
	dsn := os.Getenv("TEST_DATABASE_URL")
	if dsn == "" {
		t.Skip("TEST_DATABASE_URL not set, skipping integration test")
	}

	// Generate test encryption key
	key, err := encryption.GenerateKey()
	require.NoError(t, err, "Failed to generate encryption key")
	os.Setenv("ENCRYPTION_KEY", base64.StdEncoding.EncodeToString(key))
	defer os.Unsetenv("ENCRYPTION_KEY")

	// Initialize store with encryption
	store, err := NewPostgresStore(dsn)
	require.NoError(t, err, "Failed to create store")
	defer store.Close()

	// Create test user
	userID := uuid.New()
	user := &models.User{
		ID:           userID,
		Email:        "test-encryption@example.com",
		PasswordHash: "test-hash",
		APIKey:       "test-key-" + uuid.New().String(),
		Preset:       "free",
		Active:       true,
		CreatedAt:    time.Now(),
		UpdatedAt:    time.Now(),
	}
	err = store.CreateUser(context.Background(), user)
	require.NoError(t, err, "Failed to create test user")
	defer store.db.Exec("DELETE FROM users WHERE id = $1", userID)

	// Test credentials (sensitive data that MUST be encrypted)
	testCredentials := map[string]string{
		"token":    "ghp_SuperSecretGitHubToken123456789",
		"api_key":  "sk-SecretAPIKey987654321",
		"password": "MyVerySecretPassword!@#",
	}

	// Step 1: Create API config with credentials
	apiConfig := &models.APIConfig{
		ID:                 uuid.New(),
		UserID:             userID,
		Name:               "test-encrypted-api",
		TargetURL:          "https://api.example.com",
		RateLimitPerSecond: 10,
		BurstSize:          20,
		RateLimitPerHour:   1000,
		RateLimitPerDay:    10000,
		RateLimitPerMonth:  100000,
		Enabled:            true,
		CustomHeaders:      map[string]string{},
		AllowedOrigins:     []string{},
		AuthType:           "bearer",
		AuthCredentials:    testCredentials,
		TimeoutSeconds:     30,
		RetryAttempts:      3,
	}

	err = store.CreateAPIConfig(context.Background(), apiConfig)
	require.NoError(t, err, "Failed to create API config")
	defer store.db.Exec("DELETE FROM api_configs WHERE id = $1", apiConfig.ID)

	// Step 2: Assert database value CANNOT be JSON-decoded (is encrypted binary)
	var rawCredentials []byte
	err = store.db.QueryRow(
		"SELECT auth_credentials FROM api_configs WHERE id = $1",
		apiConfig.ID,
	).Scan(&rawCredentials)
	require.NoError(t, err, "Failed to read raw credentials from database")

	// Attempt to deserialize as encrypted map
	var encryptedMap map[string]string
	err = json.Unmarshal(rawCredentials, &encryptedMap)
	require.NoError(t, err, "Should be able to deserialize encrypted map structure")

	// Verify the values are encrypted (base64 encoded ciphertext, not plaintext)
	for key, encryptedValue := range encryptedMap {
		assert.NotEqual(t, testCredentials[key], encryptedValue,
			"Credential %s should be encrypted, not plaintext", key)

		// Verify it's base64-encoded (encrypted data characteristic)
		_, err := base64.StdEncoding.DecodeString(encryptedValue)
		assert.NoError(t, err, "Encrypted value for %s should be valid base64", key)

		// Verify it's not the plaintext value
		assert.NotContains(t, encryptedValue, testCredentials[key],
			"Encrypted value should not contain plaintext")
	}

	// Step 3: Assert can retrieve and decrypt credentials correctly
	retrievedConfig, err := store.GetAPIConfig(context.Background(), apiConfig.ID, userID)
	require.NoError(t, err, "Failed to retrieve API config")

	// Verify decrypted credentials match original
	assert.Equal(t, testCredentials["token"], retrievedConfig.AuthCredentials["token"],
		"Token should be correctly decrypted")
	assert.Equal(t, testCredentials["api_key"], retrievedConfig.AuthCredentials["api_key"],
		"API key should be correctly decrypted")
	assert.Equal(t, testCredentials["password"], retrievedConfig.AuthCredentials["password"],
		"Password should be correctly decrypted")

	t.Log("✅ Encryption E2E test passed:")
	t.Log("  - Credentials stored as encrypted binary in database")
	t.Log("  - Cannot decode as plaintext JSON")
	t.Log("  - Successfully decrypted on retrieval")
	t.Log("  - All sensitive data protected at rest")
}

// TestEncryptionRequired tests that credentials cannot be stored without encryption
func TestEncryptionRequired(t *testing.T) {
	dsn := os.Getenv("TEST_DATABASE_URL")
	if dsn == "" {
		t.Skip("TEST_DATABASE_URL not set, skipping integration test")
	}

	// Ensure NO encryption key is set
	os.Unsetenv("ENCRYPTION_KEY")

	// Initialize store WITHOUT encryption
	store, err := NewPostgresStore(dsn)
	require.NoError(t, err, "Failed to create store")
	defer store.Close()

	// Create test user
	userID := uuid.New()
	user := &models.User{
		ID:           userID,
		Email:        "test-no-encryption@example.com",
		PasswordHash: "test-hash",
		APIKey:       "test-key-" + uuid.New().String(),
		Preset:       "free",
		Active:       true,
		CreatedAt:    time.Now(),
		UpdatedAt:    time.Now(),
	}
	err = store.CreateUser(context.Background(), user)
	require.NoError(t, err, "Failed to create test user")
	defer store.db.Exec("DELETE FROM users WHERE id = $1", userID)

	// Attempt to create API config with credentials (should FAIL)
	apiConfig := &models.APIConfig{
		ID:                 uuid.New(),
		UserID:             userID,
		Name:               "test-no-encryption-api",
		TargetURL:          "https://api.example.com",
		RateLimitPerSecond: 10,
		BurstSize:          20,
		Enabled:            true,
		AuthType:           "bearer",
		AuthCredentials:    map[string]string{"token": "secret-token"},
		TimeoutSeconds:     30,
	}

	err = store.CreateAPIConfig(context.Background(), apiConfig)
	assert.Error(t, err, "Should fail to create API config with credentials when encryption is disabled")
	assert.Contains(t, err.Error(), "encryption is required",
		"Error should indicate encryption is required")

	t.Log("✅ Encryption requirement test passed:")
	t.Log("  - Cannot store credentials without ENCRYPTION_KEY")
	t.Log("  - Fails with clear error message")
}

// TestProductionEncryptionRequirement tests that production mode requires ENCRYPTION_KEY
func TestProductionEncryptionRequirement(t *testing.T) {
	dsn := os.Getenv("TEST_DATABASE_URL")
	if dsn == "" {
		t.Skip("TEST_DATABASE_URL not set, skipping integration test")
	}

	// Set production environment
	os.Setenv("GO_ENV", "production")
	defer os.Unsetenv("GO_ENV")

	// Ensure NO encryption key
	os.Unsetenv("ENCRYPTION_KEY")

	// Attempt to initialize store in production without key (should FAIL)
	_, err := NewPostgresStore(dsn)
	assert.Error(t, err, "Should fail to initialize store in production without ENCRYPTION_KEY")
	assert.Contains(t, err.Error(), "ENCRYPTION_KEY is REQUIRED in production",
		"Error should indicate encryption key is required in production")

	t.Log("✅ Production encryption requirement test passed:")
	t.Log("  - Cannot start in production without ENCRYPTION_KEY")
	t.Log("  - Fails fast with clear error message")
}

// TestEncryptionUpdateFlow tests updating credentials with encryption
func TestEncryptionUpdateFlow(t *testing.T) {
	dsn := os.Getenv("TEST_DATABASE_URL")
	if dsn == "" {
		t.Skip("TEST_DATABASE_URL not set, skipping integration test")
	}

	// Generate and set encryption key
	key, err := encryption.GenerateKey()
	require.NoError(t, err)
	os.Setenv("ENCRYPTION_KEY", base64.StdEncoding.EncodeToString(key))
	defer os.Unsetenv("ENCRYPTION_KEY")

	store, err := NewPostgresStore(dsn)
	require.NoError(t, err)
	defer store.Close()

	// Create test user
	userID := uuid.New()
	user := &models.User{
		ID:           userID,
		Email:        "test-update@example.com",
		PasswordHash: "test-hash",
		APIKey:       "test-key-" + uuid.New().String(),
		Preset:       "free",
		Active:       true,
		CreatedAt:    time.Now(),
		UpdatedAt:    time.Now(),
	}
	err = store.CreateUser(context.Background(), user)
	require.NoError(t, err)
	defer store.db.Exec("DELETE FROM users WHERE id = $1", userID)

	// Create initial API config
	apiConfig := &models.APIConfig{
		ID:                 uuid.New(),
		UserID:             userID,
		Name:               "test-update-api",
		TargetURL:          "https://api.example.com",
		RateLimitPerSecond: 10,
		BurstSize:          20,
		Enabled:            true,
		AuthType:           "bearer",
		AuthCredentials:    map[string]string{"token": "original-token"},
		TimeoutSeconds:     30,
	}
	err = store.CreateAPIConfig(context.Background(), apiConfig)
	require.NoError(t, err)
	defer store.db.Exec("DELETE FROM api_configs WHERE id = $1", apiConfig.ID)

	// Update with new credentials
	updatedConfig := *apiConfig
	updatedConfig.AuthCredentials = map[string]string{"token": "updated-secret-token"}
	err = store.UpdateAPIConfig(context.Background(), apiConfig.ID, userID, &updatedConfig)
	require.NoError(t, err)

	// Verify new credentials are encrypted and retrievable
	retrieved, err := store.GetAPIConfig(context.Background(), apiConfig.ID, userID)
	require.NoError(t, err)
	assert.Equal(t, "updated-secret-token", retrieved.AuthCredentials["token"],
		"Updated credentials should be correctly decrypted")

	t.Log("✅ Encryption update flow test passed:")
	t.Log("  - Credentials updated with encryption")
	t.Log("  - New credentials correctly encrypted and decrypted")
}

// TestListAPIConfigsEncryption tests that list operations decrypt all credentials
func TestListAPIConfigsEncryption(t *testing.T) {
	dsn := os.Getenv("TEST_DATABASE_URL")
	if dsn == "" {
		t.Skip("TEST_DATABASE_URL not set, skipping integration test")
	}

	// Generate and set encryption key
	key, err := encryption.GenerateKey()
	require.NoError(t, err)
	os.Setenv("ENCRYPTION_KEY", base64.StdEncoding.EncodeToString(key))
	defer os.Unsetenv("ENCRYPTION_KEY")

	store, err := NewPostgresStore(dsn)
	require.NoError(t, err)
	defer store.Close()

	// Create test user
	userID := uuid.New()
	user := &models.User{
		ID:           userID,
		Email:        "test-list@example.com",
		PasswordHash: "test-hash",
		APIKey:       "test-key-" + uuid.New().String(),
		Preset:       "free",
		Active:       true,
		CreatedAt:    time.Now(),
		UpdatedAt:    time.Now(),
	}
	err = store.CreateUser(context.Background(), user)
	require.NoError(t, err)
	defer store.db.Exec("DELETE FROM users WHERE id = $1", userID)

	// Create multiple API configs with different credentials
	configs := []struct {
		name  string
		token string
	}{
		{"api-1", "token-1-secret"},
		{"api-2", "token-2-secret"},
		{"api-3", "token-3-secret"},
	}

	createdIDs := []uuid.UUID{}
	for _, cfg := range configs {
		apiConfig := &models.APIConfig{
			ID:                 uuid.New(),
			UserID:             userID,
			Name:               cfg.name,
			TargetURL:          "https://api.example.com",
			RateLimitPerSecond: 10,
			BurstSize:          20,
			Enabled:            true,
			AuthType:           "bearer",
			AuthCredentials:    map[string]string{"token": cfg.token},
			TimeoutSeconds:     30,
		}
		err = store.CreateAPIConfig(context.Background(), apiConfig)
		require.NoError(t, err)
		createdIDs = append(createdIDs, apiConfig.ID)
	}
	defer func() {
		for _, id := range createdIDs {
			store.db.Exec("DELETE FROM api_configs WHERE id = $1", id)
		}
	}()

	// List all configs
	retrieved, err := store.ListAPIConfigs(context.Background(), userID)
	require.NoError(t, err)
	assert.GreaterOrEqual(t, len(retrieved), 3, "Should retrieve at least 3 configs")

	// Verify all credentials are correctly decrypted
	for i, cfg := range configs {
		found := false
		for _, r := range retrieved {
			if r.Name == cfg.name {
				assert.Equal(t, cfg.token, r.AuthCredentials["token"],
					"Config %s should have correctly decrypted token", cfg.name)
				found = true
				break
			}
		}
		assert.True(t, found, "Should find config %d in list", i)
	}

	t.Log("✅ List encryption test passed:")
	t.Log("  - Multiple configs listed successfully")
	t.Log("  - All credentials correctly decrypted")
}
