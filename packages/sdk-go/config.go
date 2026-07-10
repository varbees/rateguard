package rateguard

import (
	"context"
	"net/http"
	"time"

	"github.com/redis/go-redis/v9"
	sdkmetric "go.opentelemetry.io/otel/sdk/metric"
	sdktrace "go.opentelemetry.io/otel/sdk/trace"
)

// Clock allows the SDK to be tested deterministically.
type Clock interface {
	Now() time.Time
}

type systemClock struct{}

func (systemClock) Now() time.Time {
	return time.Now().UTC()
}

// KeyFunc builds the rate limit key for a request.
type KeyFunc func(*http.Request) string

// RedisLimiterClient is the minimal Redis contract required by the SDK limiter.
type RedisLimiterClient interface {
	Eval(ctx context.Context, script string, keys []string, args ...interface{}) *redis.Cmd
}

// Config controls SDK behavior.
type Config struct {
	Preset            string
	TenantID          string
	RouteID           string
	UpstreamID        string
	Provider          string
	Model             string
	RequestsPerSecond int
	Burst             int
	DisableRateLimit  bool

	TokenBudgetMode     TokenBudgetMode
	TokenBudgetPerHour  int64
	TokenBudgetPerDay   int64
	TokenBudgetPerMonth int64
	CircuitBreaker      CircuitBreakerOptions

	// EstimatedTokensPerRequest bounds the hard-stop token budget reservation
	// per in-flight request. Zero (default) reserves the entire remaining
	// budget — guaranteed never to overshoot, but serializes concurrent
	// requests on the same budget key. Set to a realistic per-call estimate
	// (e.g. 8000 for chat workloads) to allow concurrency; actual usage is
	// reconciled after the response.
	EstimatedTokensPerRequest int64

	// Guardrails, when set, are checked against request bodies before the
	// request reaches your handler. Violations return HTTP 422.
	Guardrails *GuardrailChain

	// LoopDetection enables agent loop detection for requests carrying an
	// X-Sequence-Depth header. Detected loops return HTTP 429 with code
	// "loop_detected". Fingerprints come from the X-Payload-Fingerprint
	// header when present, otherwise from a SHA-256 hash of method+path+body.
	LoopDetection bool
	// LoopMaxDepth overrides the maximum agent sequence depth (default 50).
	LoopMaxDepth int

	// MaxBufferedResponseBytes caps how much response body the middleware
	// buffers for token usage extraction. Default 1 MiB. Responses larger
	// than the cap simply skip body-based extraction.
	MaxBufferedResponseBytes int

	// AdaptiveRateLimit auto-tunes the effective rate limit from observed
	// upstream outcomes: healthy traffic grows the limit additively, error
	// rates above target cut it multiplicatively — before the circuit
	// breaker has to trip. The configured policy stays the anchor; see
	// AdaptiveOptions for bounds.
	AdaptiveRateLimit bool
	// Adaptive overrides the adaptive control loop defaults. Ignored unless
	// AdaptiveRateLimit is true.
	Adaptive AdaptiveOptions

	EventEmitter EventEmitter

	// OutboundCustomerHeader is the request header read for per-customer budget
	// attribution on outbound LLM calls (default X-RateGuard-Customer). When a
	// request carries it, budgets are scoped and spend is tracked per customer,
	// and the header is stripped before the request reaches the provider.
	OutboundCustomerHeader string

	// PricingProvider supplies USD-per-1K-token prices for cost estimates,
	// checked before the built-in starter table. Bring your own, or use
	// StaticPricing for a map of custom/fine-tuned/not-yet-tabled models.
	// Cost is an observability estimate only — it never drives enforcement.
	PricingProvider PricingProvider

	// EventEndpoint enables webhook event delivery. The HTTP emitter it
	// creates is wrapped in an AsyncEventEmitter so delivery never blocks
	// the request hot path (bounded queue, drop-with-counter on overflow —
	// see events_async.go). A custom EventEmitter is used exactly as
	// given: wrap it in NewAsyncEventEmitter yourself if you want the
	// same behavior.
	EventEndpoint string
	// EventQueueSize bounds the async event queue used with
	// EventEndpoint. 0 means the default (1024).
	EventQueueSize      int
	HTTPClient          *http.Client
	Clock               Clock
	KeyFunc             KeyFunc
	TokenUsageExtractor TokenUsageExtractor
	BudgetWaiter        BudgetWaiter
	RedisClient         RedisLimiterClient

	OTLPCollectorEndpoint string
	ServiceName           string
	TraceSpanProcessor    sdktrace.SpanProcessor
	MetricReader          sdkmetric.Reader

	// AdminCORSOrigin sets Access-Control-Allow-Origin on AdminHandler's
	// responses to this exact value (e.g. "http://localhost:3001" for a
	// locally-run dashboard) — never "*". Leave empty (the default) to omit
	// CORS headers entirely: the admin API then only answers same-origin
	// requests, and no arbitrary webpage open in a browser on the same
	// machine can reach it via a cross-origin fetch. Only set this to the
	// dashboard's own origin, and only when you also trust everything else
	// running in that browser — the admin API still has no authentication
	// of its own.
	AdminCORSOrigin string
}
