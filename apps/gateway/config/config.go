package config

import (
	"fmt"
	"time"

	"github.com/spf13/viper"
)

// Config holds all application configuration
type Config struct {
	Server        ServerConfig        `mapstructure:"server"`
	Database      DatabaseConfig      `mapstructure:"database"`
	WorkerPool    WorkerPoolConfig    `mapstructure:"worker_pool"`
	RateLimiter   RateLimiterConfig   `mapstructure:"rate_limiter"`
	Logging       LoggingConfig       `mapstructure:"logging"`
	Timeouts      TimeoutsConfig      `mapstructure:"timeouts"`
	RateGuard     RateGuardConfig     `mapstructure:"rateguard"`
	Observability ObservabilityConfig `mapstructure:"observability"`
	JWT           JWTConfig           `mapstructure:"jwt"`
	Payment       PaymentConfig       `mapstructure:"payment"`
	Webhook       WebhookConfig       `mapstructure:"webhook"`
}

type ServerConfig struct {
	Host            string `mapstructure:"host"`
	Port            int    `mapstructure:"port"`
	ReadTimeout     int    `mapstructure:"read_timeout_sec"`
	WriteTimeout    int    `mapstructure:"write_timeout_sec"`
	ShutdownTimeout int    `mapstructure:"shutdown_timeout_sec"`
}

type DatabaseConfig struct {
	Host     string `mapstructure:"host"`
	Port     int    `mapstructure:"port"`
	User     string `mapstructure:"user"`
	Password string `mapstructure:"password"`
	Database string `mapstructure:"database"`
	SSLMode  string `mapstructure:"ssl_mode"`
}

type WorkerPoolConfig struct {
	WorkerCount int `mapstructure:"worker_count"`
	QueueSize   int `mapstructure:"queue_size"`
}

type RateLimiterConfig struct {
	RequestsPerSecond int  `mapstructure:"requests_per_second"`
	BurstSize         int  `mapstructure:"burst_size"`
	Enabled           bool `mapstructure:"enabled"`
}

type LoggingConfig struct {
	Level       string `mapstructure:"level"`  // debug, info, warn, error
	Format      string `mapstructure:"format"` // json, console
	Development bool   `mapstructure:"development"`
}

type TimeoutsConfig struct {
	APIRequest  int `mapstructure:"api_request_sec"`
	Aggregation int `mapstructure:"aggregation_sec"`
	HTTPClient  int `mapstructure:"http_client_sec"`
	IdleConn    int `mapstructure:"idle_conn_sec"`
}

type RateGuardConfig struct {
	EnableMultiLimiter bool                 `mapstructure:"enable_multi_limiter"`
	CleanupInterval    int                  `mapstructure:"cleanup_interval_min"`
	RateLimitBackend   string               `mapstructure:"ratelimit_backend"` // "redis" or "memory"
	CircuitBreaker     CircuitBreakerConfig `mapstructure:"circuit_breaker"`
}

type CircuitBreakerConfig struct {
	MaxFailures                     int `mapstructure:"max_failures"`
	TimeoutSeconds                  int `mapstructure:"timeout_seconds"`
	MaxConcurrentRequestsInHalfOpen int `mapstructure:"max_concurrent_requests_half_open"`
	SuccessThresholdInHalfOpen      int `mapstructure:"success_threshold_half_open"`
}

type JWTConfig struct {
	Secret string `mapstructure:"secret"`
}

type PaymentConfig struct {
	// Razorpay (India)
	RazorpayKeyID         string `mapstructure:"razorpay_key_id"`
	RazorpayKeySecret     string `mapstructure:"razorpay_key_secret"`
	RazorpayWebhookSecret string `mapstructure:"razorpay_webhook_secret"`

	// Stripe (Global)
	StripeSecretKey      string `mapstructure:"stripe_secret_key"`
	StripeWebhookSecret  string `mapstructure:"stripe_webhook_secret"`
	StripePublishableKey string `mapstructure:"stripe_publishable_key"`
}

type WebhookConfig struct {
	Enabled            bool `mapstructure:"enabled"`              // Enable webhook relay system
	WorkerCount        int  `mapstructure:"worker_count"`         // Number of concurrent workers
	PollIntervalSec    int  `mapstructure:"poll_interval_sec"`    // How often to check for pending webhooks
	DeliveryTimeoutSec int  `mapstructure:"delivery_timeout_sec"` // HTTP timeout for webhook delivery
	MaxRetries         int  `mapstructure:"max_retries"`          // Maximum retry attempts
	BaseRetryDelaySec  int  `mapstructure:"base_retry_delay_sec"` // Initial retry delay (exponential backoff)
	MaxRetryDelaySec   int  `mapstructure:"max_retry_delay_sec"`  // Maximum retry delay
	RetentionDays      int  `mapstructure:"retention_days"`       // Days to keep delivered webhooks
}

type ObservabilityConfig struct {
	ServiceName           string `mapstructure:"service_name"`
	OTLPCollectorEndpoint string `mapstructure:"otlp_collector_endpoint"`
}

// Load reads configuration from file or environment variables
func Load(configPath string) (*Config, error) {
	v := viper.New()

	// Set defaults for all configurations
	setDefaults(v)

	// Configure Viper
	if configPath != "" {
		v.SetConfigFile(configPath)
	} else {
		v.SetConfigName("config")
		v.SetConfigType("yaml")
		v.AddConfigPath("./config")
		v.AddConfigPath(".")
	}

	// Environment variable support
	v.SetEnvPrefix("AGG")
	v.AutomaticEnv()

	// Bind payment-specific env vars (without AGG prefix)
	v.BindEnv("payment.razorpay_key_id", "RAZORPAY_KEY_ID")
	v.BindEnv("payment.razorpay_key_secret", "RAZORPAY_KEY_SECRET")
	v.BindEnv("payment.razorpay_webhook_secret", "RAZORPAY_WEBHOOK_SECRET")
	v.BindEnv("payment.stripe_secret_key", "STRIPE_SECRET_KEY")
	v.BindEnv("payment.stripe_webhook_secret", "STRIPE_WEBHOOK_SECRET")
	v.BindEnv("payment.stripe_publishable_key", "STRIPE_PUBLISHABLE_KEY")

	// Bind JWT secret (without AGG prefix for production deployments)
	v.BindEnv("jwt.secret", "JWT_SECRET")

	// Bind observability env vars.
	v.BindEnv("observability.service_name", "OTEL_SERVICE_NAME")
	v.BindEnv("observability.otlp_collector_endpoint", "OTEL_EXPORTER_OTLP_ENDPOINT")

	// Bind Database env vars (without AGG prefix)
	v.BindEnv("database.host", "DB_HOST")
	v.BindEnv("database.port", "DB_PORT")
	v.BindEnv("database.user", "DB_USER")
	v.BindEnv("database.password", "DB_PASSWORD")
	v.BindEnv("database.database", "DB_NAME")
	v.BindEnv("database.ssl_mode", "DB_SSL_MODE")

	// Bind Redis env vars (without AGG prefix)
	v.BindEnv("rateguard.ratelimit_backend", "RATE_LIMITER_BACKEND")

	// Bind Admin API Key
	v.BindEnv("auth.api_key_admin", "API_KEY_ADMIN")
	v.BindEnv("encryption.key", "ENCRYPTION_KEY")

	// Read config file (it's okay if it doesn't exist)
	if err := v.ReadInConfig(); err != nil {
		if _, ok := err.(viper.ConfigFileNotFoundError); !ok {
			return nil, fmt.Errorf("error reading config file: %w", err)
		}
		// Config file not found; using defaults and env vars
	}

	// Unmarshal into Config struct
	var cfg Config
	if err := v.Unmarshal(&cfg); err != nil {
		return nil, fmt.Errorf("unable to decode config: %w", err)
	}

	return &cfg, nil
}

// setDefaults configures sensible defaults
func setDefaults(v *viper.Viper) {
	// Server defaults
	v.SetDefault("server.host", "0.0.0.0")
	v.SetDefault("server.port", 8008)
	v.SetDefault("server.read_timeout_sec", 30)
	v.SetDefault("server.write_timeout_sec", 30)
	v.SetDefault("server.shutdown_timeout_sec", 30)

	// Database defaults
	v.SetDefault("database.host", "localhost")
	v.SetDefault("database.port", 5432)
	v.SetDefault("database.user", "rateguard")
	v.SetDefault("database.password", "rateguard_dev_password")
	v.SetDefault("database.database", "rateguard")
	v.SetDefault("database.ssl_mode", "disable")

	// Worker pool defaults
	v.SetDefault("worker_pool.worker_count", 10)
	v.SetDefault("worker_pool.queue_size", 100)

	// Rate limiter defaults
	v.SetDefault("rate_limiter.requests_per_second", 100)
	v.SetDefault("rate_limiter.burst_size", 200)
	v.SetDefault("rate_limiter.enabled", true)

	// Logging defaults
	v.SetDefault("logging.level", "info")
	v.SetDefault("logging.format", "console")
	v.SetDefault("logging.development", false)

	// Timeouts defaults
	v.SetDefault("timeouts.api_request_sec", 10)
	v.SetDefault("timeouts.aggregation_sec", 30)
	v.SetDefault("timeouts.http_client_sec", 30)
	v.SetDefault("timeouts.idle_conn_sec", 90)

	// RateGuard defaults
	v.SetDefault("rateguard.enable_multi_limiter", true)
	v.SetDefault("rateguard.cleanup_interval_min", 60)
	v.SetDefault("rateguard.ratelimit_backend", "redis") // "redis" or "memory"

	// Circuit Breaker defaults
	v.SetDefault("rateguard.circuit_breaker.max_failures", 5)
	v.SetDefault("rateguard.circuit_breaker.timeout_seconds", 60)
	v.SetDefault("rateguard.circuit_breaker.max_concurrent_requests_half_open", 1)
	v.SetDefault("rateguard.circuit_breaker.success_threshold_half_open", 2)

	// JWT defaults (loaded from environment variable)
	v.SetDefault("jwt.secret", "") // MUST be set in production

	// Payment provider defaults (loaded from environment variables)
	v.SetDefault("payment.razorpay_key_id", "")
	v.SetDefault("payment.razorpay_key_secret", "")
	v.SetDefault("payment.razorpay_webhook_secret", "")
	v.SetDefault("payment.stripe_secret_key", "")
	v.SetDefault("payment.stripe_webhook_secret", "")
	v.SetDefault("payment.stripe_publishable_key", "")

	// Webhook relay defaults
	v.SetDefault("webhook.enabled", true)
	v.SetDefault("webhook.worker_count", 5)
	v.SetDefault("webhook.poll_interval_sec", 5)
	v.SetDefault("webhook.delivery_timeout_sec", 30)
	v.SetDefault("webhook.max_retries", 5)
	v.SetDefault("webhook.base_retry_delay_sec", 5)
	v.SetDefault("webhook.max_retry_delay_sec", 300) // 5 minutes
	v.SetDefault("webhook.retention_days", 30)

	// Observability defaults
	v.SetDefault("observability.service_name", "rateguard-control-plane")
	v.SetDefault("observability.otlp_collector_endpoint", "localhost:4317")
}

// GetServerAddress returns the full server address
func (c *Config) GetServerAddress() string {
	return fmt.Sprintf("%s:%d", c.Server.Host, c.Server.Port)
}

// GetReadTimeout returns the read timeout as duration
func (c *Config) GetReadTimeout() time.Duration {
	return time.Duration(c.Server.ReadTimeout) * time.Second
}

// GetWriteTimeout returns the write timeout as duration
func (c *Config) GetWriteTimeout() time.Duration {
	return time.Duration(c.Server.WriteTimeout) * time.Second
}

// GetShutdownTimeout returns the shutdown timeout as duration
func (c *Config) GetShutdownTimeout() time.Duration {
	return time.Duration(c.Server.ShutdownTimeout) * time.Second
}

// GetAPIRequestTimeout returns API request timeout as duration
func (c *Config) GetAPIRequestTimeout() time.Duration {
	return time.Duration(c.Timeouts.APIRequest) * time.Second
}

// GetAggregationTimeout returns aggregation timeout as duration
func (c *Config) GetAggregationTimeout() time.Duration {
	return time.Duration(c.Timeouts.Aggregation) * time.Second
}

// GetHTTPClientTimeout returns HTTP client timeout as duration
func (c *Config) GetHTTPClientTimeout() time.Duration {
	return time.Duration(c.Timeouts.HTTPClient) * time.Second
}

// GetIdleConnTimeout returns idle connection timeout as duration
func (c *Config) GetIdleConnTimeout() time.Duration {
	return time.Duration(c.Timeouts.IdleConn) * time.Second
}

// GetDatabaseDSN returns the PostgreSQL connection string
func (c *Config) GetDatabaseDSN() string {
	return fmt.Sprintf(
		"host=%s port=%d user=%s password=%s dbname=%s sslmode=%s",
		c.Database.Host,
		c.Database.Port,
		c.Database.User,
		c.Database.Password,
		c.Database.Database,
		c.Database.SSLMode,
	)
}

// GetCleanupInterval returns the cleanup interval as duration
func (c *Config) GetCleanupInterval() time.Duration {
	return time.Duration(c.RateGuard.CleanupInterval) * time.Minute
}

// IsDistributedRateLimitingEnabled returns true if Redis backend is configured
func (c *Config) IsDistributedRateLimitingEnabled() bool {
	return c.RateGuard.RateLimitBackend == "redis"
}

// GetCircuitBreakerTimeout returns circuit breaker timeout as duration
func (c *Config) GetCircuitBreakerTimeout() time.Duration {
	return time.Duration(c.RateGuard.CircuitBreaker.TimeoutSeconds) * time.Second
}
