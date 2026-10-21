package rateguard

import (
	"bytes"
	"encoding/json"
	"log"
	"math"
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
//
// InputTokens is the whole prompt as the vendor bills it, normalised across
// providers: Anthropic and Bedrock report three non-overlapping counters
// (uncached input, cache reads, cache writes) and InputTokens is their sum;
// OpenAI, DeepSeek and Gemini already report the whole prompt. The cache
// fields are subsets of InputTokens, never additions to it, so
// InputTokens - CacheReadTokens - CacheWriteTokens is the uncached remainder.
// This is the meaning OTel gives gen_ai.usage.input_tokens.
type TokenUsage struct {
	Provider     string `json:"provider,omitempty"`
	Model        string `json:"model,omitempty"`
	InputTokens  int64  `json:"input_tokens,omitempty"`
	OutputTokens int64  `json:"output_tokens,omitempty"`
	TotalTokens  int64  `json:"total_tokens"`
	// CacheReadTokens is the part of InputTokens served from the provider's
	// prompt cache (Anthropic cache_read_input_tokens, OpenAI cached_tokens,
	// DeepSeek prompt_cache_hit_tokens, Gemini cachedContentTokenCount).
	CacheReadTokens int64 `json:"cache_read_tokens,omitempty"`
	// CacheWriteTokens is the part of InputTokens written to the cache
	// (Anthropic cache_creation_input_tokens, Bedrock cacheWriteInputTokens,
	// OpenAI GPT-5.6+ cache_write_tokens), across every TTL.
	CacheWriteTokens int64 `json:"cache_write_tokens,omitempty"`
	// CacheWriteLongTTLTokens is the part of CacheWriteTokens written with the
	// vendor's longer, dearer TTL: Anthropic and Bedrock 1h (2x input),
	// OpenAI 12h (2.5x input). The rest of CacheWriteTokens is the default TTL.
	CacheWriteLongTTLTokens int64 `json:"cache_write_long_ttl_tokens,omitempty"`
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

	// Field aliases cover OpenAI (prompt/completion), Anthropic (input/output),
	// AWS Bedrock Converse (inputTokens/outputTokens — camelCase), and
	// Google's *TokenCount names.
	if data, ok := objectField(payload, "usage"); ok {
		applyUsageCounters(&usage, data)
	}

	if usage.TotalTokens == 0 {
		if data, ok := objectField(payload, "usageMetadata"); ok {
			applyUsageCounters(&usage, data)
		}
	}

	if sum := saturatingAdd(usage.InputTokens, usage.OutputTokens); sum > usage.TotalTokens {
		usage.TotalTokens = sum
	}

	if usage.TotalTokens == 0 {
		return TokenUsage{}, false
	}

	return usage, true
}

// applyUsageCounters reads one provider usage object into usage, normalising
// the prompt to its whole size (see TokenUsage). Mirrored by readObjectUsage
// in Node and _usage_counters in Python; conformance/usage_cache_vectors.json
// holds all three to the same answers.
func applyUsageCounters(usage *TokenUsage, data tokenJSONPayload) {
	c := readUsageCounters(data)
	usage.InputTokens = c.InputTokens
	usage.OutputTokens = c.OutputTokens
	usage.TotalTokens = c.TotalTokens
	usage.CacheReadTokens = c.CacheReadTokens
	usage.CacheWriteTokens = c.CacheWriteTokens
	usage.CacheWriteLongTTLTokens = c.CacheWriteLongTTLTokens
}

func readUsageCounters(data tokenJSONPayload) TokenUsage {
	var u TokenUsage
	u.InputTokens = firstNumber(data, "prompt_tokens", "input_tokens", "inputTokens", "promptTokenCount")
	u.OutputTokens = firstNumber(data, "completion_tokens", "output_tokens", "outputTokens", "candidatesTokenCount")
	u.TotalTokens = firstNumber(data, "total_tokens", "totalTokens", "totalTokenCount")

	// Anthropic and Bedrock name their cache counters; OpenAI-shaped bodies
	// carry them in a details object.
	vendorRead := firstNumber(data, "cache_read_input_tokens", "cacheReadInputTokens")
	vendorWrite := firstNumber(data, "cache_creation_input_tokens", "cacheWriteInputTokens")
	read := vendorRead
	if read == 0 {
		read = firstNumber(data, "prompt_cache_hit_tokens", "cachedContentTokenCount")
	}
	write := vendorWrite
	var details tokenJSONPayload
	var write1hOpenAI int64
	if d, ok := objectField(data, "input_tokens_details"); ok {
		details = d
	} else if d, ok := objectField(data, "prompt_tokens_details"); ok {
		details = d
	}
	if details != nil {
		if read == 0 {
			read = firstNumber(details, "cached_tokens")
		}
		if write == 0 {
			write = firstNumber(details, "cache_write_tokens")
		}
		// OpenAI Responses: cache_write_tokens_details.{ttl_30m_tokens,ttl_12h_tokens}.
		if wd, ok := objectField(details, "cache_write_tokens_details"); ok {
			write1hOpenAI = firstNumber(wd, "ttl_12h_tokens")
		}
	}

	// Long-TTL writes: Anthropic usage.cache_creation.ephemeral_1h_input_tokens,
	// Bedrock usage.cacheDetails[{ttl:"1h", inputTokens}], OpenAI (above)
	// input_tokens_details.cache_write_tokens_details.ttl_12h_tokens.
	var write1h, writeByTTL int64
	if cc, ok := objectField(data, "cache_creation"); ok {
		write1h = firstNumber(cc, "ephemeral_1h_input_tokens")
		writeByTTL = saturatingAdd(firstNumber(cc, "ephemeral_5m_input_tokens"), write1h)
	} else if raw, ok := data["cacheDetails"]; ok {
		var list []tokenJSONPayload
		if json.Unmarshal(raw, &list) == nil {
			for _, d := range list {
				n := firstNumber(d, "inputTokens")
				writeByTTL = saturatingAdd(writeByTTL, n)
				if ttl, _ := stringField(d, "ttl"); ttl == "1h" {
					write1h = saturatingAdd(write1h, n)
				}
			}
		}
	}
	write1h = max(write1h, write1hOpenAI)
	if write == 0 {
		write = writeByTTL
		if writeByTTL > 0 {
			vendorWrite = writeByTTL
		}
	}

	// Additive shape: Anthropic/Bedrock input_tokens excludes cache reads and
	// writes. A body that also carries prompt_tokens or promptTokenCount
	// (OpenAI, LiteLLM's proxy, Gemini) already reports the whole prompt.
	_, hasPrompt := numberField(data, "prompt_tokens")
	_, hasPromptCount := numberField(data, "promptTokenCount")
	if !hasPrompt && !hasPromptCount && (vendorRead > 0 || vendorWrite > 0) {
		u.InputTokens = saturatingAdd(saturatingAdd(u.InputTokens, read), write)
	} else {
		// Subsets of the reported prompt: a hostile or malformed body must not
		// claim more cached tokens than prompt tokens.
		read = min(read, u.InputTokens)
		write = min(write, u.InputTokens-read)
	}
	u.CacheReadTokens = read
	u.CacheWriteTokens = write
	u.CacheWriteLongTTLTokens = min(write1h, write)
	return u
}

// numberField reports whether name holds a JSON number (null does not count).
func numberField(payload tokenJSONPayload, name string) (json.Number, bool) {
	raw, ok := payload[name]
	if !ok || len(raw) == 0 || raw[0] == '"' {
		return "", false
	}
	var n json.Number
	if err := json.Unmarshal(raw, &n); err != nil {
		return "", false
	}
	return n, true
}

// saturatingAdd adds two non-negative token counts without wrapping: a
// hostile count near MaxInt64 must not turn the sum negative (a refund).
func saturatingAdd(a, b int64) int64 {
	if a > math.MaxInt64-b {
		return math.MaxInt64
	}
	return a + b
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
				return nonNegativeTokens(n)
			}
			if f, err := number.Float64(); err == nil {
				// int64(f) WRAPS for out-of-range floats: a hostile 9.2e18
				// becomes MinInt64 (a huge NEGATIVE), which if committed would
				// REFUND the budget. Guard the conversion; garbage counts as
				// "no usage" so the caller commits its reserved estimate.
				if f < 0 || f >= float64(math.MaxInt64) {
					return 0
				}
				return int64(f)
			}
		}

		var value string
		if err := json.Unmarshal(raw, &value); err == nil {
			n, err := strconv.ParseInt(strings.TrimSpace(value), 10, 64)
			if err == nil {
				return nonNegativeTokens(n)
			}
		}
	}
	return 0
}

// nonNegativeTokens clamps a parsed token count to zero. A token count is
// non-negative by definition, so any negative is either a bug or a hostile
// provider. Committing a negative would decrease recorded usage — an
// attacker-controlled budget refund — so a negative counts as "no usage" and
// the caller's fail-safe (commit the reserved estimate) takes over.
func nonNegativeTokens(n int64) int64 {
	if n < 0 {
		return 0
	}
	return n
}

func looksLikeJSON(body []byte) bool {
	trimmed := bytes.TrimSpace(body)
	return len(trimmed) > 0 && (trimmed[0] == '{' || trimmed[0] == '[')
}

// NormalizeTokenBudgetMode accepts documented mode aliases and returns the canonical value.
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
