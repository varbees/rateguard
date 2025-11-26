
"use client";

// import { Metadata } from "next";
import { CircuitBoard, AlertTriangle, BarChart3, Code } from "lucide-react";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { CodeBlock } from "@/components/docs/code-block";
import { DocsSectionHeader } from "@/components/docs/section-header";
import { DocsPager } from "@/components/docs/pager";

// export const metadata: Metadata = {
//   title: "Circuit Breaker | RateGuard Documentation",
//   description:
//     "Learn about RateGuard's circuit breaker pattern implementation for fault tolerance.",
// };

export default function CircuitBreakerPage() {
  return (
    <div className="space-y-8">
      <div className="space-y-4">
        <h1 className="text-3xl font-bold tracking-tight">
          Circuit Breaker Pattern
        </h1>
        <p className="text-xl text-muted-foreground">
          Automatic failover when upstream APIs fail with graceful recovery.
        </p>
      </div>

      <div className="grid gap-8">
        <DocsSectionHeader
          icon={<CircuitBoard className="h-5 w-5" />}
          title="How It Works"
          description="Understand how our circuit breaker pattern protects your systems."
        />

        <div className="prose prose-slate dark:prose-invert max-w-none">
          <p>
            The circuit breaker pattern is a fault tolerance mechanism that
            prevents cascading failures in distributed systems. When an upstream
            API starts failing, the circuit breaker &quot;opens&quot; to prevent
            further requests, allowing the failing service time to recover.
          </p>

          <h3>Circuit States</h3>
          <ul>
            <li>
              <strong>Closed</strong> - Normal operation, requests flow through
              to the upstream API
            </li>
            <li>
              <strong>Open</strong> - Circuit is tripped, requests fail fast
              without hitting the upstream API
            </li>
            <li>
              <strong>Half-Open</strong> - Testing recovery, allows limited
              requests to check if the API has recovered
            </li>
          </ul>

          <h3>Key Features</h3>
          <ul>
            <li>
              <strong>Per-API isolation</strong> - Each API has its own circuit
              breaker
            </li>
            <li>
              <strong>Configurable thresholds</strong> - Set failure count,
              timeout, and recovery parameters
            </li>
            <li>
              <strong>Automatic recovery</strong> - Periodically tests if the
              upstream API has recovered
            </li>
            <li>
              <strong>Real-time metrics</strong> - Monitor circuit state and
              failure rates in the dashboard
            </li>
            <li>
              <strong>Dashboard integration</strong> - Visual indicators of
              circuit state and history
            </li>
          </ul>
        </div>

        <DocsSectionHeader
          icon={<AlertTriangle className="h-5 w-5" />}
          title="Configuration"
          description="Learn how to configure circuit breakers for your APIs."
        />

        <div className="prose prose-slate dark:prose-invert max-w-none">
          <p>
            Circuit breakers can be configured globally or per-API. The
            following parameters are available:
          </p>

          <h3>Global Configuration</h3>
          <CodeBlock
            language="yaml"
            value={`circuit_breaker:
  enabled: true
  failure_threshold: 5        # Number of failures before opening circuit
  recovery_timeout: 60        # Seconds to wait before testing recovery
  half_open_max_requests: 1   # Max requests in half-open state
  failure_statuses: [500, 502, 503, 504]  # HTTP status codes counted as failures
  timeout_seconds: 30         # Request timeout that counts as failure`}
          />

          <h3>Per-API Configuration</h3>
          <p>You can override the global configuration for specific APIs:</p>

          <CodeBlock
            language="json"
            value={`{
  "name": "sensitive-api",
  "target_url": "https://api.example.com/v1",
  "rate_limit_per_second": 10,
  "circuit_breaker": {
    "enabled": true,
    "failure_threshold": 3,
    "recovery_timeout": 120,
    "half_open_max_requests": 2
  }
}`}
          />
        </div>

        <DocsSectionHeader
          icon={<BarChart3 className="h-5 w-5" />}
          title="Dashboard Integration"
          description="Monitor circuit breaker status in real-time."
        />

        <div className="prose prose-slate dark:prose-invert max-w-none">
          <p>
            The RateGuard dashboard provides real-time monitoring of circuit
            breaker status:
          </p>

          <ul>
            <li>
              <strong>Circuit State Indicators</strong> - Visual indicators
              showing Closed, Open, or Half-Open state
            </li>
            <li>
              <strong>Failure Rate Charts</strong> - Real-time graphs of failure
              rates per API
            </li>
            <li>
              <strong>State Transition History</strong> - Timeline of when
              circuits opened and closed
            </li>
            <li>
              <strong>Manual Override</strong> - Force reset circuits that are
              stuck in the open state
            </li>
          </ul>

          <p>
            To access the circuit breaker dashboard, navigate to the
            &quot;Circuit Breakers&quot; tab in your RateGuard dashboard.
          </p>
        </div>

        <DocsSectionHeader
          icon={<Code className="h-5 w-5" />}
          title="Implementation"
          description="See how circuit breakers are implemented in code."
        />

        <Tabs defaultValue="go">
          <TabsList>
            <TabsTrigger value="go">Go Implementation</TabsTrigger>
            <TabsTrigger value="usage">Usage Example</TabsTrigger>
          </TabsList>
          <TabsContent value="go" className="mt-4">
            <CodeBlock
              language="go"
              value={`// CircuitBreaker implements the circuit breaker pattern
type CircuitBreaker struct {
	name            string
	state           State
	failureCount    int
	failureThreshold int
	lastStateChange time.Time
	recoveryTimeout time.Duration
	halfOpenMaxReqs int
	halfOpenReqs    int
	mutex           sync.RWMutex
}

// Execute runs the given request if the circuit is closed or half-open
// Returns error if circuit is open
func (cb *CircuitBreaker) Execute(ctx context.Context, req *http.Request) (*http.Response, error) {
	cb.mutex.RLock()
	state := cb.state
	cb.mutex.RUnlock()

	switch state {
	case StateClosed:
		// Normal operation
		return cb.executeRequest(ctx, req)
	case StateOpen:
		// Check if recovery timeout has elapsed
		if time.Since(cb.lastStateChange) > cb.recoveryTimeout {
			cb.mutex.Lock()
			cb.state = StateHalfOpen
			cb.halfOpenReqs = 0
			cb.lastStateChange = time.Now()
			cb.mutex.Unlock()
			return cb.executeRequest(ctx, req)
		}
		return nil, ErrCircuitOpen
	case StateHalfOpen:
		// Allow limited requests to test recovery
		cb.mutex.Lock()
		if cb.halfOpenReqs >= cb.halfOpenMaxReqs {
			cb.mutex.Unlock()
			return nil, ErrCircuitOpen
		}
		cb.halfOpenReqs++
		cb.mutex.Unlock()
		return cb.executeRequest(ctx, req)
	default:
		return nil, fmt.Errorf("unknown circuit state: %v", state)
	}
}`}
            />
          </TabsContent>
          <TabsContent value="usage" className="mt-4">
            <CodeBlock
              language="go"
              value={`// Example usage in a proxy service
func (p *ProxyService) executeWithRetryAndCircuitBreaker(req *http.Request, apiConfig *models.APIConfig) (*http.Response, error) {
	// Get or create circuit breaker for this API
	cb := p.circuitBreakers.GetCircuitBreaker(apiConfig.Name)
	
	// Execute with circuit breaker protection
	resp, err := cb.Execute(req.Context(), req)
	if err != nil {
		if errors.Is(err, ErrCircuitOpen) {
			// Circuit is open, fail fast
			return nil, fmt.Errorf("circuit breaker open for %s: %w", apiConfig.Name, err)
		}
		return nil, err
	}
	
	return resp, nil
}`}
            />
          </TabsContent>
        </Tabs>

        <DocsPager
          prev={{
            href: "/docs/features/distributed-rate-limiting",
            title: "Distributed Rate Limiting",
          }}
          next={{
            href: "/docs/features/health-checks",
            title: "Health Checks",
          }}
        />
      </div>
    </div>
  );
}
