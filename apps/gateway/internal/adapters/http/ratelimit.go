package httpadapter

import (
	"net/http"
	"strconv"
	"strings"
	"time"
)

// RateLimitInfo extracted from response headers.
type RateLimitInfo struct {
	Limit         *int64
	Remaining     *int64
	Reset         *time.Time
	RetryAfter    *int
	WindowSeconds *int
	SourceHeader  string
}

// ParseRateLimitHeaders extracts rate limit information from HTTP headers.
func ParseRateLimitHeaders(headers http.Header) *RateLimitInfo {
	info := &RateLimitInfo{}

	patterns := []struct {
		limitKey     string
		remainingKey string
		resetKey     string
		retryKey     string
	}{
		{"X-RateLimit-Limit", "X-RateLimit-Remaining", "X-RateLimit-Reset", "Retry-After"},
		{"X-Rate-Limit-Limit", "X-Rate-Limit-Remaining", "X-Rate-Limit-Reset", "Retry-After"},
		{"x-ratelimit-limit-requests", "x-ratelimit-remaining-requests", "x-ratelimit-reset-requests", "retry-after"},
		{"CF-RateLimit-Limit", "CF-RateLimit-Remaining", "CF-RateLimit-Reset", "Retry-After"},
	}

	for _, pattern := range patterns {
		if limitStr := headers.Get(pattern.limitKey); limitStr != "" {
			if limit, err := strconv.ParseInt(limitStr, 10, 64); err == nil {
				info.Limit = &limit
				info.SourceHeader = pattern.limitKey
			}
		}

		if remainingStr := headers.Get(pattern.remainingKey); remainingStr != "" {
			if remaining, err := strconv.ParseInt(remainingStr, 10, 64); err == nil {
				info.Remaining = &remaining
			}
		}

		if resetStr := headers.Get(pattern.resetKey); resetStr != "" {
			if resetUnix, err := strconv.ParseInt(resetStr, 10, 64); err == nil {
				resetTime := time.Unix(resetUnix, 0)
				info.Reset = &resetTime

				windowSecs := int(resetTime.Sub(time.Now()).Seconds())
				if windowSecs > 0 && windowSecs < 86400 {
					info.WindowSeconds = &windowSecs
				}
			}
		}

		if retryStr := headers.Get(pattern.retryKey); retryStr != "" {
			if retrySecs, err := strconv.Atoi(retryStr); err == nil {
				info.RetryAfter = &retrySecs
			}
		}

		if info.Limit != nil {
			break
		}
	}

	if info.WindowSeconds == nil && info.SourceHeader != "" {
		lower := strings.ToLower(info.SourceHeader)
		if strings.Contains(lower, "minute") {
			window := 60
			info.WindowSeconds = &window
		} else if strings.Contains(lower, "hour") {
			window := 3600
			info.WindowSeconds = &window
		} else if strings.Contains(lower, "day") {
			window := 86400
			info.WindowSeconds = &window
		} else if strings.Contains(lower, "second") {
			window := 1
			info.WindowSeconds = &window
		}
	}

	if info.Limit != nil && info.WindowSeconds == nil {
		window := 60
		info.WindowSeconds = &window
	}

	return info
}
