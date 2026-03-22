package runtime

import (
	"context"
	"fmt"
	"os"
	"os/signal"
	"syscall"
	"time"

	"github.com/gofiber/fiber/v2"
	"github.com/varbees/rateguard/api"
	"github.com/varbees/rateguard/api/middleware"
	"github.com/varbees/rateguard/config"
	"github.com/varbees/rateguard/internal/aggregator"
	"github.com/varbees/rateguard/internal/analytics"
	domainbootstrap "github.com/varbees/rateguard/internal/app/bootstrap"
	"github.com/varbees/rateguard/internal/auth"
	"github.com/varbees/rateguard/internal/cache"
	"github.com/varbees/rateguard/internal/pool"
	"github.com/varbees/rateguard/internal/proxy"
	"github.com/varbees/rateguard/internal/queue"
	"github.com/varbees/rateguard/internal/ratelimiter"
	"github.com/varbees/rateguard/internal/security"
	"github.com/varbees/rateguard/internal/storage"
	otelruntime "github.com/varbees/rateguard/internal/telemetry"
	"github.com/varbees/rateguard/internal/webhook"
	"github.com/varbees/rateguard/internal/websocket"
	"github.com/varbees/rateguard/pkg/logger"
	"go.uber.org/zap"
)

const circuitBreakerInactiveThreshold = 24 * time.Hour

// Runtime owns the constructed gateway services and their lifecycle.
type Runtime struct {
	cfg                 *config.Config
	ctx                 context.Context
	cancel              context.CancelFunc
	telemetryMiddleware *middleware.TelemetryMiddleware
	app                 *fiber.App
	dbStore             *storage.PostgresStore
	redisClient         *cache.RedisClient
	workerPool          *pool.WorkerPool
	rateLimiter         *ratelimiter.RateLimiter
	multiLimiter        *ratelimiter.MultiLimiter
	redisLimiter        *ratelimiter.RedisRateLimiter
	webSocketManager    *websocket.Manager
	webSocketHub        *websocket.Hub
	usageTracker        *storage.UsageTracker
	proxyService        *proxy.ProxyService
	rateLimitAnalyzer   *analytics.RateLimitAnalyzer
	alertDetector       *analytics.AlertDetector
	costEstimator       *analytics.CostEstimator
	webhookWorker       *webhook.WebhookWorker
	cleanupDone         chan struct{}
}

// New builds the gateway runtime and wires all application services.
func New(cfg *config.Config) (*Runtime, error) {
	ctx, cancel := context.WithCancel(context.Background())

	telemetryMiddleware, err := middleware.NewTelemetryMiddleware(otelruntime.Config{
		ServiceName:           cfg.Observability.ServiceName,
		OTLPCollectorEndpoint: cfg.Observability.OTLPCollectorEndpoint,
	})
	if err != nil {
		cancel()
		return nil, fmt.Errorf("initialize telemetry middleware: %w", err)
	}

	r := &Runtime{
		cfg:                 cfg,
		ctx:                 ctx,
		cancel:              cancel,
		telemetryMiddleware: telemetryMiddleware,
		cleanupDone:         make(chan struct{}),
	}

	if err := r.build(); err != nil {
		cancel()
		_ = telemetryMiddleware.Shutdown(context.Background())
		return nil, err
	}

	return r, nil
}

func (r *Runtime) build() error {
	// Initialize database connection
	logger.Info("Connecting to PostgreSQL database...",
		zap.String("host", r.cfg.Database.Host),
		zap.Int("port", r.cfg.Database.Port),
		zap.String("database", r.cfg.Database.Database),
	)
	dbStore, err := storage.NewPostgresStore(r.cfg.GetDatabaseDSN())
	if err != nil {
		return fmt.Errorf("connect to database: %w", err)
	}
	r.dbStore = dbStore
	logger.Info("✅ Database connected successfully")

	// Initialize worker pool
	logger.Info("Initializing worker pool...",
		zap.Int("worker_count", r.cfg.WorkerPool.WorkerCount),
		zap.Int("queue_size", r.cfg.WorkerPool.QueueSize),
	)
	r.workerPool = pool.NetworkerPool(
		r.cfg.WorkerPool.WorkerCount,
		r.cfg.WorkerPool.QueueSize,
	)

	// Initialize rate limiter
	logger.Info("Initializing rate limiter...",
		zap.Int("requests_per_second", r.cfg.RateLimiter.RequestsPerSecond),
		zap.Int("burst_size", r.cfg.RateLimiter.BurstSize),
		zap.Bool("enabled", r.cfg.RateLimiter.Enabled),
	)
	r.rateLimiter = ratelimiter.New(
		r.cfg.RateLimiter.RequestsPerSecond,
		r.cfg.RateLimiter.BurstSize,
		r.cfg.RateLimiter.Enabled,
	)

	// Initialize multi-user rate limiter for RateGuard
	logger.Info("Initializing multi-user rate limiter...",
		zap.Bool("enabled", r.cfg.RateGuard.EnableMultiLimiter),
	)
	r.multiLimiter = ratelimiter.NewMultiLimiter(r.cfg.RateGuard.EnableMultiLimiter)
	go r.multiLimiter.StartCleanupRoutine(r.cfg.GetCleanupInterval(), r.cleanupDone)

	// Initialize Redis client for distributed rate limiting
	r.buildRedisLayer()

	// Initialize WebSocket infrastructure
	r.buildWebSockets()

	// Initialize usage tracker
	r.buildUsageTracker()

	// Initialize aggregator service
	logger.Info("Initializing aggregator service...",
		zap.Duration("aggregation_timeout", r.cfg.GetAggregationTimeout()),
	)
	aggService := aggregator.New(
		r.workerPool,
		r.rateLimiter,
		r.cfg.GetAggregationTimeout(),
	)

	// Initialize proxy service
	logger.Info("Initializing proxy service...",
		zap.Int("circuit_breaker_window_size", r.cfg.RateGuard.CircuitBreaker.RollingWindowSize),
		zap.Float64("circuit_breaker_error_rate_threshold", r.cfg.RateGuard.CircuitBreaker.ErrorRateThreshold),
		zap.Int("circuit_breaker_timeout_seconds", r.cfg.RateGuard.CircuitBreaker.TimeoutSeconds),
	)
	proxyCbConfig := proxy.CircuitBreakerConfig{
		RollingWindowSize:               r.cfg.RateGuard.CircuitBreaker.RollingWindowSize,
		ErrorRateThreshold:              r.cfg.RateGuard.CircuitBreaker.ErrorRateThreshold,
		Timeout:                         time.Duration(r.cfg.RateGuard.CircuitBreaker.TimeoutSeconds) * time.Second,
		MaxConcurrentRequestsInHalfOpen: r.cfg.RateGuard.CircuitBreaker.MaxConcurrentRequestsInHalfOpen,
		SuccessThresholdInHalfOpen:      r.cfg.RateGuard.CircuitBreaker.SuccessThresholdInHalfOpen,
	}
	r.proxyService = proxy.NewProxyService(r.multiLimiter, r.usageTracker, r.dbStore, r.redisLimiter, proxyCbConfig, r.webSocketHub)
	logger.Info("✅ Proxy service initialized")

	if circuitBreakerManager := r.proxyService.GetCircuitBreakerManager(); circuitBreakerManager != nil {
		logger.Info("Initializing circuit breaker cleanup routine...",
			zap.Duration("cleanup_interval", r.cfg.GetCleanupInterval()),
			zap.Duration("inactive_threshold", circuitBreakerInactiveThreshold),
		)
		go circuitBreakerManager.StartCleanupRoutine(r.cfg.GetCleanupInterval(), circuitBreakerInactiveThreshold, r.cleanupDone)
		logger.Info("✅ Circuit breaker cleanup routine initialized")
	}

	// Redis queue persistence for proxy layer
	proxy.InitializeQueueStore(r.redisClient)
	logger.Info("✅ Queue persistence initialized")

	// Initialize middleware
	authMiddleware := middleware.NewAuthMiddleware(r.dbStore, r.cfg.JWT.Secret)
	idempotencyMiddleware := middleware.NewIdempotencyMiddleware(r.redisClient)
	meteringMiddleware := middleware.NewMeteringMiddleware(r.usageTracker)
	corsMiddleware := middleware.NewCORSMiddleware(r.dbStore, r.allowedOrigins())
	globalRateLimitMiddleware := middleware.NewGlobalRateLimitMiddleware(r.redisLimiter)
	logger.Info("✅ Middleware initialized")

	// Create Fiber app
	r.app = fiber.New(fiber.Config{
		AppName:               "RateGuard API Rate Limit Manager v2.0.0",
		ReadTimeout:           r.cfg.GetReadTimeout(),
		WriteTimeout:          r.cfg.GetWriteTimeout(),
		DisableStartupMessage: true,
		ErrorHandler:          domainbootstrap.CustomErrorHandler,
		ReadBufferSize:        16 * 1024, // 16KB - accommodate large JWT cookie headers
	})

	// Initialize observability and analytics
	r.buildAnalytics()

	// Initialize geo detector for currency detection on signup
	geoDetector := auth.NewGeoDetector(r.redisClient)
	logger.Info("✅ Geo detector initialized")

	// Initialize webhook worker (if enabled)
	r.buildWebhookWorker()

	// Setup routes and handlers
	handler := api.NewHandler(aggService)
	proxyHandler := api.NewProxyHandler(r.proxyService, r.dbStore)
	dashboardHandler := api.NewDashboardHandler(r.dbStore, r.usageTracker, r.alertDetector, r.costEstimator, r.redisLimiter, r.proxyService)
	authHandler := api.NewAuthHandler(r.dbStore, geoDetector, r.cfg.JWT.Secret)
	settingsHandler := api.NewSettingsHandler(r.dbStore)
	apiKeysHandler := api.NewAPIKeysHandler(r.dbStore)
	queueHandler := api.NewQueueHandler(r.proxyService)
	rateLimitSuggestionHandler := api.NewRateLimitSuggestionHandler(r.rateLimitAnalyzer, r.dbStore.GetDB(), logger.Log)
	guardrailHandler := api.NewGuardrailHandler(r.dbStore.GetDB(), logger.Log)
	logger.Info("✅ Cost guardrail handler initialized")

	webSocketHandler := api.NewWebSocketHandler(r.webSocketManager, r.webSocketHub, r.cfg.JWT.Secret, r.dbStore.GetDB(), logger.Log)
	logger.Info("✅ WebSocket handler initialized")

	healthHandler := api.NewHealthHandler(r.dbStore, r.redisClient, r.proxyService, r.webhookWorker)
	logger.Info("✅ Health handler initialized")

	metricsHandler := api.NewMetricsHandler(r.dbStore.GetDB(), r.redisClient, r.proxyService, r.usageTracker, logger.Log)
	logger.Info("✅ Metrics handler initialized")

	api.SetupRoutes(
		r.app,
		handler,
		proxyHandler,
		dashboardHandler,
		authHandler,
		settingsHandler,
		apiKeysHandler,
		queueHandler,
		rateLimitSuggestionHandler,
		guardrailHandler,
		authMiddleware,
		idempotencyMiddleware,
		meteringMiddleware,
		r.telemetryMiddleware,
		corsMiddleware,
		globalRateLimitMiddleware,
		healthHandler,
		r.webhookHandler(),
		webSocketHandler,
		metricsHandler,
	)

	return nil
}

func (r *Runtime) buildRedisLayer() {
	if r.cfg.IsDistributedRateLimitingEnabled() {
		logger.Info("Distributed rate limiting enabled (Redis backend)",
			zap.String("backend", r.cfg.RateGuard.RateLimitBackend),
		)

		redisConfig := cache.LoadRedisConfigFromEnv()
		if redisConfig != nil && redisConfig.Host != "" {
			logger.Info("Connecting to Redis for distributed rate limiting...",
				zap.String("host", redisConfig.Host),
				zap.Int("port", redisConfig.Port),
			)

			client, err := cache.NewRedisClient(redisConfig)
			r.redisClient = client
			if err != nil {
				logger.Error("❌ Failed to connect to Redis - FALLING BACK to in-memory rate limiting",
					zap.Error(err),
					zap.String("WARNING", "Rate limits will be PER-INSTANCE, not distributed!"),
				)
				r.redisLimiter = nil
			} else if err := r.redisClient.Ping(); err != nil {
				logger.Error("❌ Redis ping failed - FALLING BACK to in-memory rate limiting",
					zap.Error(err),
					zap.String("WARNING", "Rate limits will be PER-INSTANCE, not distributed!"),
				)
				r.redisLimiter = nil
			} else {
				r.redisLimiter = ratelimiter.NewRedisRateLimiter(r.redisClient, true)
				logger.Info("✅ Distributed rate limiter initialized successfully",
					zap.String("backend", "Redis"),
					zap.String("mode", "multi-instance coordination"),
				)
			}
		} else {
			logger.Error("❌ Redis backend selected but REDIS_HOST not configured - FALLING BACK to in-memory",
				zap.String("WARNING", "Set REDIS_HOST env var for distributed rate limiting"),
			)
			r.redisLimiter = nil
		}
	} else {
		logger.Info("Using in-memory rate limiting (local development mode)",
			zap.String("backend", r.cfg.RateGuard.RateLimitBackend),
			zap.String("note", "Rate limits are per-instance only"),
		)
		r.redisLimiter = nil
	}

	if r.redisClient != nil {
		logger.Info("Initializing API config cache layer...")
		cacheLayer := cache.NewAPICacheLayer(r.redisClient)
		r.dbStore.SetCacheLayer(cacheLayer)
		logger.Info("✅ API config cache layer initialized",
			zap.Duration("ttl", 5*time.Minute),
			zap.String("benefit", "Eliminates DB lookup on every request"),
		)
	} else {
		logger.Info("API config caching disabled (Redis not available) - using direct DB queries")
	}
}

func (r *Runtime) buildWebSockets() {
	logger.Info("Initializing WebSocket infrastructure...")
	r.webSocketManager = websocket.NewManager(logger.Log, r.allowedWebSocketOrigins())
	r.webSocketHub = websocket.NewHub(r.webSocketManager, r.redisClient, logger.Log)
	r.webSocketHub.Start()
	go r.webSocketManager.Start(r.ctx)
	logger.Info("✅ WebSocket infrastructure initialized")
}

func (r *Runtime) buildUsageTracker() {
	r.usageTracker = storage.NewUsageTracker(r.dbStore.GetDB(), r.webSocketHub)

	if r.redisClient != nil {
		logger.Info("Initializing Redis usage buffer for async tracking...")
		usageBuffer := storage.NewRedisUsageBuffer(r.redisClient, r.dbStore.GetDB())
		r.usageTracker.SetUsageBuffer(usageBuffer)
		usageBuffer.Start(r.ctx, 60*time.Second)
		logger.Info("✅ Redis usage buffer initialized",
			zap.Duration("flush_interval", 60*time.Second),
			zap.String("benefit", "Reduces DB lock contention"),
		)
	}

	logger.Info("✅ Usage tracker initialized")
}

func (r *Runtime) buildAnalytics() {
	r.rateLimitAnalyzer = analytics.NewRateLimitAnalyzer(r.dbStore.GetDB())
	r.usageTracker.StartMetricsPublisher(r.ctx)

	if r.redisClient != nil {
		logger.Info("Initializing event queue for analytics...")
		analyticsHandler := queue.NewAnalyticsEventHandler(r.dbStore.GetDB())
		eventQueue := queue.NewRedisStreamQueue(r.redisClient, analyticsHandler.Handle)
		consumerGroup := "analytics-workers"
		consumerID := fmt.Sprintf("worker-%d", time.Now().Unix())
		if err := eventQueue.StartConsumer(r.ctx, consumerGroup, consumerID); err != nil {
			logger.Error("Failed to start event queue consumer, falling back to sync DB writes", zap.Error(err))
		} else {
			r.usageTracker.SetEventQueue(eventQueue)
			logger.Info("✅ Event queue initialized for zero-loss analytics",
				zap.String("backend", "Redis Streams"),
				zap.String("consumer_group", consumerGroup),
				zap.String("consumer_id", consumerID),
			)
		}
	} else {
		logger.Info("Event queue disabled (Redis not available) - using synchronous DB writes")
	}

	r.alertDetector = analytics.NewAlertDetector(r.dbStore.GetDB(), logger.Log, r.webSocketHub)
	logger.Info("✅ Alert detector initialized")
	r.alertDetector.SetCircuitBreakerStatsCallback(func() map[string]interface{} {
		metrics := r.proxyService.GetCircuitBreakerMetrics()
		return map[string]interface{}{"metrics": metrics}
	})
	logger.Info("✅ Circuit breaker alerts configured")
	go r.alertDetector.Start(r.ctx)
	logger.Info("✅ Alert detector started")

	healthPublisher := analytics.NewSystemHealthPublisher(r.dbStore.GetDB(), r.redisClient, r.webSocketHub, logger.Log)
	go healthPublisher.Start(r.ctx)
	logger.Info("✅ System health publisher started")

	apiMetricsPublisher := analytics.NewAPIMetricsPublisher(r.dbStore.GetDB(), r.usageTracker, r.webSocketHub, logger.Log)
	go apiMetricsPublisher.Start(r.ctx)
	logger.Info("✅ API metrics publisher started")

	r.costEstimator = analytics.NewCostEstimator(r.dbStore.GetDB())
	logger.Info("✅ Cost estimator initialized")
}

func (r *Runtime) buildWebhookWorker() {
	if !r.cfg.Webhook.Enabled {
		logger.Info("Webhook relay system disabled")
		return
	}

	logger.Info("Initializing webhook relay system...",
		zap.Int("worker_count", r.cfg.Webhook.WorkerCount),
		zap.Int("max_retries", r.cfg.Webhook.MaxRetries),
		zap.Duration("poll_interval", time.Duration(r.cfg.Webhook.PollIntervalSec)*time.Second),
	)

	webhookConfig := webhook.WebhookWorkerConfig{
		WorkerCount:         r.cfg.Webhook.WorkerCount,
		PollInterval:        time.Duration(r.cfg.Webhook.PollIntervalSec) * time.Second,
		DeliveryTimeout:     time.Duration(r.cfg.Webhook.DeliveryTimeoutSec) * time.Second,
		MaxRetries:          r.cfg.Webhook.MaxRetries,
		BaseRetryDelay:      time.Duration(r.cfg.Webhook.BaseRetryDelaySec) * time.Second,
		MaxRetryDelay:       time.Duration(r.cfg.Webhook.MaxRetryDelaySec) * time.Second,
		MaxResponseBodySize: 10 * 1024,
	}

	r.webhookWorker = webhook.NewWebhookWorker(webhookConfig, r.dbStore, r.proxyService.GetCircuitBreakerManager())
	r.webhookWorker.Start(r.ctx)
	logger.Info("✅ Webhook relay system initialized")
}

func (r *Runtime) allowedOrigins() []string {
	allowedOrigins := security.LoadAllowedOrigins("CORS_ALLOWED_ORIGINS", security.DefaultAllowedOrigins())
	return allowedOrigins
}

func (r *Runtime) allowedWebSocketOrigins() []string {
	allowedOrigins := r.allowedOrigins()
	return security.LoadAllowedOrigins("WS_ALLOWED_ORIGINS", allowedOrigins)
}

func (r *Runtime) webhookHandler() *api.WebhookHandler {
	if r.webhookWorker == nil {
		return nil
	}

	webhookConfig := webhook.WebhookWorkerConfig{
		WorkerCount:         r.cfg.Webhook.WorkerCount,
		PollInterval:        time.Duration(r.cfg.Webhook.PollIntervalSec) * time.Second,
		DeliveryTimeout:     time.Duration(r.cfg.Webhook.DeliveryTimeoutSec) * time.Second,
		MaxRetries:          r.cfg.Webhook.MaxRetries,
		BaseRetryDelay:      time.Duration(r.cfg.Webhook.BaseRetryDelaySec) * time.Second,
		MaxRetryDelay:       time.Duration(r.cfg.Webhook.MaxRetryDelaySec) * time.Second,
		MaxResponseBodySize: 10 * 1024,
	}

	return api.NewWebhookHandler(r.dbStore, r.webhookWorker, webhookConfig)
}

// Run starts the HTTP server and handles graceful shutdown.
func (r *Runtime) Run() {
	serverAddr := r.cfg.GetServerAddress()
	logger.LogServerStart(serverAddr)

	go func() {
		if err := r.app.Listen(serverAddr); err != nil {
			logger.Fatal("Server failed to start", zap.Error(err))
		}
	}()

	time.Sleep(100 * time.Millisecond)
	logger.LogServerReady(serverAddr)

	r.logEndpoints()

	quit := make(chan os.Signal, 1)
	signal.Notify(quit, os.Interrupt, syscall.SIGTERM, syscall.SIGINT)
	sig := <-quit
	logger.LogServerStop()
	logger.Info("Received shutdown signal", zap.String("signal", sig.String()))

	r.Shutdown()
}

func (r *Runtime) logEndpoints() {
	logger.Info("📋 RateGuard Endpoints:")
	logger.Info("  Health & Monitoring:",
		zap.String("liveness", "GET /health (Kubernetes liveness probe)"),
		zap.String("readiness", "GET /ready (Kubernetes readiness probe)"),
	)
	logger.Info("  Core:",
		zap.String("proxy", "POST /api/v1/proxy (requires auth)"),
	)
	logger.Info("  Dashboard:",
		zap.String("dashboard_stats", "GET /api/v1/dashboard/stats (requires auth)"),
		zap.String("usage", "GET /api/v1/dashboard/usage (requires auth)"),
	)
	logger.Info("  API Management:",
		zap.String("list_apis", "GET /api/v1/apis (requires auth)"),
		zap.String("create_api", "POST /api/v1/apis (requires auth)"),
		zap.String("get_api", "GET /api/v1/apis/:id (requires auth)"),
		zap.String("delete_api", "DELETE /api/v1/apis/:id (requires auth)"),
	)
	logger.Info("  Additional endpoints:",
		zap.String("aggregate", "POST /api/v1/aggregate"),
		zap.String("stats", "GET /api/v1/stats"),
	)
}

// Shutdown stops all runtime services in reverse startup order.
func (r *Runtime) Shutdown() {
	shutdownCtx, cancel := context.WithTimeout(context.Background(), r.cfg.GetShutdownTimeout())
	defer cancel()

	r.cancel()

	logger.Info("Shutting down HTTP server (stopping new requests)...")
	if err := r.app.ShutdownWithContext(shutdownCtx); err != nil {
		logger.Error("Error during server shutdown", zap.Error(err))
	} else {
		logger.Info("✅ HTTP server shutdown complete")
	}

	logger.Info("Shutting down proxy service (draining requests)...")
	if err := r.proxyService.Shutdown(shutdownCtx); err != nil {
		logger.Error("Error during proxy service shutdown", zap.Error(err))
	} else {
		logger.Info("✅ Proxy service shutdown complete")
	}

	logger.Info("Shutting down WebSocket services...")
	if r.webSocketHub != nil {
		r.webSocketHub.Stop()
	}
	logger.Info("✅ WebSocket services shutdown complete")

	if r.webhookWorker != nil {
		logger.Info("Shutting down webhook workers (draining pending deliveries)...")
		if err := r.webhookWorker.Stop(shutdownCtx); err != nil {
			logger.Error("Error during webhook worker shutdown", zap.Error(err))
		} else {
			logger.Info("✅ Webhook workers shutdown complete")
		}
	}

	logger.Info("Shutting down worker pool...")
	if r.workerPool != nil {
		r.workerPool.Shutdown()
	}
	logger.Info("✅ Worker pool shutdown complete")

	close(r.cleanupDone)

	if r.redisClient != nil {
		logger.Info("Closing Redis connection...")
		if err := r.redisClient.Close(); err != nil {
			logger.Error("Error closing Redis connection", zap.Error(err))
		} else {
			logger.Info("✅ Redis connection closed")
		}
	}

	logger.Info("Closing database connection...")
	if r.dbStore != nil {
		if err := r.dbStore.Close(); err != nil {
			logger.Error("Error closing database", zap.Error(err))
		} else {
			logger.Info("✅ Database connection closed")
		}
	}

	if r.telemetryMiddleware != nil {
		if err := r.telemetryMiddleware.Shutdown(shutdownCtx); err != nil {
			logger.Warn("Failed to flush telemetry exporters", zap.Error(err))
		}
	}

	logger.Info("✨ Graceful shutdown complete. Goodbye!",
		zap.Duration("shutdown_timeout", r.cfg.GetShutdownTimeout()),
	)
}
