package rateguard

import (
	"net/http"
	"time"

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

	EventEmitter        EventEmitter
	EventEndpoint       string
	HTTPClient          *http.Client
	Clock               Clock
	KeyFunc             KeyFunc
	TokenUsageExtractor TokenUsageExtractor
	BudgetWaiter        BudgetWaiter

	OTLPCollectorEndpoint string
	ServiceName           string
	TraceSpanProcessor    sdktrace.SpanProcessor
	MetricReader          sdkmetric.Reader
}
