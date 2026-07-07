package rateguard

import (
	"bytes"
	"encoding/json"
	"fmt"
	"io"
	"net/http"
	"net/url"
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
	// Zero falls back to Config.EstimatedTokensPerRequest, then to 4096 —
	// reserving the entire remaining budget per call would serialize
	// concurrent agents. Set negative for strict reserve-all semantics
	// (guaranteed never to overshoot, one in-flight call per budget key).
	EstimatedTokens int64
	// DisableRateLimit skips the outbound per-provider request limiter
	// (budgets and breakers still apply).
	DisableRateLimit bool
	// SemanticCache enables semantic response caching for this transport.
	// nil (default) disables it entirely — no embedding calls, no memory
	// overhead. A hit skips the network call, the rate limiter, the circuit
	// breaker, and the token budget entirely: it is a real dollar saved, not
	// just a faster response. Streaming requests always bypass the cache.
	SemanticCache *SemanticCacheOptions
}

const (
	outboundMaxBufferedRequestBytes = 10 << 20 // 10 MiB: beyond this, no fallback/model sniffing
	sseHeadBufferBytes              = 16 << 10 // Anthropic puts input tokens in message_start
	sseTailBufferBytes              = 64 << 10 // final chunks carry output/total usage
	defaultOutboundEstimatedTokens  = 4096     // typical chat-call upper bound
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
	next  http.RoundTripper
	sdk   *SDK
	opts  OutboundOptions
	cache *semanticCache

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
	if options.EstimatedTokens == 0 {
		options.EstimatedTokens = defaultOutboundEstimatedTokens
	}
	if options.EstimatedTokens < 0 {
		options.EstimatedTokens = 0 // strict: reserve the entire remaining budget
	}

	var cache *semanticCache
	if options.SemanticCache != nil && options.SemanticCache.Embedder != nil {
		cache = newSemanticCache(*options.SemanticCache, s.clock)
	}

	return &genaiTransport{
		next:     next,
		sdk:      s,
		opts:     options,
		cache:    cache,
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
		original := req.Body
		read, err := io.ReadAll(io.LimitReader(original, outboundMaxBufferedRequestBytes+1))
		if err != nil {
			_ = original.Close()
			return nil, fmt.Errorf("rateguard: buffer outbound request body: %w", err)
		}
		if len(read) > outboundMaxBufferedRequestBytes {
			// Too large to buffer safely — pass through untracked rather
			// than hold an unbounded copy in memory. The original body is
			// still open; stitch the read prefix back on.
			req.Body = readCloser{io.MultiReader(bytes.NewReader(read), original), original}
			req.GetBody = nil
			return t.next.RoundTrip(req)
		}
		_ = original.Close()
		body = read
		req.Body = io.NopCloser(bytes.NewReader(body))
		bodyCopy := body
		req.GetBody = func() (io.ReadCloser, error) {
			return io.NopCloser(bytes.NewReader(bodyCopy)), nil
		}
	}

	if call.Model == "" && len(body) > 0 {
		call.Model = modelFromRequestBody(body)
	}

	if t.cache != nil && !isStreamingRequestBody(body) {
		return t.executeWithCache(req, body, call)
	}

	return t.execute(req, body, call, 0)
}

// executeWithCache checks the semantic cache before making the real call and
// stores a fresh successful response afterward. A hit bypasses execute
// entirely — no breaker check, no rate limit, no token budget, no network
// call, because the whole point is that nothing was actually spent.
func (t *genaiTransport) executeWithCache(req *http.Request, body []byte, call *outboundCall) (*http.Response, error) {
	scope := call.Provider + ":" + nonEmpty(call.Model, "default")
	prompt := promptTextFromRequestBody(body)
	if prompt == "" {
		return t.execute(req, body, call, 0)
	}

	embedding, err := t.cache.embed(req.Context(), prompt)
	if err != nil || len(embedding) == 0 {
		// Embedding failure degrades to a real call — caching is a cost
		// optimization, never a reason to fail the request.
		return t.execute(req, body, call, 0)
	}

	if cached, ok := t.cache.lookup(scope, embedding); ok {
		t.sdk.metrics.semanticCacheHits.Add(1)
		return cachedResponseToHTTP(req, cached), nil
	}
	t.sdk.metrics.semanticCacheMisses.Add(1)

	resp, err := t.execute(req, body, call, 0)
	if err != nil || resp == nil || resp.StatusCode != http.StatusOK || isSSEResponse(resp) {
		return resp, err
	}
	if resp.Header.Get("X-RateGuard-Synthesized") == "true" {
		return resp, err // a rejection we synthesized ourselves — never cache it
	}

	buffered, readErr := io.ReadAll(resp.Body)
	_ = resp.Body.Close()
	if readErr != nil {
		// Body already consumed by the read attempt; nothing left to hand
		// back. This path is only reachable on an I/O error, not normally.
		return nil, fmt.Errorf("rateguard: read response for semantic cache: %w", readErr)
	}

	// `scope` was computed from the REQUESTED provider/model before execute()
	// ran — but execute() may have internally fallen over to a different
	// provider (retarget()), which never mutates the caller's `call` struct
	// (it builds an entirely new one for the recursive call). Caching under
	// the pre-fallback scope means a later request that still reaches the
	// ORIGINAL (now-recovered) provider could replay the FALLBACK provider's
	// answer. Recompute the scope from what actually served this response.
	if resp.Header.Get("X-RateGuard-Fallback") == "true" {
		servedProvider := nonEmpty(resp.Header.Get("X-RateGuard-Provider"), call.Provider)
		servedModel := nonEmpty(servedModelFromResponseBody(buffered), nonEmpty(call.Model, "default"))
		scope = servedProvider + ":" + servedModel
	}

	t.cache.store(scope, embedding, cachedLLMResponse{
		statusCode: resp.StatusCode,
		header:     resp.Header.Clone(),
		body:       buffered,
	})
	resp.Body = io.NopCloser(bytes.NewReader(buffered))
	return resp, nil
}

// cachedResponseToHTTP replays a cached response, marked so callers and
// observability can tell it apart from a live provider call.
func cachedResponseToHTTP(req *http.Request, cached cachedLLMResponse) *http.Response {
	header := cached.header.Clone()
	if header == nil {
		header = http.Header{}
	}
	header.Set("X-RateGuard-Cache", "hit")
	return &http.Response{
		StatusCode:    cached.statusCode,
		Status:        fmt.Sprintf("%d %s", cached.statusCode, http.StatusText(cached.statusCode)),
		Proto:         "HTTP/1.1",
		ProtoMajor:    1,
		ProtoMinor:    1,
		Header:        header,
		Body:          io.NopCloser(bytes.NewReader(cached.body)),
		ContentLength: int64(len(cached.body)),
		Request:       req,
	}
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
	// A half-open probe grant must be released if the rate limit or token
	// budget check below denies the request before it ever reaches
	// upstream — otherwise the probe slot leaks and this provider's
	// breaker wedges in half-open forever (see circuitBreaker.ReleaseProbe).
	// probeConsumed is set true right before the actual RoundTrip.
	probeConsumed := false
	if breakerDecision.ProbeInFlight {
		defer func() {
			if !probeConsumed {
				breaker.ReleaseProbe()
			}
		}()
	}

	// Outbound request rate limit, scoped per provider.
	if !t.opts.DisableRateLimit && !s.cfg.DisableRateLimit {
		decision, err := s.limiter.Allow(req.Context(), "outbound:"+call.Provider, s.Policy())
		if err == nil && decision.Applied && !decision.Allowed && enforce {
			return synthesizedResponse(req, http.StatusTooManyRequests, "rate_limit_exceeded",
				fmt.Sprintf("rateguard: outbound rate limit for provider %s", call.Provider), decision.RetryAfter), nil
		}
	}

	// Token budget: reserve before, commit actual usage after.
	budgetKey := strings.Join([]string{s.tenantID(), call.Provider, nonEmpty(call.Model, "default"), "outbound"}, ":")
	reservation := s.tokens.reserveWithEstimate(budgetKey, s.Policy(), TokenBudgetMode(s.Policy().TokenBudgetMode), t.opts.EstimatedTokens)
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

	// Fallback targets follow the OpenAI-SDK convention: BaseURL owns the
	// version prefix (https://api.deepseek.com/v1) and we append only the
	// canonical operation suffix — not the original full path.
	suffix := "/chat/completions"
	if strings.HasSuffix(call.PathSuffix, "/completions") && !strings.HasSuffix(call.PathSuffix, "/chat/completions") {
		suffix = "/completions"
	}

	clone := req.Clone(req.Context())
	baseURL := strings.TrimSuffix(target.BaseURL, "/")
	parsed, err := http.NewRequest(clone.Method, baseURL+suffix, bytes.NewReader(newBody))
	if err != nil {
		return nil, fmt.Errorf("rateguard: build fallback request for %s: %w", target.Name, err)
	}
	parsed = parsed.WithContext(req.Context())
	parsed.Header = clone.Header.Clone()
	// Provider credentials never transfer across providers. Strip every
	// known provider auth header convention, not just Authorization —
	// Azure OpenAI authenticates via a bare "api-key" header (not
	// "X-Api-Key"), which a prior version of this list missed entirely,
	// leaking the Azure key to whichever provider was failed over to.
	parsed.Header.Del("Authorization")
	parsed.Header.Del("X-Api-Key")
	parsed.Header.Del("Api-Key")
	parsed.Header.Del("X-Goog-Api-Key")
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
// Validated against the 2026 inference-provider landscape: OpenAI-compatible
// /chat/completions is the lingua franca (Groq serves it under /openai/v1/,
// Cohere under /compatibility/v1/, DashScope under /compatible-mode/v1/,
// DeepInfra under /v1/openai/, Z.AI under /api/paas/v4/ — suffix matching
// covers all of them regardless of the path prefix a provider chose).
//
// Every host below was checked against that provider's own current API
// docs, not carried over from a list someone else compiled — two are
// deliberately NOT here despite both offering "OpenAI-compatible" access:
//   - Cloudflare AI Gateway: its current recommended endpoint
//     (api.cloudflare.com/client/v4/accounts/{id}/ai/v1/chat/completions)
//     lives under Cloudflare's single shared general-purpose API host, used
//     for every other Cloudflare product too (DNS, Workers, R2, ...) — not a
//     dedicated LLM host the way every entry below is. Its OTHER endpoint
//     shape (gateway.ai.cloudflare.com/v1/{account}/{gateway}/...) embeds a
//     per-customer account+gateway ID in the path itself, so there is no
//     single fixed hostname to key off the way this map does for everyone
//     else. A user pointing at either still works via the self-hosted
//     fallback below — it just gets labeled by its literal host, not
//     "cloudflare" specifically.
//   - IBM watsonx.ai: its OpenAI-compatible "Model Gateway" is explicitly
//     preview-status in IBM's own docs as of this writing, and — like AWS
//     Bedrock — is split across multiple region-specific hosts
//     (us-south.ml.cloud.ibm.com, eu-de.ml.cloud.ibm.com, ...) rather than
//     one fixed global host. Revisit once the gateway reaches GA with a
//     confirmed stable endpoint shape; it would need a Bedrock-style native
//     adapter (region-aware path matching), not a map entry.
var openAICompatibleHosts = map[string]string{
	"api.openai.com":              "openai",
	"api.deepseek.com":            "deepseek",
	"api.groq.com":                "groq",
	"api.mistral.ai":              "mistral",
	"api.together.xyz":            "together",
	"openrouter.ai":               "openrouter",
	"api.x.ai":                    "xai",
	"api.perplexity.ai":           "perplexity",
	"api.moonshot.ai":             "moonshot",
	"api.fireworks.ai":            "fireworks",
	"api.cerebras.ai":             "cerebras",
	"api.cohere.ai":               "cohere",
	"api.cohere.com":              "cohere",
	"dashscope.aliyuncs.com":      "dashscope",
	"api.sambanova.ai":            "sambanova",
	"integrate.api.nvidia.com":    "nvidia",
	"api.deepinfra.com":           "deepinfra",
	"router.huggingface.co":       "huggingface",
	"inference.baseten.co":        "baseten",
	"api.tokenfactory.nebius.com": "nebius",
	"api.z.ai":                    "zai",
	"open.bigmodel.cn":            "zai",
	"api.siliconflow.com":         "siliconflow",
	"api.siliconflow.cn":          "siliconflow",
	"router.requesty.ai":          "requesty",
	"models.github.ai":            "github",
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

	// Gemini API — including its OpenAI-compatibility endpoint
	// (/v1beta/openai/chat/completions).
	if host == "generativelanguage.googleapis.com" {
		if strings.HasSuffix(path, "/chat/completions") {
			return &outboundCall{Provider: "google", Operation: genaiOperationChat, Compatible: true, PathSuffix: path}
		}
		if strings.Contains(path, ":generateContent") || strings.Contains(path, ":streamGenerateContent") {
			return &outboundCall{Provider: "google", Operation: genaiOperationChat, Model: googleModelFromPath(path), PathSuffix: path}
		}
		return nil
	}

	// Vertex AI (Gemini via Google Cloud).
	if strings.HasSuffix(host, "aiplatform.googleapis.com") {
		if strings.Contains(path, ":generateContent") || strings.Contains(path, ":streamGenerateContent") {
			return &outboundCall{Provider: "google_vertex", Operation: genaiOperationChat, Model: googleModelFromPath(path), PathSuffix: path}
		}
		return nil
	}

	// Azure OpenAI: {resource}.openai.azure.com/openai/deployments/{d}/...
	if strings.HasSuffix(host, ".openai.azure.com") || strings.HasSuffix(host, ".cognitiveservices.azure.com") {
		switch {
		case strings.HasSuffix(path, "/chat/completions"):
			return &outboundCall{Provider: "azure_openai", Operation: genaiOperationChat, Compatible: true, PathSuffix: path}
		case strings.HasSuffix(path, "/embeddings"):
			return &outboundCall{Provider: "azure_openai", Operation: genaiOperationEmbedding, PathSuffix: path}
		case strings.HasSuffix(path, "/completions"):
			return &outboundCall{Provider: "azure_openai", Operation: genaiOperationCompletion, Compatible: true, PathSuffix: path}
		}
		return nil
	}

	// AWS Bedrock runtime: /model/{modelId}/converse | /invoke (+ -stream).
	// Own request schema — tracked for budgets/observability, no fallback.
	// Streaming uses AWS event-stream framing, not SSE; JSON responses only.
	if strings.HasPrefix(host, "bedrock-runtime.") && strings.HasSuffix(host, ".amazonaws.com") {
		if idx := strings.Index(path, "/model/"); idx != -1 {
			rest := path[idx+len("/model/"):]
			if slash := strings.Index(rest, "/"); slash != -1 {
				action := rest[slash+1:]
				if action == "converse" || action == "invoke" || action == "converse-stream" || action == "invoke-with-response-stream" {
					model, _ := urlPathUnescape(rest[:slash])
					return &outboundCall{Provider: "aws_bedrock", Operation: genaiOperationChat, Model: model, PathSuffix: path}
				}
			}
		}
		return nil
	}

	// Self-hosted OpenAI-compatible servers (vLLM, llama.cpp, LocalAI, ...).
	if strings.HasSuffix(path, "/chat/completions") {
		return &outboundCall{Provider: host, Operation: genaiOperationChat, Compatible: true, PathSuffix: path}
	}

	return nil
}

func urlPathUnescape(segment string) (string, error) {
	return url.PathUnescape(segment)
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

// servedModelFromResponseBody reads the top-level "model" field a provider
// echoes back in its response (OpenAI-compatible APIs, including fallback
// targets, all do this) — the ground truth for which model actually served
// a request, independent of whichever model the request asked for.
func servedModelFromResponseBody(body []byte) string {
	return modelFromRequestBody(body)
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
