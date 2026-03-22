package api

import (
	"github.com/varbees/rateguard/internal/openapi"
	"strings"
	"time"

	"github.com/gofiber/fiber/v2"
	"github.com/gofiber/fiber/v2/middleware/recover"
	"github.com/gofiber/fiber/v2/middleware/requestid"
	"github.com/varbees/rateguard/api/middleware"
	"github.com/varbees/rateguard/pkg/logger"
	"go.uber.org/zap"
)

// SetupRoutes configures all HTTP routes for RateGuard
func SetupRoutes(
	app *fiber.App,
	handler *Handler,
	proxyHandler *ProxyHandler,
	dashboardHandler *DashboardHandler,
	authHandler *AuthHandler,
	settingsHandler *SettingsHandler,
	apiKeysHandler *APIKeysHandler, // NEW: API keys handler
	queueHandler *QueueHandler,
	rateLimitSuggestionHandler *RateLimitSuggestionHandler,
	guardrailHandler *GuardrailHandler,
	authMiddleware *middleware.AuthMiddleware,
	idempotencyMiddleware *middleware.IdempotencyMiddleware,
	meteringMiddleware *middleware.MeteringMiddleware,
	telemetryMiddleware *middleware.TelemetryMiddleware,
	corsMiddleware *middleware.CORSMiddleware,
	globalRateLimitMiddleware *middleware.GlobalRateLimitMiddleware, // NEW: Global rate limit
	selfProtectionMiddleware fiber.Handler,
	healthHandler *HealthHandler,
	webhookHandler *WebhookHandler,
	webSocketHandler *WebSocketHandler,
	metricsHandler *MetricsHandler, // NEW: Metrics handler
) {
	// Global middleware
	app.Use(recover.New(recover.Config{
		EnableStackTrace: true,
	}))

	app.Use(requestid.New())

	// Custom logging middleware
	app.Use(loggingMiddleware)

	if telemetryMiddleware != nil {
		app.Use(telemetryMiddleware.Trace)
	}

	// Global Rate Limiting (before CORS/Auth)
	app.Use(func(c *fiber.Ctx) error {
		if strings.HasPrefix(c.Path(), "/api/v1/") {
			return c.Next()
		}
		if globalRateLimitMiddleware == nil {
			return c.Next()
		}
		return globalRateLimitMiddleware.Limit(c)
	})

	// Global CORS for non-proxy routes (auth, dashboard, health)
	// Note: Per-API CORS is applied to proxy routes after authentication
	app.Use(func(c *fiber.Ctx) error {
		origin := c.Get("Origin")
		if origin != "" && !strings.HasPrefix(c.Path(), "/proxy/") {
			if !corsMiddleware.IsAllowedOrigin(origin) {
				return c.Status(fiber.StatusForbidden).JSON(fiber.Map{
					"error":   "Forbidden",
					"message": "Origin not allowed by CORS policy",
				})
			}

			c.Set("Access-Control-Allow-Origin", origin)
			c.Set("Access-Control-Allow-Methods", "GET,POST,PUT,PATCH,DELETE,OPTIONS")
			c.Set("Access-Control-Allow-Headers", corsMiddleware.AllowedHeaders())
			c.Set("Access-Control-Allow-Credentials", "true")
			c.Set("Access-Control-Max-Age", "3600")

			if c.Method() == "OPTIONS" {
				return c.SendStatus(fiber.StatusNoContent)
			}
		}
		return c.Next()
	})

	// Health check endpoints (no prefix, no auth)
	// /health - Kubernetes liveness probe (always returns 200 if service is running)
	// /ready - Kubernetes readiness probe (checks dependencies: DB, Redis)
	app.Get("/health", healthHandler.Health)
	app.Get("/ready", healthHandler.Ready)

	// Prometheus metrics endpoint
	if metricsHandler != nil {
		app.Get("/metrics", metricsHandler.GetMetrics())
		app.Get("/metrics/keda", metricsHandler.GetKEDAMetrics())
	}

	app.Get("/", func(c *fiber.Ctx) error {
		return c.JSON(fiber.Map{
			"service": "RateGuard API Rate Limit Manager",
			"version": "2.0.0",
			"status":  "running",
			"docs":    "/api/v1/docs",
		})
	})

	// WebSocket endpoint (no auth middleware, handles auth internally)
	app.Get("/ws", webSocketHandler.HandleWebSocket)

	// API v1 routes
	v1 := app.Group("/api/v1")
	{
		if selfProtectionMiddleware != nil {
			v1.Use(selfProtectionMiddleware)
		}

		v1.Get("/openapi.json", func(c *fiber.Ctx) error {
			doc, err := openapi.JSON()
			if err != nil {
				return c.Status(fiber.StatusInternalServerError).JSON(fiber.Map{
					"error":   "failed to generate openapi document",
					"message": err.Error(),
				})
			}
			c.Type("json")
			return c.Send(doc)
		})

		// Authentication endpoints
		auth := v1.Group("/auth")
		{
			// Public endpoints (no auth required)
			auth.Post("/signup", authHandler.SignUp)
			auth.Post("/login", authHandler.Login)
			auth.Post("/refresh", authHandler.RefreshToken) // JWT token refresh
			auth.Post("/logout", authHandler.Logout)        // Clear auth cookies
			auth.Post("/request-reset", authHandler.RequestPasswordReset)
			auth.Post("/reset-password", authHandler.ResetPassword)
			auth.Get("/verify", authHandler.VerifyEmail)
			auth.Post("/resend-verification", authHandler.ResendVerificationEmail)
			auth.Get("/geo", authHandler.DetectGeo) // Public geo detection
			auth.Post("/handle/check", authHandler.CheckHandleAvailability)

			// Protected endpoints (auth required)
			auth.Get("/me", authMiddleware.Authenticate, authHandler.GetCurrentUser) // Get current user
			auth.Put("/handle", authMiddleware.Authenticate, authHandler.UpdateHandle)
		}

		// Aggregation endpoints
		v1.Post("/aggregate", idempotencyMiddleware.Enforce, handler.AggregateHandler)
		v1.Get("/stats", handler.StatsHandler)
		v1.Post("/stats/reset", idempotencyMiddleware.Enforce, handler.ResetStatsHandler)

		// Proxy endpoints (require authentication)
		proxy := v1.Group("/proxy")
		proxy.Use(authMiddleware.Authenticate)
		proxy.Use(meteringMiddleware.CheckPresetLimits)
		proxy.Use(meteringMiddleware.TrackUsage)
		{
			// Aggregation endpoint (with api_name in body)
			proxy.Post("/", idempotencyMiddleware.Enforce, proxyHandler.HandleProxyRequest)
			proxy.Get("/stats", proxyHandler.GetProxyStats)

			// Circuit breaker monitoring
			proxy.Get("/circuit-breakers/stats", proxyHandler.GetCircuitBreakerStats)
			proxy.Get("/circuit-breakers/metrics", proxyHandler.GetCircuitBreakerMetrics)
			proxy.Post("/circuit-breakers/:api_id/reset", idempotencyMiddleware.Enforce, proxyHandler.ResetCircuitBreaker)
		}

		// Dashboard endpoints (require authentication)
		dashboard := v1.Group("/dashboard")
		dashboard.Use(authMiddleware.Authenticate)
		{
			dashboard.Get("/stats", dashboardHandler.GetDashboardStats)
			dashboard.Get("/usage", dashboardHandler.GetUsageStats)
			dashboard.Get("/usage/history", dashboardHandler.GetUsageHistory)     // NEW: Usage history endpoint
			dashboard.Get("/requests/recent", dashboardHandler.GetRecentRequests) // NEW: Recent requests endpoint
			dashboard.Get("/alerts", dashboardHandler.GetAlerts)
			dashboard.Get("/costs", dashboardHandler.GetCostEstimate)

			// Settings endpoints
			dashboard.Get("/settings", settingsHandler.GetSettings)
			dashboard.Put("/settings", idempotencyMiddleware.Enforce, settingsHandler.UpdateSettings)
			dashboard.Post("/settings/password", idempotencyMiddleware.Enforce, settingsHandler.ChangePassword)

			// Streaming analytics endpoints
			dashboard.Get("/stats/streaming", dashboardHandler.GetStreamingStats)
			dashboard.Get("/streaming/history", dashboardHandler.GetStreamingHistory)
			dashboard.Get("/streaming/by-api", dashboardHandler.GetStreamingByAPI)

			// Queue management endpoints
			dashboard.Get("/queues", queueHandler.GetQueueStats)
			dashboard.Get("/queues/active", queueHandler.GetActiveQueues)
			dashboard.Get("/queues/config", queueHandler.GetQueueConfig)
			dashboard.Put("/queues/config", idempotencyMiddleware.Enforce, queueHandler.UpdateQueueConfig)
			dashboard.Delete("/queues/:request_id", idempotencyMiddleware.Enforce, queueHandler.CancelQueuedRequest)

			// API key management
			dashboard.Post("/api-key/regenerate", idempotencyMiddleware.Enforce, settingsHandler.RegenerateAPIKey)
		}

		// API Keys endpoints (NEW - multiple keys)
		apiKeys := v1.Group("/api-keys")
		apiKeys.Use(authMiddleware.Authenticate)
		{
			apiKeys.Get("/", apiKeysHandler.ListAPIKeys)                                       // List all keys
			apiKeys.Post("/", idempotencyMiddleware.Enforce, apiKeysHandler.CreateAPIKey)      // Create new key
			apiKeys.Delete("/:id", idempotencyMiddleware.Enforce, apiKeysHandler.RevokeAPIKey) // Revoke key
		}

		// API Configuration endpoints (require authentication)
		apis := v1.Group("/apis")
		apis.Use(authMiddleware.Authenticate)
		{
			apis.Post("/", idempotencyMiddleware.Enforce, dashboardHandler.CreateAPIConfig)
			apis.Get("/", dashboardHandler.ListAPIConfigs)
			apis.Get("/:id", dashboardHandler.GetAPIConfig)
			apis.Put("/:id", idempotencyMiddleware.Enforce, dashboardHandler.UpdateAPIConfig)
			apis.Delete("/:id", idempotencyMiddleware.Enforce, dashboardHandler.DeleteAPIConfig)

			// Test connection endpoint (must be before :id to avoid route conflict)
			apis.Post("/test-connection", idempotencyMiddleware.Enforce, dashboardHandler.TestConnection)

			// Per-API metrics endpoint
			apis.Get("/:id/metrics", dashboardHandler.GetAPIMetrics)

			// Rate limit discovery endpoints
			apis.Get("/:id/rate-limit/suggestions", rateLimitSuggestionHandler.GetSuggestions)
			apis.Get("/:id/rate-limit/observations", rateLimitSuggestionHandler.GetObservations)
			apis.Post("/:id/rate-limit/apply", idempotencyMiddleware.Enforce, rateLimitSuggestionHandler.ApplySuggestion)
		}

		// Webhook relay endpoints
		if webhookHandler != nil {
			webhook := v1.Group("/webhook")
			{
				webhook.Post("/inbox", authMiddleware.Authenticate, idempotencyMiddleware.Enforce, webhookHandler.HandleWebhookInbox)
				webhook.Get("/status", authMiddleware.Authenticate, webhookHandler.GetWebhookStatus)
				webhook.Get("/events/:id", authMiddleware.Authenticate, webhookHandler.GetWebhookEvent)
				webhook.Post("/events/:id/replay", authMiddleware.Authenticate, idempotencyMiddleware.Enforce, webhookHandler.ReplayWebhook)
			}
		}

		// Realtime event endpoints
		if webSocketHandler != nil {
			events := v1.Group("/events")
			events.Use(authMiddleware.Authenticate)
			{
				events.Get("/stream", webSocketHandler.StreamEvents)
				events.Get("/replay", webSocketHandler.ReplayEvents)
			}
		}

		// WebSocket test endpoint (Phase 1 verification)
		if webSocketHandler != nil {
			test := v1.Group("/test")
			test.Use(authMiddleware.Authenticate)
			{
				test.Post("/broadcast", idempotencyMiddleware.Enforce, webSocketHandler.TestBroadcast)
			}
		}

		// Cost guardrail endpoints.
		guardrails := v1.Group("/guardrails")
		guardrails.Use(authMiddleware.Authenticate)
		{
			guardrails.Post("/config", idempotencyMiddleware.Enforce, guardrailHandler.CreateOrUpdateGuardrailConfig)
			guardrails.Get("/config", guardrailHandler.GetGuardrailConfig)
			guardrails.Delete("/config", idempotencyMiddleware.Enforce, guardrailHandler.DeleteGuardrailConfig)
			guardrails.Get("/alerts", guardrailHandler.GetGuardrailAlerts)
			guardrails.Post("/alerts/:id/ack", guardrailHandler.AcknowledgeAlert)
			guardrails.Get("/optimizations", guardrailHandler.GetOptimizations)
		}

	}

	// =============================================================================
	// NEW: Intelligent Proxy Routes - /p/:firstSegment/*
	// Supports both marketplace templates and user-specific API configs
	// =============================================================================
	// Priority-based routing:
	//   1. /p/:provider/* → Template (e.g., /p/openai/v1/chat/completions)
	//   2. /p/:username/:projectslug/* → User config (e.g., /p/johndoe/my-project/v1/endpoint)
	intelligentProxy := app.Group("/p")
	intelligentProxy.Use(authMiddleware.Authenticate)          // Require authentication
	intelligentProxy.Use(corsMiddleware.Handle)                // Per-API CORS
	intelligentProxy.Use(meteringMiddleware.CheckPresetLimits) // Rate limiting
	intelligentProxy.Use(meteringMiddleware.TrackUsage)        // Usage tracking
	{
		// Match any HTTP method and any path under /p/:firstSegment
		intelligentProxy.All("/:firstSegment/*", proxyHandler.IntelligentProxyRouter)
		intelligentProxy.All("/:firstSegment", proxyHandler.IntelligentProxyRouter)
	}

	// =============================================================================
	// Transparent proxy routes - /proxy/:api_name/* forwards to configured API
	// =============================================================================
	// This allows users to call RateGuard as: https://rateguard.com/proxy/stripe_prod/v1/customers
	// And it forwards to: https://api.stripe.com/v1/customers
	transparentProxy := app.Group("/proxy")
	transparentProxy.Use(authMiddleware.Authenticate)
	transparentProxy.Use(corsMiddleware.Handle) // Per-API CORS after authentication
	transparentProxy.Use(meteringMiddleware.CheckPresetLimits)
	transparentProxy.Use(meteringMiddleware.TrackUsage)
	{
		// Match any HTTP method and any path under /proxy/:api_name
		transparentProxy.All("/:api_name/*", proxyHandler.HandleTransparentProxy)
		transparentProxy.All("/:api_name", proxyHandler.HandleTransparentProxy)
	}
}

// loggingMiddleware logs all HTTP requests with beautiful formatting
func loggingMiddleware(c *fiber.Ctx) error {
	start := time.Now()

	// Get or generate request ID
	requestID := c.Locals("requestid")
	if requestID == nil {
		requestID = c.Get("X-Request-ID", "unknown")
	}

	// Log incoming request
	logger.Debug("🔵 Incoming request",
		zap.String("request_id", requestID.(string)),
		zap.String("method", c.Method()),
		zap.String("path", c.Path()),
		zap.String("ip", c.IP()),
		zap.String("user_agent", c.Get("User-Agent")),
	)

	// Process request
	err := c.Next()

	// Calculate duration
	duration := time.Since(start)

	// Log response
	statusCode := c.Response().StatusCode()
	logLevel := getLogLevelForStatus(statusCode)

	switch logLevel {
	case "error":
		logger.Error("🔴 Request completed with error",
			zap.String("request_id", requestID.(string)),
			zap.String("method", c.Method()),
			zap.String("path", c.Path()),
			zap.Int("status", statusCode),
			zap.Duration("duration", duration),
		)
	case "warn":
		logger.Warn("🟡 Request completed with warning",
			zap.String("request_id", requestID.(string)),
			zap.String("method", c.Method()),
			zap.String("path", c.Path()),
			zap.Int("status", statusCode),
			zap.Duration("duration", duration),
		)
	default:
		logger.Info("🟢 Request completed successfully",
			zap.String("request_id", requestID.(string)),
			zap.String("method", c.Method()),
			zap.String("path", c.Path()),
			zap.Int("status", statusCode),
			zap.Duration("duration", duration),
		)
	}

	return err
}

// getLogLevelForStatus returns appropriate log level based on status code
func getLogLevelForStatus(statusCode int) string {
	switch {
	case statusCode >= 500:
		return "error"
	case statusCode >= 400:
		return "warn"
	default:
		return "info"
	}
}
