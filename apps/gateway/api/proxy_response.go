package api

import (
	"errors"
	"fmt"
	"net/http"
	"strings"
	"time"

	"github.com/gofiber/fiber/v2"
	"github.com/varbees/rateguard/internal/models"
	"github.com/varbees/rateguard/pkg/logger"
	"go.uber.org/zap"
)

func writeForwardedHeaders(c *fiber.Ctx, headers http.Header, skipHopByHop bool, skipContentLength bool) {
	for key, values := range headers {
		if skipHopByHop && isHopByHopHeader(key) {
			continue
		}
		if skipContentLength && key == "Content-Length" {
			continue
		}
		if strings.HasPrefix(key, "X-RateGuard") {
			continue
		}

		for _, value := range values {
			c.Set(key, value)
		}
	}
}

func setProxyTrackingHeaders(c *fiber.Ctx, response *models.ProxyResponse, apiName string, includeQueue bool, skipHopByHop bool, skipContentLength bool, extraHeaders map[string]string) {
	if includeQueue && response.Queued {
		c.Set("X-RateGuard-Queued", "true")
		c.Set("X-RateGuard-Queue-Time-Ms", fmt.Sprint(response.QueueDuration.Milliseconds()))
	}

	writeForwardedHeaders(c, response.Headers, skipHopByHop, skipContentLength)
	c.Set("X-RateGuard-Request-ID", response.RequestID)
	c.Set("X-RateGuard-Duration-Ms", fmt.Sprint(response.Duration.Milliseconds()))
	if apiName != "" {
		c.Set("X-RateGuard-API", apiName)
	}

	for key, value := range extraHeaders {
		c.Set(key, value)
	}
}

func writeProxySuccessResponse(c *fiber.Ctx, response *models.ProxyResponse, apiName string, includeQueue bool, skipHopByHop bool, skipContentLength bool, extraHeaders map[string]string) error {
	c.Status(response.StatusCode)
	setProxyTrackingHeaders(c, response, apiName, includeQueue, skipHopByHop, skipContentLength, extraHeaders)

	if len(response.Body) > 0 {
		return c.Send(response.Body)
	}

	return c.SendStatus(response.StatusCode)
}

func proxyNotFoundMessage(kind, name string) string {
	return fmt.Sprintf("%s '%s' does not exist", kind, name)
}

func proxyDisabledMessage(kind, name string) string {
	return fmt.Sprintf("%s '%s' is currently disabled", kind, name)
}

func proxyValidationError(message string) ErrorResponse {
	return ErrorResponse{
		Error:     "Bad Request",
		Message:   message,
		Timestamp: time.Now(),
	}
}

func writeProxyRequestErrorResponse(
	c *fiber.Ctx,
	err error,
	response *models.ProxyResponse,
	requestID string,
	userID string,
	apiName string,
	failureLogMessage string,
	notFoundMessage string,
	disabledMessage string,
) error {
	switch {
	case errors.Is(err, models.ErrRateLimitExceeded):
		if response == nil {
			response = &models.ProxyResponse{
				RequestID:  requestID,
				StatusCode: fiber.StatusTooManyRequests,
				Error: &models.ProxyError{
					Code:    "RATE_LIMIT_EXCEEDED",
					Message: "Rate limit exceeded",
				},
				Timestamp: time.Now(),
			}
		}
		return c.Status(fiber.StatusTooManyRequests).JSON(response)
	case errors.Is(err, models.ErrAPINotFound):
		return c.Status(fiber.StatusNotFound).JSON(proxyValidationError(notFoundMessage))
	case errors.Is(err, models.ErrAPIDisabled):
		return c.Status(fiber.StatusForbidden).JSON(proxyValidationError(disabledMessage))
	}

	logger.Error(failureLogMessage,
		zap.String("request_id", requestID),
		zap.String("user_id", userID),
		zap.String("api_name", apiName),
		zap.Error(err),
	)

	return c.Status(fiber.StatusBadGateway).JSON(proxyErrResponseFromModels(requestID, err))
}

func proxyErrResponseFromModels(requestID string, err error) ErrorResponse {
	return ErrorResponse{
		Error:     "Proxy failed",
		Message:   err.Error(),
		RequestID: requestID,
		Timestamp: time.Now(),
	}
}
