package api

import (
	"context"
	"database/sql"
	"fmt"
	"sort"
	"strings"

	"github.com/gofiber/fiber/v2"
	"github.com/gofiber/fiber/v2/middleware/adaptor"
	"github.com/google/uuid"
	"github.com/prometheus/client_golang/prometheus"
	"github.com/prometheus/client_golang/prometheus/promauto"
	"github.com/prometheus/client_golang/prometheus/promhttp"
	"github.com/varbees/rateguard/internal/cache"
	"github.com/varbees/rateguard/internal/proxy"
	"github.com/varbees/rateguard/internal/queue"
	"github.com/varbees/rateguard/internal/storage"
	"go.uber.org/zap"
)

var (
	// Standard HTTP metrics
	httpRequestsTotal = promauto.NewCounterVec(
		prometheus.CounterOpts{
			Name: "http_requests_total",
			Help: "Total number of HTTP requests",
		},
		[]string{"method", "path", "status"},
	)

	httpRequestDuration = promauto.NewHistogramVec(
		prometheus.HistogramOpts{
			Name:    "http_request_duration_seconds",
			Help:    "HTTP request duration in seconds",
			Buckets: prometheus.DefBuckets,
		},
		[]string{"method", "path"},
	)

	// Phase 5: Priority Queue Downgrades
	priorityQueueDowngrades = promauto.NewCounterVec(
		prometheus.CounterOpts{
			Name: "priority_queue_downgrades_total",
			Help: "Total number of priority queue downgrades for non-pro users",
		},
		[]string{"user_id", "api_name", "requested_priority"},
	)
)

// MetricsHandler handles Prometheus metrics and KEDA custom scaling metrics.
type MetricsHandler struct {
	db           *sql.DB
	redisClient  *cache.RedisClient
	proxyService *proxy.ProxyService
	usageTracker *storage.UsageTracker
	logger       *zap.Logger
}

// NewMetricsHandler creates a new metrics handler.
func NewMetricsHandler(db *sql.DB, redisClient *cache.RedisClient, proxyService *proxy.ProxyService, usageTracker *storage.UsageTracker, logger *zap.Logger) *MetricsHandler {
	return &MetricsHandler{
		db:           db,
		redisClient:  redisClient,
		proxyService: proxyService,
		usageTracker: usageTracker,
		logger:       logger,
	}
}

// GetMetrics returns the Prometheus metrics handler adapted for Fiber
func (h *MetricsHandler) GetMetrics() fiber.Handler {
	return adaptor.HTTPHandler(promhttp.Handler())
}

// GetKEDAMetrics returns a Prometheus exposition document for KEDA scaling triggers.
func (h *MetricsHandler) GetKEDAMetrics() fiber.Handler {
	return func(c *fiber.Ctx) error {
		snapshot, err := h.buildKEDASnapshot(c.Context())
		if err != nil && h.logger != nil {
			h.logger.Warn("Failed to build KEDA metrics snapshot", zap.Error(err))
		}

		c.Set(fiber.HeaderContentType, "text/plain; charset=utf-8")
		return c.SendString(renderKEDAMetrics(snapshot))
	}
}

type kedaUpstream struct {
	UserID uuid.UUID
	APIID  uuid.UUID
	Name   string
}

type kedaSnapshot struct {
	QueueDepth          map[string]int64
	P95LatencyMs        map[string]float64
	CircuitBreakerOpen  map[string]float64
	ErrorBurstRate1m    map[string]float64
	ActiveConsumerCount int64
	RedisStreamLag      int64
}

func (h *MetricsHandler) buildKEDASnapshot(ctx context.Context) (kedaSnapshot, error) {
	snapshot := kedaSnapshot{
		QueueDepth:         make(map[string]int64),
		P95LatencyMs:       make(map[string]float64),
		CircuitBreakerOpen: make(map[string]float64),
		ErrorBurstRate1m:   make(map[string]float64),
	}

	upstreams, err := h.activeUpstreams(ctx)
	if err != nil {
		return snapshot, err
	}

	for _, upstream := range upstreams {
		key := upstream.Name
		if key == "" {
			key = upstream.APIID.String()
		}

		if h.usageTracker != nil {
			metrics, err := h.usageTracker.GetAPIMetrics(ctx, upstream.UserID, upstream.APIID)
			if err == nil {
				if current, ok := snapshot.P95LatencyMs[key]; !ok || metrics.P95LatencyMs > current {
					snapshot.P95LatencyMs[key] = metrics.P95LatencyMs
				}
				snapshot.ErrorBurstRate1m[key] += h.errorBurstRate(ctx, upstream.UserID, upstream.APIID)
			}
		}

		if h.proxyService != nil {
			openRate := h.circuitBreakerOpenRate(key)
			if current, ok := snapshot.CircuitBreakerOpen[key]; !ok || openRate > current {
				snapshot.CircuitBreakerOpen[key] = openRate
			}
		}
	}

	if h.redisClient != nil {
		snapshot.QueueDepth = h.queueDepthByUpstream()
		snapshot.ActiveConsumerCount = h.activeConsumerCount(ctx)
		snapshot.RedisStreamLag = h.redisStreamLag(ctx)
	}

	// Ensure active upstreams exist in the output even when there is no data yet.
	for _, upstream := range upstreams {
		key := upstream.Name
		if key == "" {
			key = upstream.APIID.String()
		}
		if _, ok := snapshot.QueueDepth[key]; !ok {
			snapshot.QueueDepth[key] = 0
		}
		if _, ok := snapshot.P95LatencyMs[key]; !ok {
			snapshot.P95LatencyMs[key] = 0
		}
		if _, ok := snapshot.CircuitBreakerOpen[key]; !ok {
			snapshot.CircuitBreakerOpen[key] = 0
		}
		if _, ok := snapshot.ErrorBurstRate1m[key]; !ok {
			snapshot.ErrorBurstRate1m[key] = 0
		}
	}

	if len(snapshot.QueueDepth) == 0 {
		snapshot.QueueDepth["none"] = 0
	}
	if len(snapshot.P95LatencyMs) == 0 {
		snapshot.P95LatencyMs["none"] = 0
	}
	if len(snapshot.CircuitBreakerOpen) == 0 {
		snapshot.CircuitBreakerOpen["none"] = 0
	}
	if len(snapshot.ErrorBurstRate1m) == 0 {
		snapshot.ErrorBurstRate1m["none"] = 0
	}

	return snapshot, nil
}

func (h *MetricsHandler) activeUpstreams(ctx context.Context) ([]kedaUpstream, error) {
	if h.db == nil {
		return nil, nil
	}

	rows, err := h.db.QueryContext(ctx, `
		SELECT DISTINCT user_id, id, name
		FROM api_configs
		WHERE enabled = true
		ORDER BY user_id, id
		LIMIT 500
	`)
	if err != nil {
		return nil, fmt.Errorf("query active upstreams: %w", err)
	}
	defer rows.Close()

	var upstreams []kedaUpstream
	for rows.Next() {
		var upstream kedaUpstream
		if err := rows.Scan(&upstream.UserID, &upstream.APIID, &upstream.Name); err != nil {
			return nil, fmt.Errorf("scan upstream: %w", err)
		}
		upstreams = append(upstreams, upstream)
	}

	return upstreams, rows.Err()
}

func (h *MetricsHandler) queueDepthByUpstream() map[string]int64 {
	depth := make(map[string]int64)
	if h.redisClient == nil {
		return depth
	}

	keys, err := h.redisClient.Scan("queue:*:*")
	if err != nil {
		return depth
	}

	for _, key := range keys {
		parts := strings.SplitN(key, ":", 3)
		if len(parts) != 3 || parts[0] != "queue" {
			continue
		}
		apiName := parts[2]
		length, err := h.redisClient.ZCard(key)
		if err != nil {
			continue
		}
		depth[apiName] += length
	}

	return depth
}

func (h *MetricsHandler) errorBurstRate(ctx context.Context, userID, apiID uuid.UUID) float64 {
	if h.db == nil {
		return 0
	}

	var burst int64
	err := h.db.QueryRowContext(ctx, `
		SELECT COALESCE(COUNT(*), 0)
		FROM request_logs
		WHERE user_id = $1
		AND api_id = $2
		AND timestamp >= NOW() - INTERVAL '1 minute'
		AND status_code >= 400
	`, userID, apiID).Scan(&burst)
	if err != nil {
		return 0
	}
	return float64(burst)
}

func (h *MetricsHandler) circuitBreakerOpenRate(upstreamName string) float64 {
	if h.proxyService == nil {
		return 0
	}

	metricsByAPI := h.proxyService.GetCircuitBreakerMetrics()
	open := 0.0
	for _, metrics := range metricsByAPI {
		if metrics.APIName != upstreamName {
			continue
		}
		if strings.EqualFold(metrics.StateString, "open") {
			open = 1
		}
	}

	return open
}

func (h *MetricsHandler) activeConsumerCount(ctx context.Context) int64 {
	if h.redisClient == nil {
		return 0
	}

	consumers, err := h.redisClient.GetClient().XInfoConsumers(ctx, queue.StreamName, "analytics-workers").Result()
	if err != nil {
		return 0
	}
	return int64(len(consumers))
}

func (h *MetricsHandler) redisStreamLag(ctx context.Context) int64 {
	if h.redisClient == nil {
		return 0
	}

	length, err := h.redisClient.GetClient().XLen(ctx, queue.StreamName).Result()
	if err != nil {
		return 0
	}
	return length
}

func renderKEDAMetrics(snapshot kedaSnapshot) string {
	var b strings.Builder

	writeGaugeFamily := func(name, help string, samples map[string]float64) {
		b.WriteString("# HELP ")
		b.WriteString(name)
		b.WriteString(" ")
		b.WriteString(help)
		b.WriteString("\n")
		b.WriteString("# TYPE ")
		b.WriteString(name)
		b.WriteString(" gauge\n")

		keys := make([]string, 0, len(samples))
		for key := range samples {
			keys = append(keys, key)
		}
		sort.Strings(keys)
		for _, key := range keys {
			b.WriteString(name)
			b.WriteString("{upstream=\"")
			b.WriteString(escapeLabelValue(key))
			b.WriteString("\"} ")
			b.WriteString(fmt.Sprintf("%.3f", samples[key]))
			b.WriteString("\n")
		}
	}

	writeIntGaugeFamily := func(name, help string, samples map[string]int64) {
		converted := make(map[string]float64, len(samples))
		for key, value := range samples {
			converted[key] = float64(value)
		}
		writeGaugeFamily(name, help, converted)
	}

	writeIntGaugeFamily("queue_depth_per_upstream", "Current queue depth per upstream.", snapshot.QueueDepth)
	writeGaugeFamily("p95_latency_per_upstream", "P95 latency in milliseconds per upstream.", snapshot.P95LatencyMs)
	writeGaugeFamily("circuit_breaker_open_rate", "Circuit breaker open state per upstream.", snapshot.CircuitBreakerOpen)
	writeGaugeFamily("error_burst_rate_1m", "Error responses counted over the last minute per upstream.", snapshot.ErrorBurstRate1m)
	writeIntGaugeFamily("active_consumer_count", "Active Redis Stream consumer count.", map[string]int64{
		"analytics-workers": snapshot.ActiveConsumerCount,
	})
	writeIntGaugeFamily("redis_stream_lag", "Redis Stream backlog for analytics events.", map[string]int64{
		queue.StreamName: snapshot.RedisStreamLag,
	})

	return b.String()
}

func escapeLabelValue(v string) string {
	v = strings.ReplaceAll(v, `\`, `\\`)
	v = strings.ReplaceAll(v, "\n", `\n`)
	v = strings.ReplaceAll(v, "\"", `\"`)
	return v
}

// RecordRequest records a completed HTTP request
func RecordRequest(method, path, status string, duration float64) {
	httpRequestsTotal.WithLabelValues(method, path, status).Inc()
	httpRequestDuration.WithLabelValues(method, path).Observe(duration)
}

// RecordPriorityDowngrade records a priority queue downgrade
func RecordPriorityDowngrade(userID, apiName, requestedPriority string) {
	priorityQueueDowngrades.WithLabelValues(userID, apiName, requestedPriority).Inc()
}
