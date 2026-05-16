package rateguard

import (
	"bytes"
	"encoding/json"
	"log"
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

type tokenJSONPayload map[string]json.RawMessage

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
	if !looksLikeJSON(body) {
		return TokenUsage{}, false
	}

	var payload tokenJSONPayload
	decoder := json.NewDecoder(bytes.NewReader(body))
	decoder.UseNumber()
	if err := decoder.Decode(&payload); err != nil {
		log.Printf("rateguard: parse token usage response body: %v", err)
		return TokenUsage{}, false
	}

	usage := TokenUsage{}
	if model, ok := stringField(payload, "model"); ok {
		usage.Model = model
	}
	if provider, ok := stringField(payload, "provider"); ok {
		usage.Provider = provider
	}

	if data, ok := objectField(payload, "usage"); ok {
		usage.InputTokens = firstNumber(data, "prompt_tokens", "input_tokens", "promptTokenCount")
		usage.OutputTokens = firstNumber(data, "completion_tokens", "output_tokens", "candidatesTokenCount")
		usage.TotalTokens = firstNumber(data, "total_tokens", "totalTokenCount")
	}

	if usage.TotalTokens == 0 {
		if data, ok := objectField(payload, "usageMetadata"); ok {
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

func objectField(payload tokenJSONPayload, name string) (tokenJSONPayload, bool) {
	raw, ok := payload[name]
	if !ok || len(raw) == 0 {
		return nil, false
	}

	var value tokenJSONPayload
	if err := json.Unmarshal(raw, &value); err != nil {
		return nil, false
	}
	return value, true
}

func stringField(payload tokenJSONPayload, name string) (string, bool) {
	raw, ok := payload[name]
	if !ok || len(raw) == 0 {
		return "", false
	}

	var value string
	if err := json.Unmarshal(raw, &value); err != nil {
		return "", false
	}
	value = strings.TrimSpace(value)
	return value, value != ""
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
			log.Printf("rateguard: ignore invalid token header %s=%q: %v", name, value, err)
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

func firstNumber(values tokenJSONPayload, names ...string) int64 {
	for _, name := range names {
		raw, ok := values[name]
		if !ok || len(raw) == 0 {
			continue
		}

		var number json.Number
		if err := json.Unmarshal(raw, &number); err == nil {
			if n, err := number.Int64(); err == nil {
				return n
			}
			if n, err := number.Float64(); err == nil {
				return int64(n)
			}
		}

		var value string
		if err := json.Unmarshal(raw, &value); err == nil {
			n, err := strconv.ParseInt(strings.TrimSpace(value), 10, 64)
			if err == nil {
				return n
			}
		}
	}
	return 0
}

func looksLikeJSON(body []byte) bool {
	trimmed := bytes.TrimSpace(body)
	return len(trimmed) > 0 && (trimmed[0] == '{' || trimmed[0] == '[')
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
