package models

import (
	"context"
	"time"
)

// This is our "contract" for what data sources look like
type APISource struct {
	Name     string            // Human-readable name (e.g., "GitHub API")
	URL      string            // Full endpoint URL
	Method   string            // HTTP method (GET, POST, etc.)
	Headers  map[string]string // Custom headers (auth, content-type)
	Timeout  time.Duration     // Max time to wait for response
}

// Think of this as a "task ticket" that workers pick up
type FetchJob struct {
    ID      string     // Unique identifier for tracking
    Source  APISource  // Which API to call
    Context context.Context // For cancellation and timeouts
}

// This is what workers return after completing their job
type FetchResult struct {
    ID         string        // Matches FetchJob.ID
    Source     string        // Which API this came from
    Data       []byte        // Raw response body
    Error      error         // nil if successful, error otherwise
    StatusCode int           // HTTP status code (0 if request failed)
    Duration   time.Duration // How long the request took
}

// It combines results from multiple APIs - what we send back to clients
type AggregatedResponse struct {
    Results   []FetchResult `json:"results"`
    TotalTime time.Duration `json:"total_time_ms"`
    Success   int           `json:"successful_fetches"`
    Failed    int           `json:"failed_fetches"`
}