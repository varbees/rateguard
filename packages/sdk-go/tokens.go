package rateguard

import (
	"encoding/json"
	"net/http"
	"strconv"
	"strings"
)

// TokenBudgetMode controls how the SDK behaves when token limits are exhausted.
type TokenBudgetMode string

const (
	// TokenBudgetModeHardStop rejects requests once token budgets are exhausted.
	TokenBudgetModeHardStop TokenBudgetMode = "hard-stop"
	// TokenBudgetModeSoftStop queues requests until token budgets reset.
	TokenBudgetModeSoftStop TokenBudgetMode = "soft-stop"
)

// TokenUsage captures token counts detected from a provider response.
type TokenUsage struct {
	Provider     string `json:"provider,omitempty"`
	Model        string `json:"model,omitempty"`
	InputTokens  int64  `json:"input_tokens,omitempty"`
	OutputTokens int64  `json:"output_tokens,omitempty"`
	TotalTokens  int64  `json:"total_tokens"`
}

// ResponseSnapshot captures the information needed to extract token usage.
type ResponseSnapshot struct {
	Header     http.Header
	Body       []byte
	StatusCode int
}

// TokenUsageExtractor extracts token usage from a response snapshot.
type TokenUsageExtractor interface {
	Extract(snapshot ResponseSnapshot) (TokenUsage, bool)
}

// DefaultTokenUsageExtractor parses generic token headers and common LLM JSON payloads.
type DefaultTokenUsageExtractor struct{}

// Extract returns token usage from either response headers or response JSON.
func (DefaultTokenUsageExtractor) Extract(snapshot ResponseSnapshot) (TokenUsage, bool) {
	usage, found := extractTokenUsageFromHeaders(snapshot.Header)
	if found {
		return usage, true
	}

	if len(snapshot.Body) == 0 {
		return TokenUsage{}, false
	}

	return extractTokenUsageFromBody(snapshot.Body)
}

func extractTokenUsageFromHeaders(header http.Header) (TokenUsage, bool) {
	if header == nil {
		return TokenUsage{}, false
	}

	usage := TokenUsage{
		Provider: firstNonEmptyHeader(header, "X-RateGuard-Provider", "X-Provider", "Provider"),
		Model:    firstNonEmptyHeader(header, "X-RateGuard-Model", "X-Model", "Model"),
	}

	input, inputFound := firstIntHeader(header,
		"X-RateGuard-Input-Tokens",
		"X-Input-Tokens",
		"Input-Tokens",
		"Prompt-Tokens",
	)
	output, outputFound := firstIntHeader(header,
		"X-RateGuard-Output-Tokens",
		"X-Output-Tokens",
		"Output-Tokens",
		"Completion-Tokens",
	)
	total, totalFound := firstIntHeader(header,
		"X-RateGuard-Total-Tokens",
		"X-Total-Tokens",
		"Total-Tokens",
	)

	if !inputFound && !outputFound && !totalFound {
		return TokenUsage{}, false
	}

	usage.InputTokens = input
	usage.OutputTokens = output
	usage.TotalTokens = total
	if usage.TotalTokens == 0 {
		usage.TotalTokens = usage.InputTokens + usage.OutputTokens
	}

	return usage, true
}

func extractTokenUsageFromBody(body []byte) (TokenUsage, bool) {
	var payload map[string]any
	if err := json.Unmarshal(body, &payload); err != nil {
		return TokenUsage{}, false
	}

	usage := TokenUsage{}
	if model, ok := payload["model"].(string); ok {
		usage.Model = model
	}
	if provider, ok := payload["provider"].(string); ok {
		usage.Provider = provider
	}

	if data, ok := payload["usage"].(map[string]any); ok {
		usage.InputTokens = firstNumber(data, "prompt_tokens", "input_tokens", "promptTokenCount")
		usage.OutputTokens = firstNumber(data, "completion_tokens", "output_tokens", "candidatesTokenCount")
		usage.TotalTokens = firstNumber(data, "total_tokens", "totalTokenCount")
	}

	if usage.TotalTokens == 0 {
		if data, ok := payload["usageMetadata"].(map[string]any); ok {
			usage.InputTokens = firstNumber(data, "promptTokenCount", "input_tokens")
			usage.OutputTokens = firstNumber(data, "candidatesTokenCount", "output_tokens")
			usage.TotalTokens = firstNumber(data, "totalTokenCount", "total_tokens")
		}
	}

	if usage.TotalTokens == 0 && (usage.InputTokens > 0 || usage.OutputTokens > 0) {
		usage.TotalTokens = usage.InputTokens + usage.OutputTokens
	}

	if usage.TotalTokens == 0 {
		return TokenUsage{}, false
	}

	return usage, true
}

func firstNonEmptyHeader(header http.Header, names ...string) string {
	for _, name := range names {
		if v := strings.TrimSpace(headerValue(header, name)); v != "" {
			return v
		}
	}
	return ""
}

func firstIntHeader(header http.Header, names ...string) (int64, bool) {
	for _, name := range names {
		value := strings.TrimSpace(headerValue(header, name))
		if value == "" {
			continue
		}
		n, err := strconv.ParseInt(value, 10, 64)
		if err != nil {
			continue
		}
		return n, true
	}
	return 0, false
}

func headerValue(header http.Header, name string) string {
	if header == nil {
		return ""
	}

	if value := strings.TrimSpace(header.Get(name)); value != "" {
		return value
	}

	for key, values := range header {
		if strings.EqualFold(key, name) && len(values) > 0 {
			return values[0]
		}
	}

	return ""
}

func firstNumber(values map[string]any, names ...string) int64 {
	for _, name := range names {
		value, ok := values[name]
		if !ok {
			continue
		}

		switch v := value.(type) {
		case float64:
			return int64(v)
		case int64:
			return v
		case int:
			return int64(v)
		case json.Number:
			n, err := v.Int64()
			if err == nil {
				return n
			}
		}
	}
	return 0
}

// NormalizeTokenBudgetMode maps empty or historical values to the canonical token budget mode vocabulary.
func NormalizeTokenBudgetMode(mode string) TokenBudgetMode {
	switch strings.ToLower(strings.TrimSpace(mode)) {
	case "", "hard", "reject", "hard-stop":
		return TokenBudgetModeHardStop
	case "soft", "queue", "soft-stop":
		return TokenBudgetModeSoftStop
	default:
		return TokenBudgetModeHardStop
	}
}
