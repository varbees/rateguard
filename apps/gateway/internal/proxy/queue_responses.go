package proxy

import (
	"fmt"
	"net/http"
	"time"

	"github.com/varbees/rateguard/internal/models"
)

func buildQueueLimitReachedResponse(req *models.ProxyRequest, startTime time.Time, message string) *models.ProxyResponse {
	headers := http.Header{}
	headers.Set("Content-Type", "application/json")
	headers.Set("X-RateGuard-Limit-Type", "preset")
	headers.Set("X-RateGuard-Remaining", "0")
	headers.Set("X-RateGuard-Preset-Limit", fmt.Sprintf("%d", 0))

	return &models.ProxyResponse{
		RequestID:  req.ID,
		Timestamp:  startTime,
		StatusCode: http.StatusTooManyRequests,
		Headers:    headers,
		Body: []byte(fmt.Sprintf(`{
			"error": "Request limit reached",
			"message": "%s",
			"docs_url": "/docs/guides/rate-limiting"
		}`, message)),
		Duration: time.Since(startTime),
	}
}

func buildQueueCapacityExceededResponse(req *models.ProxyRequest, startTime time.Time, limit int, apiName string) *models.ProxyResponse {
	headers := http.Header{}
	headers.Set("Content-Type", "application/json")
	headers.Set("X-RateGuard-Limit-Type", "queue")
	headers.Set("X-RateGuard-Queue-Max-Length", fmt.Sprintf("%d", limit))

	return &models.ProxyResponse{
		RequestID:  req.ID,
		Timestamp:  startTime,
		StatusCode: http.StatusTooManyRequests,
		Headers:    headers,
		Body: []byte(fmt.Sprintf(`{
			"error": "Queue capacity reached",
			"message": "Queue is full for %s",
			"docs_url": "/docs/guides/queue-management"
		}`, apiName)),
		Duration: time.Since(startTime),
	}
}

func buildQueueTimeoutResponse(req *models.ProxyRequest, startTime time.Time, waited, maxWaitTime time.Duration, limitType string) *models.ProxyResponse {
	return &models.ProxyResponse{
		RequestID:  req.ID,
		Timestamp:  startTime,
		StatusCode: http.StatusServiceUnavailable,
		Body: []byte(fmt.Sprintf(`{
			"error": "Queue timeout",
			"message": "Request queued too long due to %s rate limit",
			"details": "Waited %v, max %v"
		}`, limitType, waited, maxWaitTime)),
		Error: &models.ProxyError{
			Code:    "QUEUE_TIMEOUT",
			Message: fmt.Sprintf("Request queued too long due to %s rate limit", limitType),
			Details: fmt.Sprintf("Waited %v, max %v", waited, maxWaitTime),
		},
		Duration: time.Since(startTime),
	}
}
