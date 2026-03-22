package rateguard

import (
	"bufio"
	"bytes"
	"context"
	"errors"
	"net"
	"net/http"
	"strconv"
	"strings"
	"time"
)

// SDK is the top-level middleware entrypoint.
type SDK struct {
	cfg     Config
	policy  PolicyPreset
	limiter Limiter
	tokens  *tokenBudgetManager
	extract TokenUsageExtractor
	waiter  BudgetWaiter
	otel    *observability
	emitter EventEmitter
	clock   Clock
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
	default:
		limiter = NewMemoryLimiter()
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
		otel = &observability{}
	}

	return &SDK{
		cfg:     cfg,
		policy:  policy,
		limiter: limiter,
		tokens:  newTokenBudgetManager(clock),
		extract: extractor,
		waiter:  waiter,
		otel:    otel,
		emitter: emitter,
		clock:   clock,
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

func (s *SDK) handleHTTP(w http.ResponseWriter, r *http.Request, next http.Handler) {
	start := s.clock.Now()
	key := s.admissionKey(r)
	traceCtx := traceContextFromHeaders(r.Header)
	attrs := requestAttributes(
		s.tenantID(),
		s.routeID(r),
		s.upstreamID(),
		true,
		"closed",
		0,
	)
	traceCtx, span := s.otel.startRequestSpan(traceCtx, attrs)
	defer span.End()
	r = r.WithContext(traceCtx)

	decision, _ := s.limiter.Allow(r.Context(), key, s.policy)
	s.applyHeaders(w.Header(), decision)

	if !decision.Allowed {
		s.writeRateLimitResponse(w)
		s.emitRequestEvent(r.Context(), r, decision, http.StatusTooManyRequests, start, TokenUsage{}, tokenBudgetDecision{})
		s.otel.recordRequest(r.Context(), requestAttributes(s.tenantID(), s.routeID(r), s.upstreamID(), decision.Applied, "closed", 0), s.clock.Now().Sub(start), http.StatusTooManyRequests)
		return
	}

	tokenKey := s.tokenBudgetKey(r)
	tokenDecision, err := s.tokens.waitForAvailability(r.Context(), tokenKey, s.policy, s.waiter, TokenBudgetMode(s.policy.TokenBudgetMode))
	if err != nil {
		s.writeTokenBudgetResponse(w)
		s.emitRequestEvent(r.Context(), r, decision, http.StatusTooManyRequests, start, TokenUsage{}, tokenDecision)
		s.otel.recordRequest(r.Context(), requestAttributes(s.tenantID(), s.routeID(r), s.upstreamID(), decision.Applied, "closed", 0), s.clock.Now().Sub(start), http.StatusTooManyRequests)
		return
	}
	if !tokenDecision.Allowed && tokenDecision.Applied && TokenBudgetMode(s.policy.TokenBudgetMode) != TokenBudgetModeSoftStop {
		s.writeTokenBudgetResponse(w)
		s.emitRequestEvent(r.Context(), r, decision, http.StatusTooManyRequests, start, TokenUsage{}, tokenDecision)
		s.otel.recordRequest(r.Context(), requestAttributes(s.tenantID(), s.routeID(r), s.upstreamID(), decision.Applied, "closed", 0), s.clock.Now().Sub(start), http.StatusTooManyRequests)
		return
	}

	recorder := &responseRecorder{ResponseWriter: w}
	next.ServeHTTP(recorder, r)
	snapshot := recorder.snapshot()

	tokenUsage, ok := s.extract.Extract(snapshot)
	if ok {
		s.tokens.record(tokenKey, tokenUsage.TotalTokens)
	}

	finalTokenDecision := s.tokens.check(tokenKey, s.policy)
	finalTokenDecision.Queued = tokenDecision.Queued
	if tokenDecision.RetryAfter > 0 {
		finalTokenDecision.RetryAfter = tokenDecision.RetryAfter
	}

	status := recorder.statusCode()
	finalAttrs := requestAttributes(
		s.tenantID(),
		s.routeID(r),
		s.upstreamID(),
		decision.Applied,
		"closed",
		0,
	)
	s.otel.recordRequest(r.Context(), finalAttrs, s.clock.Now().Sub(start), status)

	s.emitRequestEvent(r.Context(), r, decision, status, start, tokenUsage, finalTokenDecision)
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
	if !decision.Allowed && decision.RetryAfter > 0 {
		h.Set("Retry-After", strconv.FormatInt(ceilDurationSeconds(decision.RetryAfter), 10))
	}
}

func (s *SDK) writeRateLimitResponse(w http.ResponseWriter) {
	w.WriteHeader(http.StatusTooManyRequests)
	_, _ = w.Write([]byte(`{"error":"rate_limit_exceeded","message":"request rejected by RateGuard"}`))
}

func (s *SDK) writeTokenBudgetResponse(w http.ResponseWriter) {
	w.WriteHeader(http.StatusTooManyRequests)
	_, _ = w.Write([]byte(`{"error":"token_budget_exceeded","message":"token budget exhausted by RateGuard"}`))
}

func (s *SDK) emitRequestEvent(ctx context.Context, r *http.Request, decision AdmissionDecision, statusCode int, start time.Time, tokenUsage TokenUsage, tokenDecision tokenBudgetDecision) {
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
	if !decision.Allowed {
		eventType = EventTypeRequestRateLimited
	}
	if !tokenDecision.Allowed && tokenDecision.Applied && tokenDecision.Window != "" {
		eventType = EventTypeTokenBudgetExceeded
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
			RetryAfterMS:         decision.RetryAfter.Milliseconds(),
			Preset:               s.policy.Name,
			CircuitBreakerState:  "closed",
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

	_ = s.emitter.Emit(ctx, event)
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
	status int
	body   bytes.Buffer
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
	if len(b) > 0 {
		_, _ = r.body.Write(b)
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
