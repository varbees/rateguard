package httpadapter

import (
	"net/http"
	"strings"
)

// IsStreamingResponse detects whether the response should be treated as streaming.
func IsStreamingResponse(contentType string, headers http.Header) bool {
	contentTypeLower := strings.ToLower(contentType)

	if strings.Contains(contentTypeLower, "text/event-stream") {
		return true
	}

	if strings.Contains(contentTypeLower, "application/x-ndjson") ||
		strings.Contains(contentTypeLower, "application/jsonlines") {
		return true
	}

	if headers.Get("Transfer-Encoding") == "chunked" {
		if strings.Contains(contentTypeLower, "application/json") ||
			strings.Contains(contentTypeLower, "text/plain") {
			return false
		}
		return true
	}

	return false
}

// DetectStreamType determines the type of streaming response.
func DetectStreamType(contentType string, headers http.Header) string {
	contentTypeLower := strings.ToLower(contentType)

	if strings.Contains(contentTypeLower, "text/event-stream") {
		return "sse"
	}

	if strings.Contains(contentTypeLower, "application/x-ndjson") ||
		strings.Contains(contentTypeLower, "application/jsonlines") {
		return "ndjson"
	}

	if headers.Get("Transfer-Encoding") == "chunked" {
		return "chunked"
	}

	return "unknown"
}
