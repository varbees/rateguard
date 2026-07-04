package rateguard

import (
	"net/http"
	"regexp"
	"strings"
	"sync"
)

// ── Content Guardrail: prompt-level safety checks ──
//
// Guardrails run BEFORE the LLM call. They reject prompts that contain
// sensitive data (PII), prompt injection attempts, or toxic content.
// Each guardrail is a pluggable interface — bring your own or use built-ins.
//
// Pattern: guardrail.Check(prompt) → {allowed, reason}
// Rejected prompts return HTTP 422 with the guardrail reason as the error code.

// Guardrail checks whether a prompt or message content is safe to send.
// Implement this interface to add custom safety checks.
type Guardrail interface {
	// Check returns nil if the content passes all checks.
	// Returns an error with a descriptive code if the content should be blocked.
	Check(content string) *GuardrailViolation
}

// GuardrailViolation describes why content was blocked.
type GuardrailViolation struct {
	Code    string  // e.g. "pii_detected", "prompt_injection", "toxic_content"
	Message string  // human-readable explanation
	Score   float64 // 0.0–1.0 severity (optional, for logging)
}

func (v *GuardrailViolation) Error() string {
	return v.Code + ": " + v.Message
}

// GuardrailChain runs multiple guardrails in order. Stops at first violation.
type GuardrailChain struct {
	guardrails []Guardrail
}

// NewGuardrailChain creates a chain from the given guardrails.
func NewGuardrailChain(guardrails ...Guardrail) *GuardrailChain {
	return &GuardrailChain{guardrails: guardrails}
}

// Check runs all guardrails. Returns the first violation found, or nil if all pass.
func (c *GuardrailChain) Check(content string) *GuardrailViolation {
	for _, g := range c.guardrails {
		if v := g.Check(content); v != nil {
			return v
		}
	}
	return nil
}

// ── Built-in guardrails ──

// PIIGuardrail detects personally identifiable information in prompts.
type PIIGuardrail struct {
	mu sync.RWMutex
	// Custom patterns can be added
	customPatterns []*regexp.Regexp
}

// Common PII patterns (credit cards, SSN, phone numbers, emails)
var (
	creditCardPattern = regexp.MustCompile(`\b(?:\d[ -]*?){13,16}\b`)
	emailPattern      = regexp.MustCompile(`\b[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Z|a-z]{2,}\b`)
	phonePattern      = regexp.MustCompile(`\b(?:\+\d{1,3}[-.]?)?\(?\d{3}\)?[-.]?\d{3}[-.]?\d{4}\b`)
	ssnPattern        = regexp.MustCompile(`\b\d{3}[-]?\d{2}[-]?\d{4}\b`)
)

func NewPIIGuardrail() *PIIGuardrail {
	return &PIIGuardrail{}
}

func (g *PIIGuardrail) Check(content string) *GuardrailViolation {
	patterns := []*regexp.Regexp{creditCardPattern, emailPattern, phonePattern, ssnPattern}
	g.mu.RLock()
	patterns = append(patterns, g.customPatterns...)
	g.mu.RUnlock()

	for _, p := range patterns {
		if p.MatchString(content) {
			return &GuardrailViolation{
				Code:    "pii_detected",
				Message: "prompt contains personally identifiable information (PII)",
				Score:   0.9,
			}
		}
	}
	return nil
}

// PromptInjectionGuardrail detects common prompt injection patterns.
type PromptInjectionGuardrail struct {
	patterns []*regexp.Regexp
}

// Known 2026 prompt injection attack vectors
var injectionPatterns = []*regexp.Regexp{
	// "Ignore all previous instructions" variants
	regexp.MustCompile(`(?i)ignore\s+(all\s+)?(previous|prior|above|your)\s+(instructions?|prompts?|rules?)`),
	// "You are now" role hijacking
	regexp.MustCompile(`(?i)you\s+are\s+now\s+(a\s+)?(DAN|jailbreak|unfiltered|evil|malicious)`),
	// System prompt extraction
	regexp.MustCompile(`(?i)(print|show|reveal|display|output)\s+(your\s+)?(system\s+(prompt|message|instructions?)|initial\s+prompt)`),
	// "From now on" behavior override
	regexp.MustCompile(`(?i)(from\s+now\s+on|starting\s+now|henceforth)\s+(you\s+(will|must|are))`),
	// Token smuggling via encoding
	regexp.MustCompile(`(?i)(decode|decrypt|translate)\s+(this|the\s+following)\s+(base64|hex|encoded|encrypted)`),
}

func NewPromptInjectionGuardrail() *PromptInjectionGuardrail {
	return &PromptInjectionGuardrail{patterns: injectionPatterns}
}

func (g *PromptInjectionGuardrail) Check(content string) *GuardrailViolation {
	for _, p := range g.patterns {
		if p.MatchString(content) {
			return &GuardrailViolation{
				Code:    "prompt_injection",
				Message: "prompt contains potential injection pattern",
				Score:   0.8,
			}
		}
	}
	return nil
}

// TokenLimitGuardrail rejects prompts that exceed a maximum token count.
type TokenLimitGuardrail struct {
	MaxTokens int // approximate — chars/4
}

func NewTokenLimitGuardrail(maxTokens int) *TokenLimitGuardrail {
	return &TokenLimitGuardrail{MaxTokens: maxTokens}
}

func (g *TokenLimitGuardrail) Check(content string) *GuardrailViolation {
	estimatedTokens := len(content) / 4
	if estimatedTokens > g.MaxTokens {
		return &GuardrailViolation{
			Code:    "token_limit_exceeded",
			Message: "prompt exceeds maximum token limit",
			Score:   1.0,
		}
	}
	return nil
}

// ── Content length guardrail ──

// MaxLengthGuardrail rejects prompts exceeding a byte limit.
func MaxLengthGuardrail(maxBytes int) Guardrail {
	return &maxLengthGuardrail{maxBytes: maxBytes}
}

type maxLengthGuardrail struct {
	maxBytes int
}

func (g *maxLengthGuardrail) Check(content string) *GuardrailViolation {
	if len(content) > g.maxBytes {
		return &GuardrailViolation{
			Code:    "content_too_long",
			Message: "prompt exceeds maximum byte length",
			Score:   1.0,
		}
	}
	return nil
}

// ── Standard guardrail chains ──

// StandardGuardrails returns the recommended guardrail chain for production use.
// PII → injection → length (no token limit — that's what the token budget is for).
func StandardGuardrails() *GuardrailChain {
	return NewGuardrailChain(
		NewPIIGuardrail(),
		NewPromptInjectionGuardrail(),
		MaxLengthGuardrail(100_000), // 100KB max
	)
}

// StrictGuardrails returns a stricter chain for high-security environments.
func StrictGuardrails() *GuardrailChain {
	return NewGuardrailChain(
		NewPIIGuardrail(),
		NewPromptInjectionGuardrail(),
		NewTokenLimitGuardrail(32_000), // 32K token limit
		MaxLengthGuardrail(50_000),
	)
}

// ── Guardrail HTTP integration ──

// GuardrailReject writes a 422 response with the guardrail violation details.
func WriteGuardrailReject(w http.ResponseWriter, v *GuardrailViolation) {
	writeJSONError(w, http.StatusUnprocessableEntity, v.Code, v.Message, 0)
}

// ContainsSQLInjection is a lightweight check for SQL-like patterns in user input.
// Not a replacement for parameterized queries — just an early signal.
func ContainsSQLInjection(content string) bool {
	upper := strings.ToUpper(content)
	patterns := []string{
		"DROP TABLE", "DROP DATABASE", "INSERT INTO", "DELETE FROM",
		"UPDATE SET", "UNION SELECT", "EXEC(", "EXECUTE(",
		"1=1", "1=2", "' OR '1'='1", "\" OR \"1\"=\"1",
	}
	for _, p := range patterns {
		if strings.Contains(upper, p) {
			return true
		}
	}
	return false
}
