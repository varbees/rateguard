package middleware

import (
	"strings"

	"github.com/gofiber/fiber/v2"
	"github.com/varbees/rateguard/internal/security"
	"github.com/varbees/rateguard/internal/storage"
	"github.com/varbees/rateguard/pkg/logger"
	"go.uber.org/zap"
)

// CORSMiddleware provides per-API CORS whitelisting
type CORSMiddleware struct {
	store          *storage.PostgresStore
	allowedOrigins []string
}

// NewCORSMiddleware creates a new CORS middleware instance
func NewCORSMiddleware(store *storage.PostgresStore, allowedOrigins []string) *CORSMiddleware {
	if len(allowedOrigins) == 0 {
		allowedOrigins = security.DefaultAllowedOrigins()
	}

	return &CORSMiddleware{
		store:          store,
		allowedOrigins: allowedOrigins,
	}
}

// IsAllowedOrigin checks whether a browser origin is allowed for public routes.
func (m *CORSMiddleware) IsAllowedOrigin(origin string) bool {
	return security.OriginAllowed(m.allowedOrigins, origin)
}

// Handle checks per-API CORS settings and sets appropriate headers
func (m *CORSMiddleware) Handle(c *fiber.Ctx) error {
	origin := c.Get("Origin")

	// If no origin header, skip CORS (same-origin or non-browser request)
	if origin == "" {
		return c.Next()
	}

	// Check if this is a proxy request that needs per-API CORS check
	path := c.Path()
	apiName := ""

	// Extract API name from transparent proxy route: /proxy/:api_name/*
	if strings.HasPrefix(path, "/proxy/") {
		parts := strings.Split(strings.TrimPrefix(path, "/proxy/"), "/")
		if len(parts) > 0 && parts[0] != "" {
			apiName = parts[0]
		}
	}

	// If we have an API name, check per-API CORS
	if apiName != "" {
		allowed := m.checkAPIOrigin(c, apiName, origin)
		if !allowed {
			logger.Warn("CORS: Origin not allowed for API",
				zap.String("api_name", apiName),
				zap.String("origin", origin),
			)
			return c.Status(fiber.StatusForbidden).JSON(fiber.Map{
				"error":   "Forbidden",
				"message": "Origin not allowed by CORS policy",
			})
		}

		// Set CORS headers for allowed origin
		m.setCORSHeaders(c, origin)
		logger.Debug("CORS: Origin allowed for API",
			zap.String("api_name", apiName),
			zap.String("origin", origin),
		)
	}

	// Handle preflight OPTIONS requests
	if c.Method() == "OPTIONS" {
		return c.SendStatus(fiber.StatusNoContent)
	}

	return c.Next()
}

// checkAPIOrigin checks if the origin is allowed for the given API
func (m *CORSMiddleware) checkAPIOrigin(c *fiber.Ctx, apiName, origin string) bool {
	// Get user from context (set by auth middleware)
	user, err := GetUserFromContext(c)
	if err != nil {
		// If no user, deny (auth middleware should have caught this)
		return false
	}

	// Look up API config
	apiConfig, err := m.store.GetAPIConfigByName(c.Context(), apiName, user.ID)
	if err != nil {
		logger.Warn("CORS: Failed to get API config",
			zap.String("api_name", apiName),
			zap.Error(err),
		)
		return false
	}

	// If no allowed origins configured, deny (secure by default)
	if len(apiConfig.AllowedOrigins) == 0 {
		logger.Debug("CORS: No origins configured for API (denying)",
			zap.String("api_name", apiName),
		)
		return false
	}

	return security.OriginAllowed(apiConfig.AllowedOrigins, origin)
}

// setCORSHeaders sets CORS headers for the response
func (m *CORSMiddleware) setCORSHeaders(c *fiber.Ctx, origin string) {
	c.Set("Access-Control-Allow-Origin", origin)
	c.Set("Access-Control-Allow-Methods", "GET,POST,PUT,PATCH,DELETE,OPTIONS")
	c.Set("Access-Control-Allow-Headers", "Origin,Content-Type,Accept,Authorization,X-API-Key")
	c.Set("Access-Control-Expose-Headers", "X-RateGuard-Request-ID,X-RateGuard-Duration-Ms,X-RateGuard-Preset,X-RateGuard-Limit,X-RateGuard-Usage,X-RateGuard-Remaining")
	c.Set("Access-Control-Allow-Credentials", "true")
	c.Set("Access-Control-Max-Age", "3600")
}
