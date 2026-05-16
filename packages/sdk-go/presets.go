package rateguard

import "strings"

const (
	PresetDev                   = "dev"
	PresetStandard              = "standard"
	PresetHighThroughput        = "high-throughput"
	PresetLLMHeavy              = "llm-heavy"
	PresetStrictUpstreamProtect = "strict-upstream-protection"
)

// PolicyPreset defines the resource limits behind a named preset.
type PolicyPreset struct {
	Name                   string `json:"name"`
	RequestsPerSecond      int    `json:"requests_per_second"`
	Burst                  int    `json:"burst"`
	MaxAPIs                int    `json:"max_apis"`
	MonthlyRequestLimit    int    `json:"monthly_request_limit"`
	MaxRequestsPerDay      int64  `json:"max_requests_per_day"`
	MaxRequestsPerMonth    int64  `json:"max_requests_per_month"`
	MaxTokensPerMonth      int64  `json:"max_tokens_per_month"`
	TokenBudgetPerHour     int64  `json:"token_budget_per_hour"`
	TokenBudgetPerDay      int64  `json:"token_budget_per_day"`
	TokenBudgetPerMonth    int64  `json:"token_budget_per_month"`
	TokenBudgetMode        TokenBudgetMode `json:"token_budget_mode"`
	AdvancedAnalytics      bool   `json:"advanced_analytics"`
	PrioritySupport        bool   `json:"priority_support"`
	CustomRateLimits       bool   `json:"custom_rate_limits"`
	Webhooks               bool   `json:"webhooks"`
	APIAccess              bool   `json:"api_access"`
	AnalyticsRetentionDays int    `json:"analytics_retention_days"`
}

// NormalizePreset accepts documented preset aliases and returns the canonical name.
func NormalizePreset(preset string) string {
	switch strings.ToLower(strings.TrimSpace(preset)) {
	case "", "free", "dev":
		return PresetDev
	case "starter", "standard":
		return PresetStandard
	case "pro", "high-throughput":
		return PresetHighThroughput
	case "business", "enterprise", "llm-heavy":
		return PresetLLMHeavy
	case "strict-upstream-protection":
		return PresetStrictUpstreamProtect
	default:
		return PresetDev
	}
}

// PresetPolicy returns the canonical preset definition for the given name.
func PresetPolicy(preset string) PolicyPreset {
	switch NormalizePreset(preset) {
	case PresetStandard:
		return PolicyPreset{
			Name:                   PresetStandard,
			RequestsPerSecond:      100,
			Burst:                  200,
			MaxAPIs:                10,
			MonthlyRequestLimit:    1000000,
			MaxRequestsPerDay:      10000000,
			MaxRequestsPerMonth:    1000000,
			MaxTokensPerMonth:      10000000,
			TokenBudgetPerHour:     10000,
			TokenBudgetPerDay:      100000,
			TokenBudgetPerMonth:    1000000,
			TokenBudgetMode:        TokenBudgetModeHardStop,
			AdvancedAnalytics:      true,
			PrioritySupport:        false,
			CustomRateLimits:       true,
			Webhooks:               false,
			APIAccess:              true,
			AnalyticsRetentionDays: 30,
		}
	case PresetHighThroughput:
		return PolicyPreset{
			Name:                   PresetHighThroughput,
			RequestsPerSecond:      1000,
			Burst:                  2000,
			MaxAPIs:                0,
			MonthlyRequestLimit:    10000000,
			MaxRequestsPerDay:      100000000,
			MaxRequestsPerMonth:    10000000,
			MaxTokensPerMonth:      100000000,
			TokenBudgetPerHour:     100000,
			TokenBudgetPerDay:      1000000,
			TokenBudgetPerMonth:    10000000,
			TokenBudgetMode:        TokenBudgetModeHardStop,
			AdvancedAnalytics:      true,
			PrioritySupport:        true,
			CustomRateLimits:       true,
			Webhooks:               true,
			APIAccess:              true,
			AnalyticsRetentionDays: 90,
		}
	case PresetLLMHeavy:
		return PolicyPreset{
			Name:                   PresetLLMHeavy,
			RequestsPerSecond:      500,
			Burst:                  1000,
			MaxAPIs:                0,
			MonthlyRequestLimit:    5000000,
			MaxRequestsPerDay:      25000000,
			MaxRequestsPerMonth:    5000000,
			MaxTokensPerMonth:      250000000,
			TokenBudgetPerHour:     250000,
			TokenBudgetPerDay:      2500000,
			TokenBudgetPerMonth:    250000000,
			TokenBudgetMode:        TokenBudgetModeSoftStop,
			AdvancedAnalytics:      true,
			PrioritySupport:        true,
			CustomRateLimits:       true,
			Webhooks:               true,
			APIAccess:              true,
			AnalyticsRetentionDays: 90,
		}
	case PresetStrictUpstreamProtect:
		return PolicyPreset{
			Name:                   PresetStrictUpstreamProtect,
			RequestsPerSecond:      50,
			Burst:                  75,
			MaxAPIs:                5,
			MonthlyRequestLimit:    500000,
			MaxRequestsPerDay:      1000000,
			MaxRequestsPerMonth:    500000,
			MaxTokensPerMonth:      2000000,
			TokenBudgetPerHour:     5000,
			TokenBudgetPerDay:      20000,
			TokenBudgetPerMonth:    2000000,
			TokenBudgetMode:        TokenBudgetModeHardStop,
			AdvancedAnalytics:      true,
			PrioritySupport:        false,
			CustomRateLimits:       true,
			Webhooks:               true,
			APIAccess:              true,
			AnalyticsRetentionDays: 14,
		}
	default:
		return PolicyPreset{
			Name:                   PresetDev,
			RequestsPerSecond:      10,
			Burst:                  20,
			MaxAPIs:                3,
			MonthlyRequestLimit:    100000,
			MaxRequestsPerDay:      1000000,
			MaxRequestsPerMonth:    100000,
			MaxTokensPerMonth:      100000,
			TokenBudgetPerHour:     1000,
			TokenBudgetPerDay:      10000,
			TokenBudgetPerMonth:    100000,
			TokenBudgetMode:        TokenBudgetModeHardStop,
			AdvancedAnalytics:      false,
			PrioritySupport:        false,
			CustomRateLimits:       false,
			Webhooks:               false,
			APIAccess:              true,
			AnalyticsRetentionDays: 7,
		}
	}
}

// KnownPresets returns the canonical preset names in display order.
func KnownPresets() []string {
	return []string{
		PresetDev,
		PresetStandard,
		PresetHighThroughput,
		PresetLLMHeavy,
		PresetStrictUpstreamProtect,
	}
}
