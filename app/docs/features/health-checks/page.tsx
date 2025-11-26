import { Metadata } from "next";
import {
  HeartPulse,
  CheckCircle,
  XCircle,
  Code,
  Activity,
  Server,
  Shield,
  AlertTriangle,
} from "lucide-react";
import { DocsSectionHeader } from "@/components/docs/section-header";
import { CodeBlock } from "@/components/docs/code-block";
import { CodeTabs } from "@/components/docs/CodeTabs";
import { DocsPager } from "@/components/docs/pager";
import { Callout } from "@/components/docs/Callout";

export const metadata: Metadata = {
  title: "Health Checks & Graceful Shutdown | RateGuard Documentation",
  description:
    "Learn about RateGuard's Kubernetes-native health checks and zero-downtime deployments.",
};

export default function HealthChecksPage() {
  return (
    <div className="space-y-8">
      <div className="space-y-4">
        <h1 className="text-3xl font-bold tracking-tight">
          Health Checks & Graceful Shutdown
        </h1>
        <p className="text-xl text-muted-foreground">
          Kubernetes-native health probes and zero-downtime deployments.
        </p>
      </div>

      <Callout title="Production Ready" type="default">
        RateGuard is designed for high-availability environments with built-in
        liveness and readiness probes.
      </Callout>

      <div className="grid gap-8">
        <DocsSectionHeader
          icon={<HeartPulse className="h-5 w-5" />}
          title="Health Checks"
          description="Understand how RateGuard's health check endpoints work."
        />

        <div className="prose prose-slate dark:prose-invert max-w-none">
          <p>
            RateGuard provides Kubernetes-native health check endpoints that
            allow orchestrators to monitor the health of your instances and make
            intelligent routing decisions.
          </p>

          <h3>Available Endpoints</h3>
          <ul>
            <li>
              <strong>/health</strong> - Liveness probe to check if the service
              is running
            </li>
            <li>
              <strong>/ready</strong> - Readiness probe to check if the service
              can accept traffic
            </li>
            <li>
              <strong>/metrics</strong> - Prometheus-compatible metrics endpoint
            </li>
          </ul>

          <h3>Health Check Details</h3>
          <p>The health check endpoints perform the following checks:</p>
          <ul>
            <li>
              <strong>PostgreSQL connectivity</strong> - Verifies database
              connection is active
            </li>
            <li>
              <strong>Redis connectivity</strong> - Verifies Redis connection
              for distributed rate limiting
            </li>
            <li>
              <strong>Memory usage</strong> - Checks if memory usage is within
              acceptable limits
            </li>
            <li>
              <strong>Goroutine count</strong> - Monitors for potential
              goroutine leaks
            </li>
          </ul>
        </div>

        <div className="space-y-4">
          <h3 className="text-lg font-semibold">Response Format</h3>
          <p className="text-muted-foreground">
            Health check endpoints return JSON responses with detailed status
            information:
          </p>
          <CodeBlock
            language="json"
            value={`{
  "status": "healthy",
  "timestamp": "2023-11-26T12:34:56Z",
  "version": "1.5.0",
  "checks": {
    "database": {
      "status": "healthy",
      "latency_ms": 3
    },
    "redis": {
      "status": "healthy",
      "latency_ms": 1
    },
    "memory": {
      "status": "healthy",
      "usage_mb": 128,
      "limit_mb": 512
    }
  }
}`}
          />
        </div>

        <DocsSectionHeader
          icon={<CheckCircle className="h-5 w-5" />}
          title="Graceful Shutdown"
          description="Learn how RateGuard handles zero-downtime deployments."
        />

        <div className="prose prose-slate dark:prose-invert max-w-none">
          <p>
            RateGuard implements graceful shutdown procedures to ensure
            zero-downtime deployments. When a shutdown signal (SIGTERM/SIGINT)
            is received, RateGuard:
          </p>

          <ol>
            <li>
              <strong>Marks as not ready</strong> - Updates readiness probe to
              prevent new traffic
            </li>
            <li>
              <strong>Drains in-flight requests</strong> - Waits for existing
              requests to complete (configurable timeout)
            </li>
            <li>
              <strong>Closes connections</strong> - Gracefully closes database
              and Redis connections
            </li>
            <li>
              <strong>Releases resources</strong> - Ensures all resources are
              properly released
            </li>
          </ol>
        </div>

        <div className="space-y-4">
          <h3 className="text-lg font-semibold">Configuration</h3>
          <p className="text-muted-foreground">
            Graceful shutdown behavior can be configured through environment
            variables or the config file:
          </p>
          <CodeBlock
            language="yaml"
            value={`shutdown:
  timeout_seconds: 30       # Maximum time to wait for in-flight requests
  drain_interval_ms: 500    # How often to check if requests are complete
  force_timeout_seconds: 60 # Force shutdown after this time regardless of state`}
          />
        </div>

        <DocsSectionHeader
          icon={<XCircle className="h-5 w-5" />}
          title="Failure Handling"
          description="How RateGuard handles dependency failures."
        />

        <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
          <div className="border rounded-lg p-4">
            <h4 className="font-semibold mb-2 flex items-center gap-2">
              <Server className="h-4 w-4 text-blue-500" /> Database Failures
            </h4>
            <ul className="text-sm text-muted-foreground space-y-1">
              <li>Connection pooling for resilience</li>
              <li>Automatic reconnection with backoff</li>
              <li>Read-only mode fallback</li>
            </ul>
          </div>
          <div className="border rounded-lg p-4">
            <h4 className="font-semibold mb-2 flex items-center gap-2">
              <Activity className="h-4 w-4 text-red-500" /> Redis Failures
            </h4>
            <ul className="text-sm text-muted-foreground space-y-1">
              <li>Local in-memory fallback</li>
              <li>Sentinel/Cluster support</li>
              <li>Circuit breaker protection</li>
            </ul>
          </div>
        </div>

        <DocsSectionHeader
          icon={<Code className="h-5 w-5" />}
          title="Implementation"
          description="See how health checks and graceful shutdown are implemented."
        />

        <CodeTabs
          examples={[
            {
              label: "Health Check",
              language: "go",
              code: `// HealthHandler handles /health endpoint requests
func (h *HealthHandler) HealthHandler(c *fiber.Ctx) error {
	checks := make(map[string]HealthCheck)
	
	// Check database
	dbStart := time.Now()
	if err := h.db.PingContext(c.Context()); err != nil {
		checks["database"] = HealthCheck{
			Status:    "unhealthy",
			Error:     err.Error(),
			LatencyMs: time.Since(dbStart).Milliseconds(),
		}
	} else {
		checks["database"] = HealthCheck{
			Status:    "healthy",
			LatencyMs: time.Since(dbStart).Milliseconds(),
		}
	}
	
	// Check Redis if enabled
	if h.redis != nil {
		redisStart := time.Now()
		if err := h.redis.Ping(c.Context()); err != nil {
			checks["redis"] = HealthCheck{
				Status:    "unhealthy",
				Error:     err.Error(),
				LatencyMs: time.Since(redisStart).Milliseconds(),
			}
		} else {
			checks["redis"] = HealthCheck{
				Status:    "healthy",
				LatencyMs: time.Since(redisStart).Milliseconds(),
			}
		}
	}
	
	// Determine overall status
	status := "healthy"
	for _, check := range checks {
		if check.Status != "healthy" {
			status = "unhealthy"
			break
		}
	}
	
	return c.JSON(fiber.Map{
		"status":    status,
		"timestamp": time.Now(),
		"version":   h.version,
		"checks":    checks,
	})
}`,
            },
            {
              label: "Graceful Shutdown",
              language: "go",
              code: `// SetupGracefulShutdown configures graceful shutdown
func SetupGracefulShutdown(app *fiber.App, config *Config) {
	// Channel to listen for interrupt signals
	quit := make(chan os.Signal, 1)
	signal.Notify(quit, os.Interrupt, syscall.SIGTERM)
	
	go func() {
		<-quit
		logger.Info("Shutdown signal received")
		
		// Update readiness probe to prevent new traffic
		atomic.StoreInt32(&isReady, 0)
		logger.Info("Marked as not ready, waiting for drain interval")
		time.Sleep(time.Duration(config.Shutdown.DrainIntervalMs) * time.Millisecond)
		
		// Set shutdown timeout
		ctx, cancel := context.WithTimeout(
			context.Background(),
			time.Duration(config.Shutdown.TimeoutSeconds) * time.Second,
		)
		defer cancel()
		
		// Shutdown the server
		if err := app.ShutdownWithContext(ctx); err != nil {
			logger.Error("Server shutdown error", zap.Error(err))
		}
		
		logger.Info("Server gracefully stopped")
	}()
}`,
            },
          ]}
        />

        <Callout title="Kubernetes Tip" type="default">
          Configure your Kubernetes <code>livenessProbe</code> to use{" "}
          <code>/health</code> and <code>readinessProbe</code> to use{" "}
          <code>/ready</code>. Set <code>initialDelaySeconds</code> appropriately
          to allow for startup time.
        </Callout>

        <DocsPager
          prev={{
            href: "/docs/features/circuit-breaker",
            title: "Circuit Breaker",
          }}
          next={{
            href: "/docs/features/rate-limit-discovery",
            title: "Rate Limit Discovery",
          }}
        />
      </div>
    </div>
  );
}
