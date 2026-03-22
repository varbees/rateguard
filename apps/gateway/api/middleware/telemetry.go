package middleware

import (
	"context"
	"fmt"
	"strconv"
	"strings"
	"time"

	"github.com/gofiber/fiber/v2"
	"github.com/varbees/rateguard/internal/telemetry"
	"go.opentelemetry.io/otel/propagation"
)

// TelemetryMiddleware records OTEL request spans and metrics.
type TelemetryMiddleware struct {
	obs *telemetry.Observability
}

// NewTelemetryMiddleware constructs a telemetry middleware from configuration.
func NewTelemetryMiddleware(cfg telemetry.Config) (*TelemetryMiddleware, error) {
	obs, err := telemetry.New(cfg)
	if err != nil {
		return nil, err
	}
	return &TelemetryMiddleware{obs: obs}, nil
}

// Trace wraps a Fiber request in an OTEL span and records metrics on completion.
func (m *TelemetryMiddleware) Trace(c *fiber.Ctx) error {
	if m == nil || m.obs == nil {
		return c.Next()
	}

	start := time.Now()
	traceCtx := extractTraceContext(c)

	attrs := telemetry.RequestAttributes(
		tenantID(c),
		routeID(c),
		upstreamID(c),
		rateLimitApplied(c),
		circuitBreakerState(c),
		queueDepth(c),
	)

	traceCtx, span := m.obs.StartRequestSpan(traceCtx, attrs)
	defer span.End()
	c.SetUserContext(traceCtx)

	err := c.Next()
	statusCode := c.Response().StatusCode()
	finalAttrs := telemetry.RequestAttributes(
		tenantID(c),
		routeID(c),
		upstreamID(c),
		rateLimitApplied(c),
		circuitBreakerState(c),
		queueDepth(c),
	)
	m.obs.RecordRequest(traceCtx, finalAttrs, time.Since(start), statusCode)
	return err
}

// Shutdown flushes OTEL exporters.
func (m *TelemetryMiddleware) Shutdown(ctx context.Context) error {
	if m == nil || m.obs == nil {
		return nil
	}
	return m.obs.Shutdown(ctx)
}

func extractTraceContext(c *fiber.Ctx) context.Context {
	carrier := fiberHeaderCarrier{c: c}
	return propagation.TraceContext{}.Extract(context.Background(), carrier)
}

type fiberHeaderCarrier struct {
	c *fiber.Ctx
}

func (f fiberHeaderCarrier) Get(key string) string {
	return f.c.Get(key)
}

func (f fiberHeaderCarrier) Set(key, value string) {
	f.c.Request().Header.Set(key, value)
}

func (f fiberHeaderCarrier) Keys() []string {
	keys := make([]string, 0, 8)
	f.c.Request().Header.VisitAll(func(k, _ []byte) {
		keys = append(keys, string(k))
	})
	return keys
}

func tenantID(c *fiber.Ctx) string {
	if v := strings.TrimSpace(fmt.Sprint(c.Locals("tenant_id"))); v != "" && v != "<nil>" {
		return v
	}
	return "global"
}

func routeID(c *fiber.Ctx) string {
	if v := strings.TrimSpace(fmt.Sprint(c.Locals("route_id"))); v != "" && v != "<nil>" {
		return v
	}
	if route := c.Route(); route != nil && route.Path != "" {
		return route.Path
	}
	if path := strings.TrimSpace(c.Path()); path != "" {
		return path
	}
	return "root"
}

func upstreamID(c *fiber.Ctx) string {
	if v := strings.TrimSpace(fmt.Sprint(c.Locals("upstream_id"))); v != "" && v != "<nil>" {
		return v
	}
	if v := strings.TrimSpace(c.Get("X-RateGuard-Upstream-ID")); v != "" {
		return v
	}
	return "local"
}

func rateLimitApplied(c *fiber.Ctx) bool {
	if v, ok := c.Locals("rate_limit_applied").(bool); ok {
		return v
	}
	return strings.TrimSpace(string(c.Response().Header.Peek("X-RateGuard-Limit"))) != ""
}

func circuitBreakerState(c *fiber.Ctx) string {
	if v := strings.TrimSpace(fmt.Sprint(c.Locals("circuit_breaker_state"))); v != "" && v != "<nil>" {
		return v
	}
	return "closed"
}

func queueDepth(c *fiber.Ctx) int {
	if v, ok := c.Locals("queue_depth").(int); ok {
		return v
	}
	if raw := strings.TrimSpace(fmt.Sprint(c.Locals("queue_depth"))); raw != "" && raw != "<nil>" {
		if parsed, err := strconv.Atoi(raw); err == nil {
			return parsed
		}
	}
	if raw := strings.TrimSpace(c.Get("X-RateGuard-Queue-Depth")); raw != "" {
		if parsed, err := strconv.Atoi(raw); err == nil {
			return parsed
		}
	}
	return 0
}
