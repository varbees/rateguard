package rateguard

import (
	"bytes"
	"encoding/json"
	"fmt"
	"io"
	"net/http"
	"strconv"
	"strings"
	"sync"
)

// ── Outbound GenAI transport ──
//
// Inbound middleware guards your API. Real LLM spend happens on OUTBOUND
// calls to provider APIs — calls the middleware never sees. GenAI transport
// wraps the http.RoundTripper that every LLM SDK already uses:
//
//	client := rg.WrapClient(&http.Client{})           // one line
//	openai := openai.NewClient(option.WithHTTPClient(client))
//
// Every LLM call through the wrapped client is budgeted, breaker-protected,
// traced (gen_ai.* spans with REAL token usage), and metered — with optional
// fallback across OpenAI-compatible providers. No proxy hop; runs in-process.
//
// Honest scope: automatic fallback only applies to OpenAI-compatible
// endpoints (same request schema — DeepSeek, Groq, Mistral, Together,
// OpenRouter, vLLM, ...). Cross-schema fallback (OpenAI → Anthropic native)
// is impossible at the transport layer and is NOT claimed.

// OutboundMode controls what happens when a limit says no.
type OutboundMode string

const (
	// OutboundModeEnforce synthesizes 429/503 responses when budgets are
	// exhausted or breakers are open. Provider SDK retry logic handles them
	// exactly as it would a real provider rejection.
	OutboundModeEnforce OutboundMode = "enforce"
	// OutboundModeObserve never blocks — it only meters, traces, and records.
	OutboundModeObserve OutboundMode = "observe"
)

// OutboundOptions configures the GenAI transport.
type OutboundOptions struct {
	// Mode defaults to enforce.
	Mode OutboundMode
	// Chain enables automatic fallback across OpenAI-compatible providers.
	// Entries are tried in order when a provider fails (429/5xx/breaker open).
	Chain *ProviderChain
	// EstimatedTokens bounds the per-call hard-stop budget reservation.
	// Zero falls back to Config.EstimatedTokensPerRequest.
	EstimatedTokens int64
	// DisableRateLimit skips the outbound per-provider request limiter
	// (budgets and breakers still apply).
	DisableRateLimit bool
}

const (
	outboundMaxBufferedRequestBytes = 10 << 20 // 10 MiB: beyond this, no fallback/model sniffing
	sseHeadBufferBytes              = 16 << 10 // Anthropic puts input tokens in message_start
	sseTailBufferBytes              = 64 << 10 // final chunks carry output/total usage
)

// outboundCall is what provider detection learned about a request.
type outboundCall struct {
	Provider   string
	Model      string
	Operation  string
	Compatible bool // OpenAI-compatible request schema (fallback-safe)
	PathSuffix string
}

type genaiTransport struct {
	next http.RoundTripper
	sdk  *SDK
	opts OutboundOptions

	mu       sync.Mutex
	breakers map[string]*circuitBreaker
}

// Transport wraps an http.RoundTripper with outbound GenAI tracking.
// Pass nil to wrap http.DefaultTransport.
func (s *SDK) Transport(next http.RoundTripper, opts ...OutboundOptions) http.RoundTripper {
	if next == nil {
		next = http.DefaultTransport
	}
	var options OutboundOptions
	if len(opts) > 0 {
		options = opts[0]
	}
	if options.Mode == "" {
		options.Mode = OutboundModeEnforce
	}
	if options.EstimatedTokens == 0 {
		options.EstimatedTokens = s.cfg.EstimatedTokensPerRequest
	}
	return &genaiTransport{
		next:     next,
		sdk:      s,
		opts:     options,
		breakers: make(map[string]*circuitBreaker),
	}
}

// WrapClient returns a copy of client whose transport tracks outbound LLM
// calls. Pass nil for a fresh client.
func (s *SDK) WrapClient(client *http.Client, opts ...OutboundOptions) *http.Client {
	if client == nil {
		client = &http.Client{}
	}
	wrapped := *client
	wrapped.Transport = s.Transport(client.Transport, opts...)
	return &wrapped
}

func (t *genaiTransport) breakerFor(provider string) *circuitBreaker {
	t.mu.Lock()
	defer t.mu.Unlock()
	breaker, ok := t.breakers[provider]
	if !ok {
		breaker = newCircuitBreaker(t.sdk.clock, t.sdk.cfg.CircuitBreaker)
		t.breakers[provider] = breaker
	}
	return breaker
}

func (t *genaiTransport) RoundTrip(req *http.Request) (*http.Response, error) {
	call := detectLLMCall(req)
	if call == nil {
		return t.next.RoundTrip(req)
	}

	// Buffer the request body: needed for model detection and fallback retry.
	var body []byte
	if req.Body != nil {
		read, err := io.ReadAll(io.LimitReader(req.Body, outboundMaxBufferedRequestBytes+1))
		_ = req.Body.Close()
		if err != nil {
			return nil, fmt.Errorf("rateguard: buffer outbound request body: %w", err)
		}
		if len(read) > outboundMaxBufferedRequestBytes {
			// Too large to buffer safely — pass through untracked rather
			// than hold an unbounded copy in memory.
			req.Body = io.NopCloser(io.MultiReader(bytes.NewReader(read), req.Body))
			return t.next.RoundTrip(req)
		}
		body = read
		req.Body = io.NopCloser(bytes.NewReader(body))
	}

	if call.Model == "" && len(body) > 0 {
		call.Model = modelFromRequestBody(body)
	}

	return t.execute(req, body, call, 0)
}

// execute performs the call against the current provider, falling back
// across the chain on failure when possible.
func (t *genaiTransport) execute(req *http.Request, body []byte, call *outboundCall, depth int) (*http.Response, error) {
	s := t.sdk
	enforce := t.opts.Mode != OutboundModeObserve

	// Per-provider circuit breaker.
	breaker := t.breakerFor(call.Provider)
	breakerDecision := breaker.Allow()
	if !breakerDecision.Allowed {
		if next, ok := t.nextProvider(call, depth); ok {
			return t.retarget(req, body, call, next, depth)
		}
		if enforce {
			return synthesizedResponse(req, http.StatusServiceUnavailable, "circuit_open",
				fmt.Sprintf("rateguard: circuit open for provider %s", call.Provider), breakerDecision.RetryAfter), nil
		}
	}

	// Outbound request rate limit, scoped per provider.
	if !t.opts.DisableRateLimit && !s.cfg.DisableRateLimit {
		decision, err := s.limiter.Allow(req.Context(), "outbound:"+call.Provider, s.policy)
		if err == nil && decision.Applied && !decision.Allowed && enforce {
			return synthesizedResponse(req, http.StatusTooManyRequests, "rate_limit_exceeded",
				fmt.Sprintf("rateguard: outbound rate limit for provider %s", call.Provider), decision.RetryAfter), nil
		}
	}

	// Token budget: reserve before, commit actual usage after.
	budgetKey := strings.Join([]string{s.tenantID(), call.Provider, nonEmpty(call.Model, "default"), "outbound"}, ":")
	reservation := s.tokens.reserveWithEstimate(budgetKey, s.policy, TokenBudgetMode(s.policy.TokenBudgetMode), t.opts.EstimatedTokens)
	if reservation.Applied && !reservation.Allowed && enforce {
		s.metrics.tokenBudgetExhausted.Add(1)
		return synthesizedResponse(req, http.StatusTooManyRequests, "token_budget_exceeded",
			fmt.Sprintf("rateguard: outbound token budget exhausted for %s", call.Provider), reservation.RetryAfter), nil
	}

	ctx, span := s.StartGenAICall(req.Context(), GenAICall{
		Provider:            call.Provider,
		Model:               call.Model,
		Operation:           call.Operation,
		TokenBudgetApplied:  reservation.Applied,
		CircuitBreakerState: string(breakerDecision.State),
	})
	req = req.WithContext(ctx)

	s.metrics.outboundCalls.Add(1)
	resp, err := t.next.RoundTrip(req)

	if err != nil || isProviderFailure(resp.StatusCode) {
		breaker.RecordOutcome(false)
		s.tokens.releaseReservation(budgetKey, reservation.reservationID)

		if next, ok := t.nextProvider(call, depth); ok {
			if resp != nil {
				_ = resp.Body.Close()
			}
			span.End(GenAICall{}, fmt.Errorf("provider %s failed, falling back", call.Provider))
			return t.retarget(req, body, call, next, depth)
		}

		span.End(GenAICall{}, err)
		return resp, err
	}

	if isSSEResponse(resp) {
		resp.Body = newStreamUsageBody(resp.Body, func(usage TokenUsage, chunks int64, ok bool) {
			t.finish(span, breaker, budgetKey, reservation.reservationID, usage, ok)
		}, span)
		return resp, nil
	}

	// Non-streaming: read the (bounded) body to extract real usage, then
	// hand the caller an identical replacement body.
	usage, restored := t.extractJSONUsage(resp)
	resp.Body = restored
	t.finish(span, breaker, budgetKey, reservation.reservationID, usage, usage.TotalTokens > 0)
	return resp, nil
}

// finish commits usage, records the breaker outcome, ends the span, and
// bumps metrics. Shared by the JSON and SSE paths.
func (t *genaiTransport) finish(span *GenAISpan, breaker *circuitBreaker, budgetKey, reservationID string, usage TokenUsage, ok bool) {
	s := t.sdk
	breaker.RecordOutcome(true)
	if ok && usage.TotalTokens > 0 {
		s.tokens.commitReservation(budgetKey, reservationID, usage.TotalTokens)
		s.metrics.tokensConsumed.Add(usage.TotalTokens)
	} else {
		s.tokens.releaseReservation(budgetKey, reservationID)
	}
	span.End(GenAICall{
		Model:            usage.Model,
		Provider:         usage.Provider,
		PromptTokens:     usage.InputTokens,
		CompletionTokens: usage.OutputTokens,
		TotalTokens:      usage.TotalTokens,
	}, nil)
}

// extractJSONUsage reads up to the configured cap from the response body,
// extracts token usage, and returns a replacement body for the caller.
func (t *genaiTransport) extractJSONUsage(resp *http.Response) (TokenUsage, io.ReadCloser) {
	maxBody := t.sdk.cfg.MaxBufferedResponseBytes
	if maxBody <= 0 {
		maxBody = defaultMaxBufferedResponseBytes
	}

	buffered, err := io.ReadAll(io.LimitReader(resp.Body, int64(maxBody)+1))
	if err != nil {
		_ = resp.Body.Close()
		return TokenUsage{}, io.NopCloser(bytes.NewReader(buffered))
	}

	if len(buffered) > maxBody {
		// Over cap: return the full stream to the caller, skip extraction.
		rest := resp.Body
		return TokenUsage{}, readCloser{io.MultiReader(bytes.NewReader(buffered), rest), rest}
	}

	_ = resp.Body.Close()
	usage, _ := extractTokenUsageFromBody(buffered)
	return usage, io.NopCloser(bytes.NewReader(buffered))
}

// nextProvider returns the next fallback target when the chain allows it.
// Fallback requires an OpenAI-compatible schema and a buffered body.
func (t *genaiTransport) nextProvider(call *outboundCall, depth int) (ProviderEntry, bool) {
	if t.opts.Chain == nil || !call.Compatible {
		return ProviderEntry{}, false
	}
	providers := t.opts.Chain.Providers()
	next := depth + 1
	if next >= len(providers) {
		return ProviderEntry{}, false
	}
	return providers[next], true
}

// retarget rewrites the request against an OpenAI-compatible fallback
// provider (base URL + auth headers + model override) and re-executes.
func (t *genaiTransport) retarget(req *http.Request, body []byte, call *outboundCall, target ProviderEntry, depth int) (*http.Response, error) {
	t.sdk.metrics.outboundFallbacks.Add(1)

	newBody := body
	if target.Model != "" && len(body) > 0 {
		if rewritten, ok := overrideModelInBody(body, target.Model); ok {
			newBody = rewritten
		}
	}

	clone := req.Clone(req.Context())
	baseURL := strings.TrimSuffix(target.BaseURL, "/")
	parsed, err := http.NewRequest(clone.Method, baseURL+call.PathSuffix, bytes.NewReader(newBody))
	if err != nil {
		return nil, fmt.Errorf("rateguard: build fallback request for %s: %w", target.Name, err)
	}
	parsed = parsed.WithContext(req.Context())
	parsed.Header = clone.Header.Clone()
	// Provider credentials never transfer across providers.
	parsed.Header.Del("Authorization")
	parsed.Header.Del("X-Api-Key")
	for key, value := range target.Headers {
		parsed.Header.Set(key, value)
	}
	parsed.Header.Set("X-RateGuard-Fallback-From", call.Provider)
	parsed.ContentLength = int64(len(newBody))

	nextCall := &outboundCall{
		Provider:   target.Name,
		Model:      nonEmpty(target.Model, call.Model),
		Operation:  call.Operation,
		Compatible: true,
		PathSuffix: call.PathSuffix,
	}

	resp, err := t.execute(parsed, newBody, nextCall, depth+1)
	if resp != nil {
		resp.Header.Set("X-RateGuard-Fallback", "true")
		resp.Header.Set("X-RateGuard-Provider", target.Name)
	}
	return resp, err
}

// ── Provider detection ──

// openAICompatibleHosts maps known OpenAI-schema hosts to provider labels.
var openAICompatibleHosts = map[string]string{
	"api.openai.com":     "openai",
	"api.deepseek.com":   "deepseek",
	"api.groq.com":       "groq",
	"api.mistral.ai":     "mistral",
	"api.together.xyz":   "together",
	"openrouter.ai":      "openrouter",
	"api.x.ai":           "xai",
	"api.perplexity.ai":  "perplexity",
	"api.moonshot.ai":    "moonshot",
	"api.fireworks.ai":   "fireworks",
}

// detectLLMCall classifies an outbound request. Returns nil for non-LLM
// traffic, which passes through untouched.
func detectLLMCall(req *http.Request) *outboundCall {
	if req == nil || req.URL == nil {
		return nil
	}
	host := req.URL.Hostname()
	path := req.URL.Path

	if provider, ok := openAICompatibleHosts[host]; ok {
		switch {
		case strings.HasSuffix(path, "/chat/completions"):
			return &outboundCall{Provider: provider, Operation: genaiOperationChat, Compatible: true, PathSuffix: path}
		case strings.HasSuffix(path, "/responses"):
			return &outboundCall{Provider: provider, Operation: genaiOperationChat, PathSuffix: path}
		case strings.HasSuffix(path, "/embeddings"):
			return &outboundCall{Provider: provider, Operation: genaiOperationEmbedding, PathSuffix: path}
		case strings.HasSuffix(path, "/completions"):
			return &outboundCall{Provider: provider, Operation: genaiOperationCompletion, Compatible: true, PathSuffix: path}
		}
		return nil
	}

	if host == "api.anthropic.com" && strings.HasSuffix(path, "/messages") {
		return &outboundCall{Provider: "anthropic", Operation: genaiOperationChat, PathSuffix: path}
	}

	if host == "generativelanguage.googleapis.com" {
		if idx := strings.Index(path, ":generateContent"); idx == -1 {
			if idx = strings.Index(path, ":streamGenerateContent"); idx == -1 {
				return nil
			}
		}
		return &outboundCall{Provider: "google", Operation: genaiOperationChat, Model: googleModelFromPath(path), PathSuffix: path}
	}

	// Self-hosted OpenAI-compatible servers (vLLM, llama.cpp, LocalAI, ...).
	if strings.HasSuffix(path, "/chat/completions") {
		return &outboundCall{Provider: host, Operation: genaiOperationChat, Compatible: true, PathSuffix: path}
	}

	return nil
}

func googleModelFromPath(path string) string {
	const marker = "/models/"
	idx := strings.Index(path, marker)
	if idx == -1 {
		return ""
	}
	rest := path[idx+len(marker):]
	if colon := strings.Index(rest, ":"); colon != -1 {
		return rest[:colon]
	}
	return rest
}

func modelFromRequestBody(body []byte) string {
	var payload struct {
		Model string `json:"model"`
	}
	if err := json.Unmarshal(body, &payload); err != nil {
		return ""
	}
	return strings.TrimSpace(payload.Model)
}

func overrideModelInBody(body []byte, model string) ([]byte, bool) {
	var payload map[string]json.RawMessage
	if err := json.Unmarshal(body, &payload); err != nil {
		return nil, false
	}
	encoded, err := json.Marshal(model)
	if err != nil {
		return nil, false
	}
	payload["model"] = encoded
	rewritten, err := json.Marshal(payload)
	if err != nil {
		return nil, false
	}
	return rewritten, true
}

func isProviderFailure(statusCode int) bool {
	return statusCode == http.StatusTooManyRequests || statusCode >= http.StatusInternalServerError
}

func isSSEResponse(resp *http.Response) bool {
	return strings.HasPrefix(resp.Header.Get("Content-Type"), "text/event-stream")
}

func nonEmpty(value, fallback string) string {
	if value != "" {
		return value
	}
	return fallback
}

// synthesizedResponse builds an HTTP response that looks like a provider
// rejection, so SDK retry/backoff logic handles RateGuard limits natively.
func synthesizedResponse(req *http.Request, statusCode int, code, message string, retryAfter interface{ Seconds() float64 }) *http.Response {
	payload := fmt.Sprintf(`{"error":{"type":%q,"message":%q,"source":"rateguard"}}`, code, message)
	header := http.Header{}
	header.Set("Content-Type", "application/json")
	header.Set("X-RateGuard-Synthesized", "true")
	if retryAfter != nil && retryAfter.Seconds() > 0 {
		header.Set("Retry-After", strconv.FormatInt(int64(retryAfter.Seconds()+0.999), 10))
	}
	return &http.Response{
		StatusCode:    statusCode,
		Status:        fmt.Sprintf("%d %s", statusCode, http.StatusText(statusCode)),
		Proto:         "HTTP/1.1",
		ProtoMajor:    1,
		ProtoMinor:    1,
		Header:        header,
		Body:          io.NopCloser(strings.NewReader(payload)),
		ContentLength: int64(len(payload)),
		Request:       req,
	}
}

type readCloser struct {
	io.Reader
	io.Closer
}
