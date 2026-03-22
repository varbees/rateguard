package httpadapter

import (
	"fmt"
	"net/http"

	"github.com/varbees/rateguard/pkg/logger"
	"go.uber.org/zap"
)

// CircuitBreakerCaller matches the circuit breaker contract used by the proxy layer.
type CircuitBreakerCaller interface {
	Call(func() error) error
}

// ExecuteWithCircuitBreakerAndRetry runs the request through the provided
// circuit breaker and applies retry/backoff policy from the adapter layer.
func ExecuteWithCircuitBreakerAndRetry(
	breaker CircuitBreakerCaller,
	client Doer,
	req *http.Request,
	maxRetries int,
	userID, apiName string,
) (*http.Response, error) {
	var resp *http.Response
	var lastErr error

	err := breaker.Call(func() error {
		var retryErr error
		resp, retryErr = DoWithRetryAndBackoff(client, req, maxRetries, userID, apiName)
		lastErr = retryErr

		if retryErr != nil {
			return retryErr
		}

		if resp != nil && resp.StatusCode >= 500 {
			return fmt.Errorf("upstream API returned %d", resp.StatusCode)
		}

		return nil
	})

	if err != nil {
		if resp == nil && lastErr != nil {
			logger.Debug("Upstream execution failed before response was available",
				zap.String("user_id", userID),
				zap.String("api_name", apiName),
				zap.Error(lastErr),
			)
		}
		return resp, err
	}

	return resp, nil
}
