package proxy

import (
	"errors"
	"net/http"
	"time"

	"github.com/varbees/rateguard/internal/models"
)

func buildProxyExecutionErrorResponse(
	requestID string,
	timestamp time.Time,
	duration time.Duration,
	statusCode int,
	code string,
	message string,
	details string,
) *models.ProxyResponse {
	return &models.ProxyResponse{
		RequestID:  requestID,
		Timestamp:  timestamp,
		StatusCode: statusCode,
		Duration:   duration,
		Error: &models.ProxyError{
			Code:    code,
			Message: message,
			Details: details,
		},
	}
}

func buildProxyCircuitOpenResponse(requestID string, timestamp time.Time, duration time.Duration, err error) *models.ProxyResponse {
	return buildProxyExecutionErrorResponse(
		requestID,
		timestamp,
		duration,
		http.StatusServiceUnavailable,
		"CIRCUIT_OPEN",
		"Service unavailable (circuit breaker open)",
		err.Error(),
	)
}

func buildProxyRequestFailureResponse(requestID string, timestamp time.Time, duration time.Duration, err error) *models.ProxyResponse {
	statusCode := http.StatusBadGateway
	if errors.Is(err, ErrCircuitOpen) {
		statusCode = http.StatusServiceUnavailable
	}

	return buildProxyExecutionErrorResponse(
		requestID,
		timestamp,
		duration,
		statusCode,
		"REQUEST_FAILED",
		"Failed to execute proxied request",
		err.Error(),
	)
}

func buildProxyStreamingResponse(
	base *models.ProxyResponse,
	statusCode int,
	headers http.Header,
	duration time.Duration,
	streamType string,
) *models.ProxyResponse {
	base.StatusCode = statusCode
	base.Headers = headers
	base.Duration = duration
	base.IsStreaming = true
	base.StreamingType = streamType
	return base
}

func buildProxyBufferedResponse(
	base *models.ProxyResponse,
	statusCode int,
	headers http.Header,
	body []byte,
	duration time.Duration,
) *models.ProxyResponse {
	base.StatusCode = statusCode
	base.Headers = headers
	base.Body = body
	base.Duration = duration
	return base
}
