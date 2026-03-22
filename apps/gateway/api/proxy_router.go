package api

import (
	"strings"

	"github.com/gofiber/fiber/v2"
	"github.com/google/uuid"
	"github.com/varbees/rateguard/pkg/logger"
	"go.uber.org/zap"
)

// IntelligentProxyRouter handles /p/:firstSegment/* and routes to template or user proxy
// This is the entry point that distinguishes between:
// - Template URLs: /p/openai/v1/chat/completions
// - User URLs: /p/johndoe/my-project/v1/endpoint
func (h *ProxyHandler) IntelligentProxyRouter(c *fiber.Ctx) error {
	requestID := uuid.New().String()
	c.Locals("request_id", requestID)
	
	firstSegment := c.Params("firstSegment")
	remainingPath := c.Params("*")
	
	logger.Debug("Intelligent proxy router",
		zap.String("request_id", requestID),
		zap.String("first_segment", firstSegment),
		zap.String("remaining_path", remainingPath),
		zap.String("full_path", c.Path()),
	)
	
	// Normalize first segment to lowercase
	firstSegment = strings.ToLower(strings.TrimSpace(firstSegment))
	
	// PRIORITY 1: Check if it's a marketplace template provider
	// This takes precedence to ensure templates work even if user has same handle
	template, err := h.store.GetAPITemplateByProvider(c.Context(), firstSegment)
	if err == nil && template != nil {
		logger.Debug("Routing to template proxy",
			zap.String("provider", firstSegment),
			zap.String("request_id", requestID),
		)
		// Set provider param for template handler
		c.Params("provider", firstSegment)
		return h.HandleTemplateProxy(c)
	}
	
	// PRIORITY 2: Check if it's a reserved system handle
	// Prevents users from creating handles that conflict with system routes
	reserved, err := h.store.IsReservedHandle(c.Context(), firstSegment)
	if err == nil && reserved {
		logger.Warn("Attempted access to reserved handle",
			zap.String("handle", firstSegment),
			zap.String("request_id", requestID),
		)
		return c.Status(fiber.StatusNotFound).JSON(fiber.Map{
			"error":   "Not found",
			"message": "This is a reserved system path",
			"hint":    "Visit /marketplace for available templates",
		})
	}
	
	// PRIORITY 3: Check if it's a user handle
	// Format must be: /p/:username/:projectslug/*
	// Split remaining path to extract projectslug
	parts := strings.SplitN(remainingPath, "/", 2)
	if len(parts) < 1 || parts[0] == "" {
		// No project slug provided - invalid URL
		return c.Status(fiber.StatusBadRequest).JSON(fiber.Map{
			"error":   "Invalid URL format",
			"message": "User API URLs require format: /p/:username/:projectslug/*",
			"example": "/p/johndoe/my-project/v1/endpoint",
			"hint":    "For templates, use: /p/:provider/* (e.g., /p/openai/v1/chat)",
		})
	}
	
	projectSlug := parts[0]
	endpoint := ""
	if len(parts) > 1 {
		endpoint = parts[1]
	}
	
	// Check if user exists
	user, err := h.store.GetUserByHandle(c.Context(), firstSegment)
	if err != nil || user == nil {
		logger.Debug("User handle not found",
			zap.String("handle", firstSegment),
			zap.String("request_id", requestID),
		)
		return c.Status(fiber.StatusNotFound).JSON(fiber.Map{
			"error":   "Not found",
			"handle":  firstSegment,
			"message": "No template or user found with this identifier",
			"hint":    "Check /marketplace for available templates or verify the username",
		})
	}
	
	// Route to user proxy handler
	logger.Debug("Routing to user proxy",
		zap.String("username", firstSegment),
		zap.String("project_slug", projectSlug),
		zap.String("request_id", requestID),
	)
	
	// Set params for user handler
	c.Params("username", firstSegment)
	c.Params("projectslug", projectSlug)
	c.Params("*", endpoint)
	
	return h.HandleUserProxy(c)
}
