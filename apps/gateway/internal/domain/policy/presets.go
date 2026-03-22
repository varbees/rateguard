package policy

import "strings"

// RateLimits defines request-shaping limits for a policy preset.
type RateLimits struct {
	Preset              string
	RequestsPerSecond   int
	BurstSize           int
	MaxAPIs             int // 0 = unlimited
	MonthlyRequestLimit int // 0 = unlimited
}

// Features defines feature flags and guardrail limits for a policy preset.
type Features struct {
	MaxAPIs                int   `json:"max_apis"`
	MaxRequestsPerDay      int64 `json:"max_requests_per_day"`
	MaxRequestsPerMonth    int64 `json:"max_requests_per_month"`
	MaxTokensPerMonth      int64 `json:"max_tokens_per_month"`
	AdvancedAnalytics      bool  `json:"advanced_analytics"`
	PrioritySupport        bool  `json:"priority_support"`
	CustomRateLimits       bool  `json:"custom_rate_limits"`
	Webhooks               bool  `json:"webhooks"`
	APIAccess              bool  `json:"api_access"`
	AnalyticsRetentionDays int   `json:"analytics_retention_days"`
}

// NormalizePreset maps preset aliases to canonical OSS policy presets.
func NormalizePreset(preset string) string {
	switch strings.ToLower(strings.TrimSpace(preset)) {
	case "", "free", "dev":
		return "dev"
	case "starter", "standard":
		return "standard"
	case "pro", "high-throughput":
		return "high-throughput"
	case "business", "enterprise", "llm-heavy":
		return "llm-heavy"
	case "strict-upstream-protection":
		return "strict-upstream-protection"
	default:
		return "dev"
	}
}

// GetRateLimits returns request limits for a preset.
func GetRateLimits(preset string) RateLimits {
	switch NormalizePreset(preset) {
	case "standard":
		return RateLimits{
			Preset:              "standard",
			RequestsPerSecond:   100,
			BurstSize:           200,
			MaxAPIs:             10,
			MonthlyRequestLimit: 1000000,
		}
	case "high-throughput":
		return RateLimits{
			Preset:              "high-throughput",
			RequestsPerSecond:   1000,
			BurstSize:           2000,
			MaxAPIs:             0,
			MonthlyRequestLimit: 10000000,
		}
	case "llm-heavy":
		return RateLimits{
			Preset:              "llm-heavy",
			RequestsPerSecond:   500,
			BurstSize:           1000,
			MaxAPIs:             0,
			MonthlyRequestLimit: 5000000,
		}
	case "strict-upstream-protection":
		return RateLimits{
			Preset:              "strict-upstream-protection",
			RequestsPerSecond:   50,
			BurstSize:           75,
			MaxAPIs:             5,
			MonthlyRequestLimit: 500000,
		}
	default:
		return RateLimits{
			Preset:              "dev",
			RequestsPerSecond:   10,
			BurstSize:           20,
			MaxAPIs:             3,
			MonthlyRequestLimit: 100000,
		}
	}
}

// GetPresetFeatures returns feature flags for a preset.
func GetPresetFeatures(preset string) Features {
	switch NormalizePreset(preset) {
	case "standard":
		return Features{
			MaxAPIs:                10,
			MaxRequestsPerDay:      10000000,
			MaxRequestsPerMonth:    1000000,
			MaxTokensPerMonth:      10000000,
			AdvancedAnalytics:      true,
			PrioritySupport:        false,
			CustomRateLimits:       true,
			Webhooks:               false,
			APIAccess:              true,
			AnalyticsRetentionDays: 30,
		}
	case "high-throughput":
		return Features{
			MaxAPIs:                0,
			MaxRequestsPerDay:      100000000,
			MaxRequestsPerMonth:    10000000,
			MaxTokensPerMonth:      100000000,
			AdvancedAnalytics:      true,
			PrioritySupport:        true,
			CustomRateLimits:       true,
			Webhooks:               true,
			APIAccess:              true,
			AnalyticsRetentionDays: 90,
		}
	case "llm-heavy":
		return Features{
			MaxAPIs:                0,
			MaxRequestsPerDay:      25000000,
			MaxRequestsPerMonth:    5000000,
			MaxTokensPerMonth:      250000000,
			AdvancedAnalytics:      true,
			PrioritySupport:        true,
			CustomRateLimits:       true,
			Webhooks:               true,
			APIAccess:              true,
			AnalyticsRetentionDays: 90,
		}
	case "strict-upstream-protection":
		return Features{
			MaxAPIs:                5,
			MaxRequestsPerDay:      1000000,
			MaxRequestsPerMonth:    500000,
			MaxTokensPerMonth:      2000000,
			AdvancedAnalytics:      true,
			PrioritySupport:        false,
			CustomRateLimits:       true,
			Webhooks:               true,
			APIAccess:              true,
			AnalyticsRetentionDays: 14,
		}
	default:
		return Features{
			MaxAPIs:                3,
			MaxRequestsPerDay:      1000000,
			MaxRequestsPerMonth:    100000,
			MaxTokensPerMonth:      100000,
			AdvancedAnalytics:      false,
			PrioritySupport:        false,
			CustomRateLimits:       false,
			Webhooks:               false,
			APIAccess:              true,
			AnalyticsRetentionDays: 7,
		}
	}
}

// SupportsPriorityQueues reports whether the preset can exceed the default queue priority cap.
func SupportsPriorityQueues(preset string) bool {
	return GetPresetFeatures(preset).PrioritySupport
}
