package storage

import (
	"context"
	"database/sql"
	"encoding/base64"
	"encoding/json"
	"fmt"
	"os"
	"time"

	"github.com/google/uuid"
	"github.com/lib/pq"
	"github.com/varbees/rateguard/internal/cache"
	"github.com/varbees/rateguard/internal/models"
	"github.com/varbees/rateguard/pkg/encryption"
	"github.com/varbees/rateguard/pkg/logger"
	"go.uber.org/zap"
)

// PostgresStore handles all database operations
type PostgresStore struct {
	db        *sql.DB
	encryptor *encryption.AESEncryptor // Optional: nil if encryption disabled
	cache     *cache.APICacheLayer     // Optional: nil if Redis unavailable
}

// NewPostgresStore creates a new PostgreSQL store with optimized connection pooling
func NewPostgresStore(dsn string) (*PostgresStore, error) {
	db, err := sql.Open("postgres", dsn)
	if err != nil {
		return nil, fmt.Errorf("failed to open database: %w", err)
	}

	// Configure connection pool for production workloads
	db.SetMaxOpenConns(25)                 // Maximum number of open connections
	db.SetMaxIdleConns(5)                  // Maximum number of idle connections
	db.SetConnMaxLifetime(5 * time.Minute) // Maximum lifetime of a connection
	db.SetConnMaxIdleTime(1 * time.Minute) // Maximum idle time before closing

	// Test connection
	ctx, cancel := context.WithTimeout(context.Background(), 5*time.Second)
	defer cancel()

	if err := db.PingContext(ctx); err != nil {
		db.Close()
		return nil, fmt.Errorf("failed to ping database: %w", err)
	}

	logger.Info("Connected to PostgreSQL database",
		zap.Int("max_open_conns", 25),
		zap.Int("max_idle_conns", 5),
	)

	// Initialize encryptor - REQUIRED in production
	var encryptor *encryption.AESEncryptor
	encKeyStr := os.Getenv("ENCRYPTION_KEY")

	// Check if we're in production mode (indicated by environment)
	env := os.Getenv("GO_ENV")
	isProduction := env == "production" || env == "prod"

	if encKeyStr == "" {
		if isProduction {
			return nil, fmt.Errorf("ENCRYPTION_KEY is REQUIRED in production but not set")
		}
		logger.Warn("ENCRYPTION_KEY not set - encryption disabled (ONLY ALLOWED IN DEVELOPMENT)")
	} else {
		encKey, err := base64.StdEncoding.DecodeString(encKeyStr)
		if err != nil {
			if isProduction {
				return nil, fmt.Errorf("failed to decode ENCRYPTION_KEY in production: %w", err)
			}
			logger.Warn("Failed to decode ENCRYPTION_KEY, encryption disabled (development only)",
				zap.Error(err),
			)
		} else {
			encryptor, err = encryption.NewAESEncryptor(encKey)
			if err != nil {
				if isProduction {
					return nil, fmt.Errorf("failed to initialize encryptor in production: %w", err)
				}
				logger.Warn("Failed to initialize encryptor, encryption disabled (development only)",
					zap.Error(err),
				)
			} else {
				logger.Info("Encryption enabled for credentials at rest (AES-256-GCM)")
			}
		}
	}

	return &PostgresStore{db: db, encryptor: encryptor}, nil
}

// SetCacheLayer sets the cache layer for API config caching
// If not set, PostgresStore falls back to direct database queries
func (s *PostgresStore) SetCacheLayer(cacheLayer *cache.APICacheLayer) {
	s.cache = cacheLayer
	logger.Info("API config cache layer enabled")
}

// Close closes the database connection
func (s *PostgresStore) Close() error {
	return s.db.Close()
}

// Health checks database connectivity
func (s *PostgresStore) Health() bool {
	ctx, cancel := context.WithTimeout(context.Background(), 2*time.Second)
	defer cancel()
	return s.db.PingContext(ctx) == nil
}

// GetDB returns the underlying database connection
func (s *PostgresStore) GetDB() *sql.DB {
	return s.db
}

// --- User Operations ---

// CreateUser creates a new user in the database
func (s *PostgresStore) CreateUser(ctx context.Context, user *models.User) error {
	query := `
		INSERT INTO users (id, email, password_hash, api_key, handle, plan, active, email_verified, 
		                   verification_token, created_at, updated_at)
		VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11)
	`

	// Handle nullable pointer fields
	var verificationToken *string
	if user.VerificationToken != nil {
		verificationToken = user.VerificationToken
	}

	_, err := s.db.ExecContext(
		ctx,
		query,
		user.ID,
		user.Email,
		user.PasswordHash,
		user.APIKey,
		user.Handle,
		user.Preset,
		user.Active,
		user.EmailVerified,
		verificationToken,
		user.CreatedAt,
		user.UpdatedAt,
	)

	if err != nil {
		// Check for unique constraint violation (duplicate email or handle)
		if pqErr, ok := err.(*pq.Error); ok {
			if pqErr.Code == "23505" { // unique_violation
				// Check which constraint was violated
				if pqErr.Constraint == "users_handle_key" {
					return models.ErrHandleTaken
				}
				logger.Debug("Attempted to create user with duplicate email",
					zap.String("email", user.Email),
				)
				return models.ErrUserAlreadyExists
			}
		}
		return fmt.Errorf("failed to create user: %w", err)
	}

	logger.Info("User created",
		zap.String("user_id", user.ID.String()),
		zap.String("email", user.Email),
		zap.String("handle", user.Handle),
	)
	return nil
}

// CreateUserWithSubscription creates a user and their default subscription in a single transaction
func (s *PostgresStore) CreateUserWithSubscription(ctx context.Context, user *models.User, sub *models.Subscription) error {
	// Pre-check: Ensure handle is not reserved
	reserved, err := s.IsReservedHandle(ctx, user.Handle)
	if err != nil {
		return fmt.Errorf("failed to check reserved handle: %w", err)
	}
	if reserved {
		return models.ErrHandleReserved
	}

	tx, err := s.db.BeginTx(ctx, nil)
	if err != nil {
		return fmt.Errorf("failed to begin transaction: %w", err)
	}
	defer tx.Rollback()

	// 1. Insert User
	userQuery := `
		INSERT INTO users (id, email, password_hash, api_key, handle, plan, active, email_verified, 
		                   verification_token, created_at, updated_at)
		VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11)
	`
	var verificationToken *string
	if user.VerificationToken != nil {
		verificationToken = user.VerificationToken
	}

	_, err = tx.ExecContext(
		ctx,
		userQuery,
		user.ID,
		user.Email,
		user.PasswordHash,
		user.APIKey,
		user.Handle,
		user.Preset,
		user.Active,
		user.EmailVerified,
		verificationToken,
		user.CreatedAt,
		user.UpdatedAt,
	)

	if err != nil {
		if pqErr, ok := err.(*pq.Error); ok {
			if pqErr.Code == "23505" { // unique_violation
				if pqErr.Constraint == "users_handle_key" {
					return models.ErrHandleTaken
				}
				return models.ErrUserAlreadyExists
			}
		}
		return fmt.Errorf("failed to create user in tx: %w", err)
	}

	// 2. Insert Subscription
	subQuery := `
		INSERT INTO subscriptions (
			id, user_id, plan_tier, billing_cycle, amount_minor_units, currency,
			payment_provider, external_subscription_id, external_customer_id,
			status, trial_ends_at, current_period_start, current_period_end,
			created_at, updated_at
		) VALUES (
			$1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15
		)
	`
	_, err = tx.ExecContext(
		ctx, subQuery,
		sub.ID, sub.UserID, sub.PlanTier, sub.BillingCycle, sub.AmountMinorUnits, sub.Currency,
		sub.PaymentProvider, sub.ExternalSubscriptionID, sub.ExternalCustomerID,
		sub.Status, sub.TrialEndsAt, sub.CurrentPeriodStart, sub.CurrentPeriodEnd,
		sub.CreatedAt, sub.UpdatedAt,
	)

	if err != nil {
		return fmt.Errorf("failed to create subscription in tx: %w", err)
	}

	if err := tx.Commit(); err != nil {
		return fmt.Errorf("failed to commit transaction: %w", err)
	}

	logger.Info("User and subscription created atomically",
		zap.String("user_id", user.ID.String()),
		zap.String("email", user.Email),
	)
	return nil
}

// GetUserByAPIKey retrieves a user by checking api_keys table
// This supports multiple API keys per user for zero-downtime rotation
func (s *PostgresStore) GetUserByAPIKey(ctx context.Context, apiKey string) (*models.User, error) {
	query := `
		SELECT u.id, u.email, u.plan, u.active, u.email_verified, u.last_login_at, 
		       u.created_at, u.updated_at
		FROM users u
		INNER JOIN api_keys ak ON u.id = ak.user_id
		WHERE ak.api_key = $1 
		  AND ak.revoked_at IS NULL
	`

	var user models.User
	err := s.db.QueryRowContext(ctx, query, apiKey).Scan(
		&user.ID, &user.Email, &user.Preset, &user.Active, &user.EmailVerified,
		&user.LastLoginAt, &user.CreatedAt, &user.UpdatedAt,
	)

	if err == sql.ErrNoRows {
		return nil, models.ErrUserNotFound
	}
	if err != nil {
		return nil, fmt.Errorf("failed to get user by API key: %w", err)
	}

	// Update last_used_at asynchronously (don't block auth)
	go func() {
		updateCtx, cancel := context.WithTimeout(context.Background(), 2*time.Second)
		defer cancel()
		s.UpdateAPIKeyLastUsed(updateCtx, apiKey)
	}()

	return &user, nil
}

// GetUserByID retrieves a user by ID
func (s *PostgresStore) GetUserByID(ctx context.Context, userID uuid.UUID) (*models.User, error) {
	query := `
		SELECT id, email, api_key, plan, active, created_at, updated_at
		FROM users
		WHERE id = $1
	`

	var user models.User
	err := s.db.QueryRowContext(ctx, query, userID).Scan(
		&user.ID,
		&user.Email,
		&user.APIKey,
		&user.Preset,
		&user.Active,
		&user.CreatedAt,
		&user.UpdatedAt,
	)

	if err == sql.ErrNoRows {
		return nil, models.ErrUserNotFound
	}
	if err != nil {
		return nil, fmt.Errorf("failed to get user: %w", err)
	}

	return &user, nil
}

// UpdateUser updates user information
func (s *PostgresStore) UpdateUser(ctx context.Context, userID uuid.UUID, updates *models.UpdateUserRequest) error {
	query := `
		UPDATE users
		SET plan = COALESCE($1, plan),
		    active = COALESCE($2, active),
		    updated_at = NOW()
		WHERE id = $3
	`

	result, err := s.db.ExecContext(ctx, query, updates.Preset, updates.Active, userID)
	if err != nil {
		return fmt.Errorf("failed to update user: %w", err)
	}

	rows, _ := result.RowsAffected()
	if rows == 0 {
		return models.ErrUserNotFound
	}

	logger.Info("User updated", zap.String("user_id", userID.String()))
	return nil
}

// --- API Config Operations ---

// CreateAPIConfig creates a new API configuration
func (s *PostgresStore) CreateAPIConfig(ctx context.Context, config *models.APIConfig) error {
	customHeadersJSON, _ := json.Marshal(config.CustomHeaders)
	allowedOriginsJSON, _ := json.Marshal(config.AllowedOrigins)

	// Encrypt and serialize auth credentials
	var authCredsBinary []byte
	if len(config.AuthCredentials) > 0 {
		if s.encryptor == nil {
			logger.Error("Cannot store credentials without encryption",
				zap.String("user_id", config.UserID.String()),
				zap.String("api_name", config.Name),
			)
			return fmt.Errorf("encryption is required but ENCRYPTION_KEY is not set")
		}

		encryptedCreds, err := s.encryptor.EncryptMap(config.AuthCredentials)
		if err != nil {
			logger.Error("Failed to encrypt auth credentials",
				zap.String("user_id", config.UserID.String()),
				zap.Error(err),
			)
			return fmt.Errorf("failed to encrypt credentials: %w", err)
		}

		// Serialize encrypted map to binary (BYTEA)
		authCredsBinary, err = json.Marshal(encryptedCreds)
		if err != nil {
			return fmt.Errorf("failed to serialize encrypted credentials: %w", err)
		}

		logger.Debug("Auth credentials encrypted and stored as binary",
			zap.String("user_id", config.UserID.String()),
			zap.String("api_name", config.Name),
			zap.Int("encrypted_size_bytes", len(authCredsBinary)),
		)
	}

	query := `
		INSERT INTO api_configs (id, user_id, name, slug, target_url, rate_limit_per_second, burst_size, 
		                        rate_limit_per_hour, rate_limit_per_day, rate_limit_per_month,
		                        enabled, allowed_origins, custom_headers, auth_type, auth_credentials, 
		                        timeout_seconds, retry_attempts, created_at, updated_at)
		VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15, $16, $17, $18, $19)
		RETURNING id, created_at, updated_at
	`

	err := s.db.QueryRowContext(
		ctx,
		query,
		config.ID,
		config.UserID,
		config.Name,
		config.Slug,
		config.TargetURL,
		config.RateLimitPerSecond,
		config.BurstSize,
		config.RateLimitPerHour,
		config.RateLimitPerDay,
		config.RateLimitPerMonth,
		config.Enabled,
		allowedOriginsJSON,
		customHeadersJSON,
		config.AuthType,
		authCredsBinary,
		config.TimeoutSeconds,
		config.RetryAttempts,
		time.Now(),
		time.Now(),
	).Scan(&config.ID, &config.CreatedAt, &config.UpdatedAt)

	if err != nil {
		// Check for duplicate key violation
		if pqErr, ok := err.(*pq.Error); ok {
			if pqErr.Code == "23505" { // unique_violation
				// Check which constraint was violated
				if pqErr.Constraint == "unique_user_api_slug" {
					return models.ErrSlugTaken
				}
				logger.Debug("Duplicate API configuration name",
					zap.String("user_id", config.UserID.String()),
					zap.String("api_name", config.Name),
				)
				return models.ErrAPIConfigAlreadyExists
			}
		}
		return fmt.Errorf("failed to create API config: %w", err)
	}

	logger.Info("API config created",
		zap.String("user_id", config.UserID.String()),
		zap.String("api_name", config.Name),
		zap.String("slug", config.Slug),
	)

	// Cache the newly created config (if cache available)
	if s.cache != nil {
		if err := s.cache.SetAPIConfigByName(config.UserID, config); err != nil {
			logger.Warn("Failed to cache newly created API config",
				zap.String("config_id", config.ID.String()),
				zap.Error(err),
			)
		}
	}

	return nil
}

// GetAPIConfig retrieves an API configuration by ID
func (s *PostgresStore) GetAPIConfig(ctx context.Context, configID, userID uuid.UUID) (*models.APIConfig, error) {
	query := `
		SELECT id, user_id, name, target_url, rate_limit_per_second, burst_size, 
		       rate_limit_per_hour, rate_limit_per_day, rate_limit_per_month,
		       enabled, allowed_origins, custom_headers, auth_type, auth_credentials, 
		       timeout_seconds, retry_attempts, created_at, updated_at
		FROM api_configs
		WHERE id = $1 AND user_id = $2
	`

	var config models.APIConfig
	var customHeadersJSON, authCredsJSON, allowedOriginsJSON []byte

	err := s.db.QueryRowContext(ctx, query, configID, userID).Scan(
		&config.ID,
		&config.UserID,
		&config.Name,
		&config.TargetURL,
		&config.RateLimitPerSecond,
		&config.BurstSize,
		&config.RateLimitPerHour,
		&config.RateLimitPerDay,
		&config.RateLimitPerMonth,
		&config.Enabled,
		&allowedOriginsJSON,
		&customHeadersJSON,
		&config.AuthType,
		&authCredsJSON,
		&config.TimeoutSeconds,
		&config.RetryAttempts,
		&config.CreatedAt,
		&config.UpdatedAt,
	)

	if err == sql.ErrNoRows {
		return nil, models.ErrAPIConfigNotFound
	}
	if err != nil {
		return nil, fmt.Errorf("failed to get API config: %w", err)
	}

	json.Unmarshal(customHeadersJSON, &config.CustomHeaders)
	json.Unmarshal(allowedOriginsJSON, &config.AllowedOrigins)

	// Decrypt auth credentials from binary storage
	if len(authCredsJSON) > 0 {
		if s.encryptor == nil {
			logger.Error("Cannot decrypt credentials without encryptor",
				zap.String("config_id", config.ID.String()),
			)
			return nil, fmt.Errorf("credentials are encrypted but ENCRYPTION_KEY is not set")
		}

		// Deserialize encrypted map from binary
		var encryptedCreds map[string]string
		if err := json.Unmarshal(authCredsJSON, &encryptedCreds); err != nil {
			return nil, fmt.Errorf("failed to deserialize encrypted credentials: %w", err)
		}

		// Decrypt the map
		decryptedCreds, err := s.encryptor.DecryptMap(encryptedCreds)
		if err != nil {
			logger.Error("Failed to decrypt auth credentials",
				zap.String("config_id", config.ID.String()),
				zap.Error(err),
			)
			return nil, fmt.Errorf("failed to decrypt credentials: %w", err)
		}

		config.AuthCredentials = decryptedCreds
		logger.Debug("Auth credentials decrypted from binary",
			zap.String("config_id", config.ID.String()),
		)
	} else {
		config.AuthCredentials = make(map[string]string)
	}

	return &config, nil
}

// GetAPIConfigByName retrieves an API configuration by name
func (s *PostgresStore) GetAPIConfigByName(ctx context.Context, name string, userID uuid.UUID) (*models.APIConfig, error) {
	// Step 1: Try cache first (if available)
	if s.cache != nil {
		cachedConfig, err := s.cache.GetAPIConfigByName(userID, name)
		if err != nil {
			logger.Warn("Cache lookup failed, falling back to database",
				zap.String("user_id", userID.String()),
				zap.String("api_name", name),
				zap.Error(err),
			)
			// Fall through to database query
		} else if cachedConfig != nil {
			// Cache hit!
			logger.Debug("API config cache HIT",
				zap.String("user_id", userID.String()),
				zap.String("api_name", name),
			)
			return cachedConfig, nil
		}
		// Cache miss - continue to DB query
		logger.Debug("API config cache MISS",
			zap.String("user_id", userID.String()),
			zap.String("api_name", name),
		)
	}

	// Step 2: Query database (cache miss or cache unavailable)
	query := `
		SELECT id, user_id, name, target_url, rate_limit_per_second, burst_size, 
		       rate_limit_per_hour, rate_limit_per_day, rate_limit_per_month,
		       enabled, allowed_origins, custom_headers, auth_type, auth_credentials, 
		       timeout_seconds, retry_attempts, created_at, updated_at
		FROM api_configs
		WHERE name = $1 AND user_id = $2 AND enabled = true
	`

	var config models.APIConfig
	var customHeadersJSON, authCredsJSON, allowedOriginsJSON []byte

	err := s.db.QueryRowContext(ctx, query, name, userID).Scan(
		&config.ID,
		&config.UserID,
		&config.Name,
		&config.TargetURL,
		&config.RateLimitPerSecond,
		&config.BurstSize,
		&config.RateLimitPerHour,
		&config.RateLimitPerDay,
		&config.RateLimitPerMonth,
		&config.Enabled,
		&allowedOriginsJSON,
		&customHeadersJSON,
		&config.AuthType,
		&authCredsJSON,
		&config.TimeoutSeconds,
		&config.RetryAttempts,
		&config.CreatedAt,
		&config.UpdatedAt,
	)

	if err == sql.ErrNoRows {
		return nil, models.ErrAPIConfigNotFound
	}
	if err != nil {
		return nil, fmt.Errorf("failed to get API config: %w", err)
	}

	json.Unmarshal(customHeadersJSON, &config.CustomHeaders)
	json.Unmarshal(allowedOriginsJSON, &config.AllowedOrigins)

	// Decrypt auth credentials from binary storage
	if len(authCredsJSON) > 0 {
		if s.encryptor == nil {
			logger.Error("Cannot decrypt credentials without encryptor",
				zap.String("config_id", config.ID.String()),
				zap.String("api_name", config.Name),
			)
			return nil, fmt.Errorf("credentials are encrypted but ENCRYPTION_KEY is not set")
		}

		// Deserialize encrypted map from binary
		var encryptedCreds map[string]string
		if err := json.Unmarshal(authCredsJSON, &encryptedCreds); err != nil {
			return nil, fmt.Errorf("failed to deserialize encrypted credentials: %w", err)
		}

		// Decrypt the map
		decryptedCreds, err := s.encryptor.DecryptMap(encryptedCreds)
		if err != nil {
			logger.Error("Failed to decrypt auth credentials",
				zap.String("config_id", config.ID.String()),
				zap.String("api_name", config.Name),
				zap.Error(err),
			)
			return nil, fmt.Errorf("failed to decrypt credentials: %w", err)
		}

		config.AuthCredentials = decryptedCreds
		logger.Debug("Auth credentials decrypted from binary",
			zap.String("api_name", config.Name),
		)
	} else {
		config.AuthCredentials = make(map[string]string)
	}

	// Step 3: Store in cache for next time (if cache available)
	if s.cache != nil {
		if err := s.cache.SetAPIConfigByName(userID, &config); err != nil {
			logger.Warn("Failed to cache API config",
				zap.String("user_id", userID.String()),
				zap.String("api_name", name),
				zap.Error(err),
			)
			// Don't fail the request if caching fails
		}
	}

	return &config, nil
}

// ListAPIConfigs retrieves all API configurations for a user
func (s *PostgresStore) ListAPIConfigs(ctx context.Context, userID uuid.UUID) ([]models.APIConfig, error) {
	query := `
		SELECT id, user_id, name, target_url, rate_limit_per_second, burst_size, 
		       rate_limit_per_hour, rate_limit_per_day, rate_limit_per_month,
		       enabled, allowed_origins, custom_headers, auth_type, auth_credentials, 
		       timeout_seconds, retry_attempts, created_at, updated_at
		FROM api_configs
		WHERE user_id = $1
		ORDER BY created_at DESC
	`

	rows, err := s.db.QueryContext(ctx, query, userID)
	if err != nil {
		return nil, fmt.Errorf("failed to list API configs: %w", err)
	}
	defer rows.Close()

	var configs []models.APIConfig
	for rows.Next() {
		var config models.APIConfig
		var customHeadersJSON, authCredsJSON, allowedOriginsJSON []byte

		err := rows.Scan(
			&config.ID,
			&config.UserID,
			&config.Name,
			&config.TargetURL,
			&config.RateLimitPerSecond,
			&config.BurstSize,
			&config.RateLimitPerHour,
			&config.RateLimitPerDay,
			&config.RateLimitPerMonth,
			&config.Enabled,
			&allowedOriginsJSON,
			&customHeadersJSON,
			&config.AuthType,
			&authCredsJSON,
			&config.TimeoutSeconds,
			&config.RetryAttempts,
			&config.CreatedAt,
			&config.UpdatedAt,
		)
		if err != nil {
			return nil, fmt.Errorf("failed to scan API config: %w", err)
		}

		json.Unmarshal(customHeadersJSON, &config.CustomHeaders)
		json.Unmarshal(allowedOriginsJSON, &config.AllowedOrigins)

		// Decrypt auth credentials from binary storage
		if len(authCredsJSON) > 0 {
			if s.encryptor == nil {
				logger.Error("Cannot decrypt credentials without encryptor",
					zap.String("config_id", config.ID.String()),
					zap.String("api_name", config.Name),
				)
				// Skip this config rather than failing entire list
				continue
			}

			// Deserialize encrypted map from binary
			var encryptedCreds map[string]string
			if err := json.Unmarshal(authCredsJSON, &encryptedCreds); err != nil {
				logger.Error("Failed to deserialize encrypted credentials in list",
					zap.String("config_id", config.ID.String()),
					zap.Error(err),
				)
				continue
			}

			// Decrypt the map
			decryptedCreds, err := s.encryptor.DecryptMap(encryptedCreds)
			if err != nil {
				logger.Error("Failed to decrypt auth credentials in list",
					zap.String("config_id", config.ID.String()),
					zap.String("api_name", config.Name),
					zap.Error(err),
				)
				continue
			}

			config.AuthCredentials = decryptedCreds
		} else {
			config.AuthCredentials = make(map[string]string)
		}

		configs = append(configs, config)
	}

	return configs, nil
}

// UpdateAPIConfig updates an existing API configuration
func (s *PostgresStore) UpdateAPIConfig(ctx context.Context, configID, userID uuid.UUID, updates *models.APIConfig) error {
	customHeadersJSON, _ := json.Marshal(updates.CustomHeaders)
	allowedOriginsJSON, _ := json.Marshal(updates.AllowedOrigins)

	// Encrypt and serialize auth credentials for update
	var authCredsBinary []byte
	if len(updates.AuthCredentials) > 0 {
		if s.encryptor == nil {
			logger.Error("Cannot update credentials without encryption",
				zap.String("config_id", configID.String()),
			)
			return fmt.Errorf("encryption is required but ENCRYPTION_KEY is not set")
		}

		encryptedCreds, err := s.encryptor.EncryptMap(updates.AuthCredentials)
		if err != nil {
			logger.Error("Failed to encrypt auth credentials for update",
				zap.String("config_id", configID.String()),
				zap.Error(err),
			)
			return fmt.Errorf("failed to encrypt credentials: %w", err)
		}

		// Serialize encrypted map to binary (BYTEA)
		authCredsBinary, err = json.Marshal(encryptedCreds)
		if err != nil {
			return fmt.Errorf("failed to serialize encrypted credentials: %w", err)
		}

		logger.Debug("Auth credentials encrypted for update (binary)",
			zap.String("config_id", configID.String()),
			zap.Int("encrypted_size_bytes", len(authCredsBinary)),
		)
	}

	query := `
		UPDATE api_configs
		SET name = $1, target_url = $2, rate_limit_per_second = $3, burst_size = $4,
		    rate_limit_per_hour = $5, rate_limit_per_day = $6, rate_limit_per_month = $7,
		    enabled = $8, allowed_origins = $9, custom_headers = $10, auth_type = $11, 
		    auth_credentials = $12, timeout_seconds = $13, retry_attempts = $14, updated_at = $15
		WHERE id = $16 AND user_id = $17
		RETURNING updated_at
	`

	err := s.db.QueryRowContext(
		ctx,
		query,
		updates.Name,
		updates.TargetURL,
		updates.RateLimitPerSecond,
		updates.BurstSize,
		updates.RateLimitPerHour,
		updates.RateLimitPerDay,
		updates.RateLimitPerMonth,
		updates.Enabled,
		allowedOriginsJSON,
		customHeadersJSON,
		updates.AuthType,
		authCredsBinary,
		updates.TimeoutSeconds,
		updates.RetryAttempts,
		time.Now(),
		configID,
		userID,
	).Scan(&updates.UpdatedAt)

	if err == sql.ErrNoRows {
		return models.ErrAPIConfigNotFound
	}
	if err != nil {
		// Check for duplicate key violation
		if pqErr, ok := err.(*pq.Error); ok {
			if pqErr.Code == "23505" { // unique_violation
				return models.ErrAPIConfigAlreadyExists
			}
		}
		return fmt.Errorf("failed to update API config: %w", err)
	}

	logger.Info("API config updated",
		zap.String("config_id", configID.String()),
		zap.String("api_name", updates.Name),
	)

	// Invalidate cache (if cache available)
	// This ensures next request gets fresh data
	if s.cache != nil {
		// Invalidate both by ID and by name
		if err := s.cache.InvalidateAPIConfig(configID); err != nil {
			logger.Warn("Failed to invalidate API config cache (by ID)",
				zap.String("config_id", configID.String()),
				zap.Error(err),
			)
		}

		// Also invalidate the name-based cache key
		// Note: We invalidate instead of update because the name might have changed
		if err := s.cache.InvalidateAPIConfigByName(userID, updates.Name); err != nil {
			logger.Warn("Failed to invalidate API config cache (by name)",
				zap.String("user_id", userID.String()),
				zap.String("api_name", updates.Name),
				zap.Error(err),
			)
		}

		logger.Debug("API config cache invalidated",
			zap.String("config_id", configID.String()),
		)
	}

	return nil
}

// DeleteAPIConfig deletes an API configuration
func (s *PostgresStore) DeleteAPIConfig(ctx context.Context, configID, userID uuid.UUID) error {
	query := `DELETE FROM api_configs WHERE id = $1 AND user_id = $2`

	result, err := s.db.ExecContext(ctx, query, configID, userID)
	if err != nil {
		return fmt.Errorf("failed to delete API config: %w", err)
	}

	rows, _ := result.RowsAffected()
	if rows == 0 {
		return models.ErrAPIConfigNotFound
	}

	logger.Info("API config deleted", zap.String("config_id", configID.String()))
	return nil
}
