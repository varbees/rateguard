package client

import (
	"bytes"
	"context"
	"encoding/json"
	"fmt"
	"io"
	"net/http"
	"time"

	"github.com/varbees/rateguard/pkg/logger"
	"go.uber.org/zap"
)

// HTTPClient is an enhanced HTTP client with retry logic and logging
type HTTPClient struct {
	client      *http.Client
	maxRetries  int
	retryDelay  time.Duration
	enableLogs  bool
}

// Config holds HTTP client configuration
type Config struct {
	Timeout         time.Duration
	MaxRetries      int
	RetryDelay      time.Duration
	MaxIdleConns    int
	IdleConnTimeout time.Duration
	EnableLogs      bool
}

// New creates a new HTTP client with sensible defaults
func New(cfg Config) *HTTPClient {
	if cfg.Timeout == 0 {
		cfg.Timeout = 30 * time.Second
	}
	if cfg.MaxRetries == 0 {
		cfg.MaxRetries = 3
	}
	if cfg.RetryDelay == 0 {
		cfg.RetryDelay = 1 * time.Second
	}
	if cfg.MaxIdleConns == 0 {
		cfg.MaxIdleConns = 100
	}
	if cfg.IdleConnTimeout == 0 {
		cfg.IdleConnTimeout = 90 * time.Second
	}

	return &HTTPClient{
		client: &http.Client{
			Timeout: cfg.Timeout,
			Transport: &http.Transport{
				MaxIdleConns:        cfg.MaxIdleConns,
				MaxIdleConnsPerHost: 10,
				IdleConnTimeout:     cfg.IdleConnTimeout,
				DisableCompression:  false,
			},
		},
		maxRetries: cfg.MaxRetries,
		retryDelay: cfg.RetryDelay,
		enableLogs: cfg.EnableLogs,
	}
}

// Request represents an HTTP request with all necessary fields
type Request struct {
	Method  string
	URL     string
	Headers map[string]string
	Body    interface{}
	Timeout time.Duration
}

// Response represents an HTTP response with parsed data
type Response struct {
	StatusCode int
	Body       []byte
	Headers    http.Header
	Duration   time.Duration
}

// Do executes an HTTP request with retry logic
func (c *HTTPClient) Do(ctx context.Context, req Request) (*Response, error) {
	var lastErr error
	
	for attempt := 0; attempt <= c.maxRetries; attempt++ {
		if attempt > 0 {
			// Wait before retry with exponential backoff
			delay := c.retryDelay * time.Duration(attempt)
			
			if c.enableLogs {
				logger.Debug("Retrying request",
					zap.String("url", req.URL),
					zap.Int("attempt", attempt),
					zap.Duration("delay", delay),
				)
			}
			
			select {
			case <-time.After(delay):
			case <-ctx.Done():
				return nil, ctx.Err()
			}
		}

		resp, err := c.doRequest(ctx, req)
		if err == nil && !shouldRetry(resp.StatusCode) {
			return resp, nil
		}

		lastErr = err
		if err != nil && c.enableLogs {
			logger.Warn("Request failed",
				zap.String("url", req.URL),
				zap.Int("attempt", attempt),
				zap.Error(err),
			)
		}
	}

	return nil, fmt.Errorf("request failed after %d retries: %w", c.maxRetries, lastErr)
}

// doRequest performs a single HTTP request
func (c *HTTPClient) doRequest(ctx context.Context, req Request) (*Response, error) {
	start := time.Now()

	// Prepare request body
	var bodyReader io.Reader
	if req.Body != nil {
		jsonData, err := json.Marshal(req.Body)
		if err != nil {
			return nil, fmt.Errorf("failed to marshal request body: %w", err)
		}
		bodyReader = bytes.NewReader(jsonData)
	}

	// Create HTTP request
	httpReq, err := http.NewRequestWithContext(ctx, req.Method, req.URL, bodyReader)
	if err != nil {
		return nil, fmt.Errorf("failed to create request: %w", err)
	}

	// Set headers
	for key, value := range req.Headers {
		httpReq.Header.Set(key, value)
	}

	// Set default Content-Type if body is present
	if req.Body != nil && httpReq.Header.Get("Content-Type") == "" {
		httpReq.Header.Set("Content-Type", "application/json")
	}

	// Execute request
	httpResp, err := c.client.Do(httpReq)
	if err != nil {
		return nil, fmt.Errorf("request execution failed: %w", err)
	}
	defer httpResp.Body.Close()

	// Read response body
	body, err := io.ReadAll(httpResp.Body)
	if err != nil {
		return nil, fmt.Errorf("failed to read response body: %w", err)
	}

	duration := time.Since(start)

	if c.enableLogs {
		logger.Debug("HTTP request completed",
			zap.String("method", req.Method),
			zap.String("url", req.URL),
			zap.Int("status_code", httpResp.StatusCode),
			zap.Duration("duration", duration),
			zap.Int("response_size", len(body)),
		)
	}

	return &Response{
		StatusCode: httpResp.StatusCode,
		Body:       body,
		Headers:    httpResp.Header,
		Duration:   duration,
	}, nil
}

// Get performs a GET request
func (c *HTTPClient) Get(ctx context.Context, url string, headers map[string]string) (*Response, error) {
	return c.Do(ctx, Request{
		Method:  http.MethodGet,
		URL:     url,
		Headers: headers,
	})
}

// Post performs a POST request
func (c *HTTPClient) Post(ctx context.Context, url string, body interface{}, headers map[string]string) (*Response, error) {
	return c.Do(ctx, Request{
		Method:  http.MethodPost,
		URL:     url,
		Body:    body,
		Headers: headers,
	})
}

// Put performs a PUT request
func (c *HTTPClient) Put(ctx context.Context, url string, body interface{}, headers map[string]string) (*Response, error) {
	return c.Do(ctx, Request{
		Method:  http.MethodPut,
		URL:     url,
		Body:    body,
		Headers: headers,
	})
}

// Delete performs a DELETE request
func (c *HTTPClient) Delete(ctx context.Context, url string, headers map[string]string) (*Response, error) {
	return c.Do(ctx, Request{
		Method:  http.MethodDelete,
		URL:     url,
		Headers: headers,
	})
}

// shouldRetry determines if a request should be retried based on status code
func shouldRetry(statusCode int) bool {
	// Retry on server errors (5xx) and specific client errors
	return statusCode >= 500 || 
		   statusCode == http.StatusTooManyRequests || 
		   statusCode == http.StatusRequestTimeout
}

// IsSuccess checks if the status code indicates success
func IsSuccess(statusCode int) bool {
	return statusCode >= 200 && statusCode < 300
}

// DecodeJSON decodes JSON response body into target struct
func DecodeJSON(body []byte, target interface{}) error {
	return json.Unmarshal(body, target)
}
