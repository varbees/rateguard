package proxy

import (
	"encoding/json"
	"fmt"
	"net/url"
	"strings"

	"github.com/varbees/rateguard/internal/models"
)

// LLMDetectionResult contains auto-detection findings
type LLMDetectionResult struct {
	IsLLM          bool     // Whether this appears to be an LLM API
	Provider       string   // "openai", "anthropic", "groq", or empty
	Model          string   // Detected model or empty
	Confidence     float64  // 0.0 to 1.0
	DetectionHints []string // How we detected it
}

// DetectLLMFromURL analyzes the target URL to identify LLM providers
func DetectLLMFromURL(targetURL string) LLMDetectionResult {
	u, err := url.Parse(targetURL)
	if err != nil {
		return LLMDetectionResult{IsLLM: false, Confidence: 0.0}
	}

	host := strings.ToLower(u.Host)
	path := strings.ToLower(u.Path)

	// URL pattern matching table
	patterns := []struct {
		provider   string
		hostMatch  []string
		pathMatch  []string
		confidence float64
	}{
		{
			provider:   "openai",
			hostMatch:  []string{"api.openai.com", "openai.azure.com"},
			pathMatch:  []string{"/v1/chat/completions", "/v1/completions", "/v1/embeddings"},
			confidence: 0.95,
		},
		{
			provider:   "anthropic",
			hostMatch:  []string{"api.anthropic.com"},
			pathMatch:  []string{"/v1/messages", "/v1/complete"},
			confidence: 0.95,
		},
		{
			provider:   "groq",
			hostMatch:  []string{"api.groq.com"},
			pathMatch:  []string{"/openai/v1/chat/completions"},
			confidence: 0.95,
		},
		{
			provider:   "cohere",
			hostMatch:  []string{"api.cohere.ai", "api.cohere.com"},
			pathMatch:  []string{"/v1/generate", "/v1/chat"},
			confidence: 0.90,
		},
		{
			provider:   "together",
			hostMatch:  []string{"api.together.xyz"},
			pathMatch:  []string{"/inference"},
			confidence: 0.85,
		},
	}

	for _, p := range patterns {
		// Check host match
		hostMatched := false
		for _, hostPattern := range p.hostMatch {
			if strings.Contains(host, hostPattern) {
				hostMatched = true
				break
			}
		}

		// Check path match
		pathMatched := false
		for _, pathPattern := range p.pathMatch {
			if strings.Contains(path, pathPattern) {
				pathMatched = true
				break
			}
		}

		if hostMatched && pathMatched {
			return LLMDetectionResult{
				IsLLM:      true,
				Provider:   p.provider,
				Confidence: p.confidence,
				DetectionHints: []string{
					fmt.Sprintf("Host matches %s", p.provider),
					"Path matches LLM endpoint",
				},
			}
		}

		// Partial match (host only) - lower confidence
		if hostMatched {
			return LLMDetectionResult{
				IsLLM:      true,
				Provider:   p.provider,
				Confidence: p.confidence * 0.7, // Reduced confidence
				DetectionHints: []string{
					fmt.Sprintf("Host matches %s (path unclear)", p.provider),
				},
			}
		}
	}

	return LLMDetectionResult{IsLLM: false, Confidence: 0.0}
}

// DetectLLMFromResponse analyzes the response body to identify LLM APIs
// This is a secondary check when URL detection is inconclusive
func DetectLLMFromResponse(responseBody []byte, isStreaming bool) LLMDetectionResult {
	var data map[string]interface{}
	if err := json.Unmarshal(responseBody, &data); err != nil {
		return LLMDetectionResult{IsLLM: false, Confidence: 0.0}
	}

	hints := []string{}
	confidence := 0.0

	// Check for "usage" field (strong signal for LLMs)
	if usage, ok := data["usage"].(map[string]interface{}); ok {
		if _, hasPrompt := usage["prompt_tokens"]; hasPrompt {
			hints = append(hints, "Response contains 'usage.prompt_tokens'")
			confidence += 0.6
		}
		if _, hasCompletion := usage["completion_tokens"]; hasCompletion {
			hints = append(hints, "Response contains 'usage.completion_tokens'")
			confidence += 0.6
		}
	}

	// Check for "choices" field (common in LLM responses)
	if choices, ok := data["choices"].([]interface{}); ok && len(choices) > 0 {
		hints = append(hints, "Response contains 'choices' array")
		confidence += 0.2
	}

	// Check for "model" field
	if model, ok := data["model"].(string); ok && model != "" {
		hints = append(hints, fmt.Sprintf("Response contains model: %s", model))
		confidence += 0.3

		// Try to infer provider from model name
		provider := inferProviderFromModel(model)
		if provider != "" {
			return LLMDetectionResult{
				IsLLM:          true,
				Provider:       provider,
				Model:          model,
				Confidence:     min(confidence, 1.0),
				DetectionHints: hints,
			}
		}
	}

	// Streaming responses often indicate LLM APIs
	if isStreaming {
		hints = append(hints, "Response is streaming (SSE/NDJSON)")
		confidence += 0.4
	}

	return LLMDetectionResult{
		IsLLM:          confidence > 0.6,
		Confidence:     min(confidence, 1.0),
		DetectionHints: hints,
	}
}

// inferProviderFromModel guesses provider from model name
func inferProviderFromModel(model string) string {
	modelLower := strings.ToLower(model)

	if strings.Contains(modelLower, "gpt") || strings.Contains(modelLower, "text-davinci") {
		return "openai"
	}
	if strings.Contains(modelLower, "claude") {
		return "anthropic"
	}
	if strings.Contains(modelLower, "llama") || strings.Contains(modelLower, "mixtral") {
		return "groq" // Could also be "together", context-dependent
	}
	if strings.Contains(modelLower, "command") {
		return "cohere"
	}

	return ""
}

// AutoDetectAndUpdate runs detection and updates APIConfig if needed
// Returns true if auto-detection succeeded and updated the config
func AutoDetectAndUpdate(config *models.APIConfig, responseBody []byte, isStreaming bool) bool {
	// If already marked as LLM, skip detection
	if config.IsLLMAPI {
		return false
	}

	// First check URL
	urlResult := DetectLLMFromURL(config.TargetURL)

	// If URL detection is confident, use it
	if urlResult.Confidence > 0.8 {
		config.IsLLMAPI = true
		config.Provider = &urlResult.Provider
		config.PricingModel = "token"
		return true
	}

	// Otherwise check response (if available)
	if len(responseBody) > 0 {
		respResult := DetectLLMFromResponse(responseBody, isStreaming)

		if respResult.IsLLM && respResult.Confidence > 0.6 {
			config.IsLLMAPI = true
			if respResult.Provider != "" {
				config.Provider = &respResult.Provider
			}
			if respResult.Model != "" {
				config.Model = &respResult.Model
			}
			config.PricingModel = "token"
			return true
		}
	}

	return false
}

// Helper function for min
func min(a, b float64) float64 {
	if a < b {
		return a
	}
	return b
}
