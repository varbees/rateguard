package httpadapter

import (
	"fmt"
	"net/http"
	"strconv"
	"time"

	"github.com/varbees/rateguard/pkg/logger"
	"go.uber.org/zap"
)

// Doer matches the subset of http.Client used by the retry helper.
type Doer interface {
	Do(req *http.Request) (*http.Response, error)
}

// DoWithRetryAndBackoff executes the request with retry semantics on transient
// transport errors and 429 responses.
func DoWithRetryAndBackoff(client Doer, req *http.Request, maxRetries int, userID, apiName string) (*http.Response, error) {
	var resp *http.Response
	var err error

	for attempt := 0; attempt <= maxRetries; attempt++ {
		resp, err = client.Do(req)
		if err != nil {
			if attempt < maxRetries {
				backoff := time.Duration(attempt+1) * time.Second
				logger.Warn("Request failed, retrying",
					zap.Int("attempt", attempt+1),
					zap.Duration("backoff", backoff),
					zap.Error(err),
				)
				time.Sleep(backoff)
				continue
			}
			return nil, err
		}

		if resp.StatusCode == http.StatusTooManyRequests {
			retryAfter := resp.Header.Get("Retry-After")
			var waitDuration time.Duration

			if retryAfter != "" {
				if seconds, err := strconv.Atoi(retryAfter); err == nil {
					waitDuration = time.Duration(seconds) * time.Second
				} else if retryTime, err := http.ParseTime(retryAfter); err == nil {
					waitDuration = time.Until(retryTime)
				}
			}

			if waitDuration == 0 || waitDuration > 30*time.Second {
				waitDuration = time.Duration(attempt+1) * 2 * time.Second
			}

			if attempt < maxRetries {
				logger.Warn("Target API rate limit hit, backing off",
					zap.String("user_id", userID),
					zap.String("api_name", apiName),
					zap.Int("attempt", attempt+1),
					zap.Duration("backoff", waitDuration),
				)

				resp.Body.Close()
				time.Sleep(waitDuration)
				continue
			}

			logger.Error("Target API rate limit exceeded after all retries",
				zap.String("user_id", userID),
				zap.String("api_name", apiName),
			)
			return resp, nil
		}

		return resp, nil
	}

	return resp, fmt.Errorf("retry loop exited unexpectedly")
}
