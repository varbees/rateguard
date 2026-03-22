package gateway

import (
	"fmt"
	"net/http"
	"net/url"
	"strings"

	"github.com/google/uuid"
	"github.com/varbees/rateguard/internal/models"
)

// ValidateAPIConfig validates an API configuration before creation/update.
func ValidateAPIConfig(config *models.APIConfig) error {
	if _, err := url.Parse(config.TargetURL); err != nil {
		return fmt.Errorf("invalid target URL: %w", err)
	}

	if config.RateLimitPerSecond <= 0 {
		return fmt.Errorf("rate limit must be positive")
	}

	if config.BurstSize <= 0 {
		return fmt.Errorf("burst size must be positive")
	}

	if config.TimeoutSeconds <= 0 || config.TimeoutSeconds > 300 {
		return fmt.Errorf("timeout must be between 1 and 300 seconds")
	}

	return nil
}

// BuildTargetURL constructs the final target URL with query parameters.
func BuildTargetURL(baseURL string, queryParams map[string]string) string {
	if len(queryParams) == 0 {
		return baseURL
	}

	parsedURL, err := url.Parse(baseURL)
	if err != nil {
		return baseURL
	}

	q := parsedURL.Query()
	for k, v := range queryParams {
		q.Set(k, v)
	}
	parsedURL.RawQuery = q.Encode()

	return parsedURL.String()
}

// BuildTargetURLWithPath constructs the final target URL with path and query parameters.
func BuildTargetURLWithPath(baseURL, path string, queryParams map[string]string) string {
	parsedURL, err := url.Parse(baseURL)
	if err != nil {
		return baseURL
	}

	if path != "" {
		if parsedURL.Path != "" && !strings.HasSuffix(parsedURL.Path, "/") {
			parsedURL.Path += "/"
		}
		parsedURL.Path += strings.TrimPrefix(path, "/")
	}

	if len(queryParams) > 0 {
		q := parsedURL.Query()
		for key, value := range queryParams {
			q.Set(key, value)
		}
		parsedURL.RawQuery = q.Encode()
	}

	return parsedURL.String()
}

// ApplyAuthentication applies authentication headers to the outbound request.
func ApplyAuthentication(req *http.Request, config *models.APIConfig) {
	switch strings.ToLower(config.AuthType) {
	case "bearer":
		if token, ok := config.AuthCredentials["token"]; ok {
			req.Header.Set("Authorization", fmt.Sprintf("Bearer %s", token))
		}
	case "api_key":
		if key, ok := config.AuthCredentials["key"]; ok {
			headerName := config.AuthCredentials["header_name"]
			if headerName == "" {
				headerName = "X-API-Key"
			}
			req.Header.Set(headerName, key)
		}
	case "basic":
		if username, ok := config.AuthCredentials["username"]; ok {
			if password, ok := config.AuthCredentials["password"]; ok {
				req.SetBasicAuth(username, password)
			}
		}
	case "none":
	default:
	}
}

// GetRateLimitDetails returns human-readable rate limit details.
func GetRateLimitDetails(apiConfig *models.APIConfig, limitType string) string {
	switch limitType {
	case "per-second":
		return fmt.Sprintf("Limit: %d req/s", apiConfig.RateLimitPerSecond)
	case "burst":
		return fmt.Sprintf("Burst limit: %d requests", apiConfig.BurstSize)
	case "per-hour":
		return fmt.Sprintf("Hourly limit: %d requests", apiConfig.RateLimitPerHour)
	case "per-day":
		return fmt.Sprintf("Daily limit: %d requests", apiConfig.RateLimitPerDay)
	case "per-month":
		return fmt.Sprintf("Monthly limit: %d requests", apiConfig.RateLimitPerMonth)
	default:
		return fmt.Sprintf("Limit: %d req/s, Burst: %d", apiConfig.RateLimitPerSecond, apiConfig.BurstSize)
	}
}

// CreateProxyRequestID generates a unique request ID.
func CreateProxyRequestID() string {
	return "prx_" + uuid.New().String()
}
