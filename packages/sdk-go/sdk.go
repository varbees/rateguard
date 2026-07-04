package rateguard

import (
	"bufio"
	"bytes"
	"context"
	"errors"
	"io"
	"log"
	"net"
	"net/http"
	"strconv"
	"strings"
	"time"
)

// defaultMaxBufferedResponseBytes caps response body buffering for token
// usage extraction. Streaming LLM responses can be arbitrarily large;
// buffering them whole would defeat the zero-overhead positioning.
const defaultMaxBufferedResponseBytes = 1 << 20 // 1 MiB

// SDK is the top-level middleware entrypoint.
type SDK struct {
	cfg      Config
	policy   PolicyPreset
	limiter  Limiter
	adaptive *AdaptiveLimiter
	breaker  *circuitBreaker
	tokens   *tokenBudgetManager
	extract  TokenUsageExtractor
	waiter   BudgetWaiter
	otel     *observability
	emitter  EventEmitter
	clock    Clock
	metrics  atomicMetrics
	loops    *LoopDetector
}

// New constructs a new SDK instance with sensible defaults.
func New(cfg Config) *SDK {
	clock := cfg.Clock
	if clock == nil {
		clock = systemClock{}
	}

	policy := PresetPolicy(cfg.Preset)
	if cfg.RequestsPerSecond > 0 {
		policy.RequestsPerSecond = cfg.RequestsPerSecond
	}
	if cfg.Burst > 0 {
		policy.Burst = cfg.Burst
	}
	if cfg.TokenBudgetPerHour > 0 {
		policy.TokenBudgetPerHour = cfg.TokenBudgetPerHour
	}
	if cfg.TokenBudgetPerDay > 0 {
		policy.TokenBudgetPerDay = cfg.TokenBudgetPerDay
	}
	if cfg.TokenBudgetPerMonth > 0 {
		policy.TokenBudgetPerMonth = cfg.TokenBudgetPerMonth
		policy.MaxTokensPerMonth = cfg.TokenBudgetPerMonth
	}
	if cfg.TokenBudgetMode != "" {
		policy.TokenBudgetMode = NormalizeTokenBudgetMode(string(cfg.TokenBudgetMode))
	}
	if policy.TokenBudgetMode == "" {
		policy.TokenBudgetMode = TokenBudgetModeHardStop
	}

	cfg.Preset = policy.Name

	var limiter Limiter
	switch {
	case cfg.DisableRateLimit:
		limiter = NoopLimiter{}
	case cfg.RedisClient != nil:
		limiter = newRedisGCRALimiterWithClock(cfg.RedisClient, clock)
	default:
		// Lock-free sharded limiter: decision-parity with MemoryLimiter,
		// ~2× faster on a hot key and ~3.4× across many keys under
		// parallel load (see sharded_limiter_test.go benchmarks).
		limiter = newShardedLimiterWithClock(clock, defaultMemoryLimiterCacheCapacity)
	}

	var adaptive *AdaptiveLimiter
	if cfg.AdaptiveRateLimit && !cfg.DisableRateLimit {
		adaptive = newAdaptiveLimiterWithClock(limiter, cfg.Adaptive, clock)
		limiter = adaptive
	}

	var emitter EventEmitter
	switch {
	case cfg.EventEmitter != nil:
		emitter = cfg.EventEmitter
	case cfg.EventEndpoint != "":
		emitter = NewHTTPEventEmitter(cfg.EventEndpoint, cfg.HTTPClient)
	default:
		emitter = NoopEmitter{}
	}

	extractor := cfg.TokenUsageExtractor
	if extractor == nil {
		extractor = DefaultTokenUsageExtractor{}
	}

	waiter := cfg.BudgetWaiter
	if waiter == nil {
		waiter = systemBudgetWaiter{}
	}

	otel, err := newObservability(cfg)
	if err != nil {
		log.Printf("rateguard: initialize observability: %v", err)
		otel = &observability{}
	}

	return &SDK{
		cfg:      cfg,
		policy:   policy,
		limiter:  limiter,
		adaptive: adaptive,
		breaker:  newCircuitBreaker(clock, cfg.CircuitBreaker),
		tokens:   newTokenBudgetManager(clock),
		extract:  extractor,
		waiter:   waiter,
		otel:     otel,
		emitter:  emitter,
		clock:    clock,
		loops:    NewLoopDetector(cfg.LoopMaxDepth),
	}
}

// Shutdown flushes any queued telemetry exporters.
func (s *SDK) Shutdown(ctx context.Context) error {
	if s == nil || s.otel == nil {
		return nil
	}
	return s.otel.Shutdown(ctx)
}

// Policy returns the resolved policy preset for this SDK instance.
func (s *SDK) Policy() PolicyPreset {
	return s.policy
}

// AdaptiveRateLimitFactor reports the adaptive controller's current policy
// scaling factor and error-rate EMA. enabled is false (factor 1.0, rate 0)
// when Config.AdaptiveRateLimit was not set — there is nothing to observe.
func (s *SDK) AdaptiveRateLimitFactor() (factor float64, errorRate float64, enabled bool) {
	if s.adaptive == nil {
		return 1.0, 0, false
	}
	return s.adaptive.Factor(), s.adaptive.ErrorRate(), true
}

// HTTPMiddleware wraps a net/http handler with in-process admission control.
func (s *SDK) HTTPMiddleware(next http.Handler) http.Handler {
	if next == nil {
		next = http.HandlerFunc(func(http.ResponseWriter, *http.Request) {})
	}

	return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		s.handleHTTP(w, r, next)
	})
}

// ChiMiddleware returns the standard chi middleware shape.
func (s *SDK) ChiMiddleware() func(http.Handler) http.Handler {
	return func(next http.Handler) http.Handler {
		return s.HTTPMiddleware(next)
	}
}

// Middleware is a convenience alias for ChiMiddleware so quickstarts can use the shorter naming.
func (s *SDK) Middleware() func(http.Handler) http.Handler {
	return s.ChiMiddleware()
}

func (s *SDK) handleHTTP(w http.ResponseWriter, r *http.Request, next http.Handler) {
	start := s.clock.Now()
	s.metrics.totalRequests.Add(1)
	key := s.admissionKey(r)
	traceCtx := traceContextFromHeaders(r.Header)
	breakerDecision := s.breaker.Allow()
	attrs := requestAttributes(
		s.tenantID(),
		s.routeID(r),
		s.upstreamID(),
		true,
		string(breakerDecision.State),
		0,
	)
	traceCtx, span := s.otel.startRequestSpan(traceCtx, attrs)
	defer span.End()
	r = r.WithContext(traceCtx)

	if !breakerDecision.Allowed {
		s.writeCircuitBreakerResponse(w, breakerDecision)
		decision := AdmissionDecision{Allowed: false, Applied: false}
		s.emitRequestEvent(r.Context(), r, decision, http.StatusServiceUnavailable, start, TokenUsage{}, tokenBudgetDecision{}, breakerDecision.State, breakerDecision.RetryAfter)
		s.otel.recordRequest(r.Context(), requestAttributes(s.tenantID(), s.routeID(r), s.upstreamID(), false, string(breakerDecision.State), 0), s.clock.Now().Sub(start), http.StatusServiceUnavailable)
		return
	}

	decision, err := s.limiter.Allow(r.Context(), key, s.policy)
	if err != nil {
		decision = AdmissionDecision{Allowed: false, Applied: false, Remaining: 0, Limit: s.policy.RequestsPerSecond}
		s.applyHeaders(w.Header(), decision)
		s.writeRateLimitUnavailableResponse(w)
		s.emitRequestEvent(r.Context(), r, decision, http.StatusServiceUnavailable, start, TokenUsage{}, tokenBudgetDecision{}, breakerDecision.State, 0)
		s.otel.recordRequest(r.Context(), requestAttributes(s.tenantID(), s.routeID(r), s.upstreamID(), false, string(breakerDecision.State), 0), s.clock.Now().Sub(start), http.StatusServiceUnavailable)
		log.Printf("rateguard: rate limiter unavailable: %v", err)
		return
	}
	s.applyHeaders(w.Header(), decision)

	if !decision.Allowed {
		s.metrics.rateLimitHits.Add(1)
		s.writeRateLimitResponse(w)
		s.emitRequestEvent(r.Context(), r, decision, http.StatusTooManyRequests, start, TokenUsage{}, tokenBudgetDecision{}, breakerDecision.State, decision.RetryAfter)
		s.otel.recordRequest(r.Context(), requestAttributes(s.tenantID(), s.routeID(r), s.upstreamID(), decision.Applied, string(breakerDecision.State), 0), s.clock.Now().Sub(start), http.StatusTooManyRequests)
		return
	}

	// Agent loop detection + content guardrails inspect the request body.
	if blocked := s.checkRequestBody(w, r); blocked {
		s.otel.recordRequest(r.Context(), requestAttributes(s.tenantID(), s.routeID(r), s.upstreamID(), decision.Applied, string(breakerDecision.State), 0), s.clock.Now().Sub(start), http.StatusUnprocessableEntity)
		return
	}

	tokenKey := s.tokenBudgetKey(r)
	tokenDecision, err := s.tokens.waitForAvailability(r.Context(), tokenKey, s.policy, s.waiter, TokenBudgetMode(s.policy.TokenBudgetMode), s.cfg.EstimatedTokensPerRequest)
	if err != nil {
		s.writeTokenBudgetResponse(w)
		s.emitRequestEvent(r.Context(), r, decision, http.StatusTooManyRequests, start, TokenUsage{}, tokenDecision, breakerDecision.State, tokenDecision.RetryAfter)
		s.otel.recordRequest(r.Context(), requestAttributes(s.tenantID(), s.routeID(r), s.upstreamID(), decision.Applied, string(breakerDecision.State), 0), s.clock.Now().Sub(start), http.StatusTooManyRequests)
		return
	}
	if !tokenDecision.Allowed && tokenDecision.Applied && TokenBudgetMode(s.policy.TokenBudgetMode) != TokenBudgetModeSoftStop {
		s.metrics.tokenBudgetExhausted.Add(1)
		s.writeTokenBudgetResponse(w)
		s.emitRequestEvent(r.Context(), r, decision, http.StatusTooManyRequests, start, TokenUsage{}, tokenDecision, breakerDecision.State, tokenDecision.RetryAfter)
		s.otel.recordRequest(r.Context(), requestAttributes(s.tenantID(), s.routeID(r), s.upstreamID(), decision.Applied, string(breakerDecision.State), 0), s.clock.Now().Sub(start), http.StatusTooManyRequests)
		return
	}

	maxBody := s.cfg.MaxBufferedResponseBytes
	if maxBody <= 0 {
		maxBody = defaultMaxBufferedResponseBytes
	}
	recorder := &responseRecorder{ResponseWriter: w, maxBody: maxBody}
	next.ServeHTTP(recorder, r)
	snapshot := recorder.snapshot()

	tokenUsage, ok := s.extract.Extract(snapshot)
	if ok {
		s.tokens.commitReservation(tokenKey, tokenDecision.reservationID, tokenUsage.TotalTokens)
	} else {
		s.tokens.releaseReservation(tokenKey, tokenDecision.reservationID)
	}

	finalTokenDecision := s.tokens.check(tokenKey, s.policy)
	finalTokenDecision.Queued = tokenDecision.Queued
	if tokenDecision.RetryAfter > 0 {
		finalTokenDecision.RetryAfter = tokenDecision.RetryAfter
	}

	if tokenUsage.TotalTokens > 0 {
		s.metrics.tokensConsumed.Add(tokenUsage.TotalTokens)
	}

	status := recorder.statusCode()
	if s.adaptive != nil {
		// Same signal the breaker learns from — the adaptive limiter tunes
		// the effective rate limit before the breaker would have to trip.
		s.adaptive.RecordOutcome(status < http.StatusInternalServerError)
	}
	finalBreakerDecision := s.breaker.RecordOutcome(status < http.StatusInternalServerError)
	if breakerDecision.State != CircuitBreakerOpen && finalBreakerDecision.State == CircuitBreakerOpen {
		s.metrics.circuitBreakerTrips.Add(1)
	}
	finalAttrs := requestAttributes(
		s.tenantID(),
		s.routeID(r),
		s.upstreamID(),
		decision.Applied,
		string(finalBreakerDecision.State),
		0,
	)
	s.otel.recordRequest(r.Context(), finalAttrs, s.clock.Now().Sub(start), status)

	s.emitRequestEvent(r.Context(), r, decision, status, start, tokenUsage, finalTokenDecision, finalBreakerDecision.State, finalBreakerDecision.RetryAfter)
}

// maxInspectedBodyBytes bounds how much request body loop detection and
// guardrails read. Bodies beyond the cap are checked on their prefix only.
const maxInspectedBodyBytes = 256 * 1024

// checkRequestBody runs loop detection and guardrails against the request
// body when either is enabled. Returns true if the request was rejected
// (a response has already been written).
func (s *SDK) checkRequestBody(w http.ResponseWriter, r *http.Request) bool {
	loopActive := s.cfg.LoopDetection && s.loops != nil && r.Header.Get("X-Sequence-Depth") != ""
	guardActive := s.cfg.Guardrails != nil && r.Body != nil && r.Method != http.MethodGet && r.Method != http.MethodHead

	if !loopActive && !guardActive {
		return false
	}

	var body []byte
	if r.Body != nil {
		limited := io.LimitReader(r.Body, maxInspectedBodyBytes)
		read, err := io.ReadAll(limited)
		if err != nil {
			log.Printf("rateguard: read request body for inspection: %v", err)
			return false
		}
		body = read
		r.Body = struct {
			io.Reader
			io.Closer
		}{io.MultiReader(bytes.NewReader(read), r.Body), r.Body}
	}

	if loopActive {
		depth, err := strconv.Atoi(strings.TrimSpace(r.Header.Get("X-Sequence-Depth")))
		if err == nil {
			fingerprint := strings.TrimSpace(r.Header.Get("X-Payload-Fingerprint"))
			if fingerprint == "" {
				fingerprint = Fingerprint(r.Method, r.URL.Path, string(body))
			}
			if allowed, reason := s.loops.Check(fingerprint, depth); !allowed {
				writeJSONError(w, http.StatusTooManyRequests, "loop_detected", reason, 0)
				return true
			}
		}
	}

	if guardActive && len(body) > 0 {
		if violation := s.cfg.Guardrails.Check(string(body)); violation != nil {
			WriteGuardrailReject(w, violation)
			return true
		}
	}

	return false
}

func (s *SDK) admissionKey(r *http.Request) string {
	if s.cfg.KeyFunc != nil {
		if key := strings.TrimSpace(s.cfg.KeyFunc(r)); key != "" {
			return key
		}
	}

	tenant := s.cfg.TenantID
	if tenant == "" {
		tenant = "global"
	}
	route := s.cfg.RouteID
	if route == "" {
		route = strings.TrimSpace(r.URL.Path)
	}
	if route == "" {
		route = "root"
	}
	upstream := s.cfg.UpstreamID
	if upstream == "" {
		upstream = "local"
	}

	return strings.Join([]string{tenant, route, upstream, r.Method}, ":")
}

func (s *SDK) applyHeaders(h http.Header, decision AdmissionDecision) {
	h.Set("X-RateGuard-Preset", s.policy.Name)
	h.Set("X-RateGuard-Limit", strconv.Itoa(s.policy.RequestsPerSecond))
	h.Set("X-RateGuard-Burst", strconv.Itoa(s.policy.Burst))
	h.Set("X-RateGuard-Remaining", strconv.Itoa(decision.Remaining))

	// IETF RateLimit headers (draft-ietf-httpapi-ratelimit-headers) so
	// standard clients and SDK retry logic work without RateGuard awareness.
	if decision.Applied {
		h.Set("RateLimit-Limit", strconv.Itoa(decision.Limit))
		remaining := decision.Remaining
		if remaining < 0 {
			remaining = 0
		}
		h.Set("RateLimit-Remaining", strconv.Itoa(remaining))
		h.Set("RateLimit-Reset", strconv.FormatInt(ceilDurationSeconds(decision.RetryAfter), 10))
	}

	if !decision.Allowed && decision.RetryAfter > 0 {
		h.Set("Retry-After", strconv.FormatInt(ceilDurationSeconds(decision.RetryAfter), 10))
	}
}

func (s *SDK) writeRateLimitResponse(w http.ResponseWriter) {
	writeJSONError(w, http.StatusTooManyRequests, "rate_limit_exceeded", "request rejected by RateGuard", 0)
}

func (s *SDK) writeRateLimitUnavailableResponse(w http.ResponseWriter) {
	writeJSONError(w, http.StatusServiceUnavailable, "rate_limit_unavailable", "RateGuard rate limiter unavailable", 0)
}

func (s *SDK) writeTokenBudgetResponse(w http.ResponseWriter) {
	writeJSONError(w, http.StatusTooManyRequests, "token_budget_exceeded", "token budget exhausted by RateGuard", 0)
}

func (s *SDK) writeCircuitBreakerResponse(w http.ResponseWriter, decision CircuitBreakerDecision) {
	writeJSONError(w, http.StatusServiceUnavailable, "circuit_open", "request rejected by RateGuard circuit breaker", decision.RetryAfter)
}

func writeJSONError(w http.ResponseWriter, statusCode int, code string, message string, retryAfter time.Duration) {
	if retryAfter > 0 {
		w.Header().Set("Retry-After", strconv.FormatInt(ceilDurationSeconds(retryAfter), 10))
	}
	w.Header().Set("Content-Type", "application/json")
	w.WriteHeader(statusCode)
	if _, err := w.Write([]byte(`{"error":"` + code + `","message":"` + message + `"}`)); err != nil {
		log.Printf("rateguard: write error response: %v", err)
	}
}

func (s *SDK) emitRequestEvent(ctx context.Context, r *http.Request, decision AdmissionDecision, statusCode int, start time.Time, tokenUsage TokenUsage, tokenDecision tokenBudgetDecision, circuitState CircuitBreakerState, retryAfter time.Duration) {
	if s.emitter == nil {
		return
	}

	now := s.clock.Now()
	latency := now.Sub(start).Milliseconds()
	if latency < 0 {
		latency = 0
	}

	requestID := requestIDFromHeader(r.Header)
	traceID := traceIDFromHeader(r.Header)

	eventType := EventTypeRequestCompleted
	if decision.Applied && !decision.Allowed {
		eventType = EventTypeRequestRateLimited
	}
	if !tokenDecision.Allowed && tokenDecision.Applied && tokenDecision.Window != "" {
		eventType = EventTypeTokenBudgetExceeded
	}
	if retryAfter <= 0 {
		retryAfter = decision.RetryAfter
	}

	event := EventEnvelope{
		EventID:    newEventID(),
		EventType:  eventType,
		TenantID:   s.tenantID(),
		RouteID:    s.routeID(r),
		UpstreamID: s.upstreamID(),
		TraceID:    traceID,
		OccurredAt: now.UTC(),
		Payload: RequestEventPayload{
			RequestID:            requestID,
			Method:               r.Method,
			Path:                 r.URL.Path,
			StatusCode:           statusCode,
			LatencyMS:            latency,
			RateLimitApplied:     decision.Applied,
			RateLimitAllowed:     decision.Allowed,
			RateLimitLimit:       decision.Limit,
			RateLimitRemaining:   decision.Remaining,
			RetryAfterMS:         retryAfter.Milliseconds(),
			Preset:               s.policy.Name,
			CircuitBreakerState:  string(circuitState),
			QueueDepth:           0,
			TokenProvider:        tokenUsage.Provider,
			TokenModel:           tokenUsage.Model,
			TokenInputTokens:     tokenUsage.InputTokens,
			TokenOutputTokens:    tokenUsage.OutputTokens,
			TokenTotalTokens:     tokenUsage.TotalTokens,
			TokenBudgetMode:      string(s.policy.TokenBudgetMode),
			TokenBudgetApplied:   tokenDecision.Applied,
			TokenBudgetQueued:    tokenDecision.Queued,
			TokenBudgetWaitMS:    tokenDecision.RetryAfter.Milliseconds(),
			TokenBudgetLimit:     tokenDecision.Limit,
			TokenBudgetRemaining: tokenDecision.Remaining,
		},
	}

	if err := s.emitter.Emit(ctx, event); err != nil {
		log.Printf("rateguard: emit request event: %v", err)
	}
}

func (s *SDK) tenantID() string {
	if s.cfg.TenantID != "" {
		return s.cfg.TenantID
	}
	return "global"
}

func (s *SDK) routeID(r *http.Request) string {
	if s.cfg.RouteID != "" {
		return s.cfg.RouteID
	}
	if r != nil && r.URL != nil && strings.TrimSpace(r.URL.Path) != "" {
		return strings.TrimSpace(r.URL.Path)
	}
	return "root"
}

func (s *SDK) upstreamID() string {
	if s.cfg.UpstreamID != "" {
		return s.cfg.UpstreamID
	}
	return "local"
}

func (s *SDK) tokenBudgetKey(r *http.Request) string {
	tenant := s.tenantID()
	route := s.routeID(r)
	upstream := s.upstreamID()
	provider := s.cfg.Provider
	if provider == "" {
		provider = "local"
	}
	model := s.cfg.Model
	if model == "" {
		model = "default"
	}

	return strings.Join([]string{tenant, route, upstream, provider, model}, ":")
}

func ceilDurationSeconds(d time.Duration) int64 {
	if d <= 0 {
		return 0
	}
	secs := d / time.Second
	if d%time.Second != 0 {
		secs++
	}
	return int64(secs)
}

type responseRecorder struct {
	http.ResponseWriter
	status    int
	body      bytes.Buffer
	maxBody   int
	truncated bool
}

func (r *responseRecorder) Unwrap() http.ResponseWriter {
	return r.ResponseWriter
}

func (r *responseRecorder) WriteHeader(statusCode int) {
	if r.status == 0 {
		r.status = statusCode
	}
	r.ResponseWriter.WriteHeader(statusCode)
}

func (r *responseRecorder) Write(b []byte) (int, error) {
	if r.status == 0 {
		r.status = http.StatusOK
	}
	if len(b) > 0 && !r.truncated {
		room := r.maxBody - r.body.Len()
		if r.maxBody <= 0 {
			room = len(b) // no cap configured (zero value used in tests)
		}
		if room >= len(b) {
			if _, err := r.body.Write(b); err != nil {
				return 0, err
			}
		} else {
			// Body exceeds the cap: stop buffering. A truncated JSON body
			// would fail extraction anyway, so drop the partial buffer.
			r.truncated = true
			r.body.Reset()
		}
	}
	return r.ResponseWriter.Write(b)
}

func (r *responseRecorder) statusCode() int {
	if r.status == 0 {
		return http.StatusOK
	}
	return r.status
}

func (r *responseRecorder) Flush() {
	if flusher, ok := r.ResponseWriter.(http.Flusher); ok {
		flusher.Flush()
	}
}

func (r *responseRecorder) snapshot() ResponseSnapshot {
	return ResponseSnapshot{
		Header:     r.Header().Clone(),
		Body:       append([]byte(nil), r.body.Bytes()...),
		StatusCode: r.statusCode(),
	}
}

func (r *responseRecorder) Hijack() (net.Conn, *bufio.ReadWriter, error) {
	hijacker, ok := r.ResponseWriter.(http.Hijacker)
	if !ok {
		return nil, nil, errors.New("hijacker not supported")
	}
	return hijacker.Hijack()
}

func (r *responseRecorder) Push(target string, opts *http.PushOptions) error {
	pusher, ok := r.ResponseWriter.(http.Pusher)
	if !ok {
		return http.ErrNotSupported
	}
	return pusher.Push(target, opts)
}
