"use client";

import * as React from "react";
import { Metadata } from "next";
import {
  RefreshCw,
  Activity,
  Clock,
  AlertTriangle,
  CheckCircle2,
  Code2,
  Zap,
  TrendingUp,
} from "lucide-react";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Callout } from "@/components/docs/Callout";
import { CodeTabs } from "@/components/docs/CodeTabs";

// export const metadata: Metadata = {
//   title: "Automatic Retry with Backoff | RateGuard Documentation",
//   description:
//     "Intelligent retry logic with exponential backoff, Retry-After header support, and circuit breaker integration for maximum reliability.",
// };

export default function AutomaticRetryPage() {
  return (
    <div className="min-h-screen bg-background">
      {/* Hero Section */}
      <div className="border-b bg-linear-to-b from-muted/50 to-background">
        <div className="container max-w-5xl mx-auto px-6 py-16">
          <div className="flex items-start gap-4 mb-6">
            <div className="p-3 rounded-lg bg-primary/10 border border-primary/20">
              <RefreshCw className="size-8 text-primary" />
            </div>
            <div className="flex-1">
              <h1 className="text-4xl font-bold tracking-tight mb-3">
                Automatic Retry with Exponential Backoff
              </h1>
              <p className="text-xl text-muted-foreground leading-relaxed">
                Increase reliability with intelligent retry logic. Respects Retry-After
                headers, implements exponential backoff with jitter, and integrates
                with circuit breakers to prevent cascade failures.
              </p>
            </div>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-4 gap-4 mt-8">
            {[
              {
                icon: RefreshCw,
                color: "text-chart-1",
                name: "Up to 3 Retries",
                desc: "Configurable max retry attempts",
              },
              {
                icon: Clock,
                color: "text-chart-2",
                name: "Retry-After",
                desc: "Respects HTTP Retry-After headers",
              },
              {
                icon: TrendingUp,
                color: "text-primary",
                name: "Exponential Backoff",
                desc: "2^attempt * base delay + jitter",
              },
              {
                icon: Activity,
                color: "text-chart-3",
                name: "Circuit Integration",
                desc: "Coordinated with circuit breaker",
              },
            ].map((feature) => (
              <Card key={feature.name} className="border-2">
                <CardHeader className="pb-3">
                  <div className="flex items-center gap-2">
                    <feature.icon className={`size-4 ${feature.color}`} />
                    <CardTitle className="text-sm">{feature.name}</CardTitle>
                  </div>
                </CardHeader>
                <CardContent>
                  <p className="text-xs text-muted-foreground">{feature.desc}</p>
                </CardContent>
              </Card>
            ))}
          </div>
        </div>
      </div>

      {/* Main Content */}
      <div className="container max-w-5xl mx-auto px-6 py-12 space-y-16">
        {/* Overview */}
        <section>
          <div className="flex items-center gap-3 mb-6">
            <Zap className="size-6 text-primary" />
            <h2 className="text-3xl font-bold">Overview</h2>
          </div>

          <p className="text-muted-foreground mb-6 leading-relaxed">
            RateGuard automatically retries failed requests using intelligent
            algorithms that respect upstream API constraints and prevent overwhelming
            already-stressed services. The retry system integrates with both the queue
            manager and circuit breaker for comprehensive failure handling.
          </p>

          <Callout type="default" title="Three-Layer Retry Strategy">
            RateGuard implements retry logic at multiple levels:
            <ol className="mt-2 ml-4 space-y-1">
              <li>
                <strong>1. Basic Retry</strong> - Simple exponential backoff for
                network errors
              </li>
              <li>
                <strong>2. Queue-Aware Retry</strong> - Coordinates with request
                queueing on 429
              </li>
              <li>
                <strong>3. Circuit Breaker Integration</strong> - Prevents retries
                when circuit opens
              </li>
            </ol>
          </Callout>
        </section>

        {/* Retry Logic */}
        <section>
          <div className="flex items-center gap-3 mb-6">
            <RefreshCw className="size-6 text-primary" />
            <h2 className="text-3xl font-bold">Retry Logic Implementation</h2>
          </div>

          <p className="text-muted-foreground mb-6 leading-relaxed">
            The retry system uses exponential backoff to avoid overwhelming failing
            services while maximizing the chance of eventual success.
          </p>

          <CodeTabs
            examples={[
                {
                  language: "go",
                  label: "Go (Backend Core)",
                  code: `// executeWithRetry executes the request with retry logic
func (p *ProxyService) executeWithRetry(
    req *http.Request,
    maxRetries int,
) (*http.Response, error) {
    var lastError error
    
    for attempt := 0; attempt <= maxRetries; attempt++ {
        // Wait before retry (skip on first attempt)
        if attempt > 0 {
            // Exponential backoff with jitter
            baseDelay := time.Duration(math.Pow(2, float64(attempt-1))) * time.Second
            jitter := time.Duration(rand.Int63n(int64(500 * time.Millisecond)))
            waitTime := baseDelay + jitter
            
            logger.Debug("Retrying request",
                zap.Int("attempt", attempt),
                zap.Duration("wait", waitTime),
            )
            
            time.Sleep(waitTime)
        }
        
        // Execute request
        resp, err := p.httpClient.Do(req)
        if err != nil {
            lastError = err
            continue
        }
        
        // Success or client error (don't retry client errors)
        if resp.StatusCode < 500 {
            return resp, nil
        }
        
        // Server error - retry
        resp.Body.Close()
        lastError = fmt.Errorf("server error: %d", resp.StatusCode)
    }
    
    return nil, fmt.Errorf("max retries exceeded: %w", lastError)
}`,
                },
                {
                  language: "typescript",
                  label: "TypeScript Example",
                  code: `// Exponential backoff retry in client code
async function fetchWithRetry<T>(
  url: string,
  options: RequestInit = {},
  maxRetries = 3
): Promise<T> {
  let lastError: Error;

  for (let attempt = 0; attempt <= maxRetries; attempt++) {
    try {
      // Wait with exponential backoff (skip first attempt)
      if (attempt > 0) {
        const baseDelay = Math.pow(2, attempt - 1) * 1000; // ms
        const jitter = Math.random() * 500;
        const waitTime = baseDelay + jitter;
        
        console.log(\`Retry attempt \${attempt}, waiting \${waitTime}ms\`);
        await new Promise(resolve => setTimeout(resolve, waitTime));
      }

      const response = await fetch(url, options);

      // Check if request was successful
      if (response.ok) {
        return await response.json();
      }

      // Don't retry client errors (4xx)
      if (response.status >= 400 && response.status < 500) {
        throw new Error(\`Client error: \${response.status}\`);
      }

      // Retry server errors (5xx)
      lastError = new Error(\`Server error: \${response.status}\`);
    } catch (error) {
      lastError = error as Error;
      
      // Don't retry on network errors after max attempts
      if (attempt === maxRetries) {
        throw lastError;
      }
    }
  }

  throw new Error(\`Max retries (\${maxRetries}) exceeded: \${lastError.message}\`);
}`,
                },
              ]
            }
            defaultLanguage="go"
          />
        </section>

        {/* Retry-After Support */}
        <section>
          <div className="flex items-center gap-3 mb-6">
            <Clock className="size-6 text-primary" />
            <h2 className="text-3xl font-bold">Retry-After Header Support</h2>
          </div>

          <p className="text-muted-foreground mb-6 leading-relaxed">
            When upstream APIs return a 429 or 503 with a Retry-After header,
            RateGuard automatically waits the specified duration before retrying.
            Supports both HTTP-date and seconds formats.
          </p>

          <CodeTabs
            examples={[
                {
                  language: "go",
                  label: "Go (Retry-After Parsing)",
                  code: `// executeWithRetryAndBackoff handles retries with Retry-After support
func (p *ProxyService) executeWithRetryAndBackoff(
    req *http.Request,
    maxRetries int,
    userID uuid.UUID,
    apiName string,
) (*http.Response, error) {
    for attempt := 0; attempt <= maxRetries; attempt++ {
        resp, err := p.httpClient.Do(req)
        
        // Check for rate limit (429)
        if resp != nil && resp.StatusCode == 429 {
            // Try to get Retry-After header
            retryAfter := resp.Header.Get("Retry-After")
            var waitDuration time.Duration
            
            if retryAfter != "" {
                // Try parsing as seconds
                if seconds, err := strconv.Atoi(retryAfter); err == nil {
                    waitDuration = time.Duration(seconds) * time.Second
                } else {
                    // Try parsing as HTTP-date
                    if retryTime, err := http.ParseTime(retryAfter); err == nil {
                        waitDuration = time.Until(retryTime)
                    }
                }
            }
            
            // Default backoff if no Retry-After or if it's too long
            if waitDuration == 0 || waitDuration > 30*time.Second {
                baseDelay := math.Pow(2, float64(attempt)) * float64(time.Second)
                jitter := rand.Float64() * float64(time.Second)
                waitDuration = time.Duration(baseDelay + jitter)
            }
            
            logger.Info("Rate limited, waiting before retry",
                zap.String("api", apiName),
                zap.Duration("wait", waitDuration),
                zap.Int("attempt", attempt),
                zap.String("retry_after", retryAfter),
            )
            
            // Wait before retry
            time.Sleep(waitDuration)
            
            resp.Body.Close()
            continue
        }
        
        // Success or non-retryable error
        return resp, err
    }
    
    return nil, fmt.Errorf("max retries exceeded")
}`,
                },
                {
                  language: "typescript",
                  label: "TypeScript (Client-Side)",
                  code: `// Parse Retry-After header from response
function getRetryAfter(response: Response): number | null {
  const retryAfter = response.headers.get('Retry-After');
  
  if (!retryAfter) {
    return null;
  }
  
  // Try parsing as seconds
  const seconds = parseInt(retryAfter, 10);
  if (!isNaN(seconds)) {
    return seconds * 1000; // Convert to milliseconds
  }
  
  // Try parsing as HTTP-date
  const retryDate = new Date(retryAfter);
  if (!isNaN(retryDate.getTime())) {
    return Math.max(0, retryDate.getTime() -Date.now());
  }
  
  return null;
}

// Use Retry-After when retrying
async function fetchWithRetryAfter(url: string) {
  const maxRetries = 3;
  
  for (let attempt = 0; attempt <= maxRetries; attempt++) {
    const response = await fetch(url);
    
    if (response.status === 429) {
      const waitMs = getRetryAfter(response);
      
      if (waitMs !== null && waitMs < 30000) {
        console.log(\`Rate limited. Waiting \${waitMs}ms as requested\`);
        await new Promise(resolve => setTimeout(resolve, waitMs));
        continue;
      }
      
      // Fallback to exponential backoff
      const backoff = Math.pow(2, attempt) * 1000 + Math.random() * 500;
      await new Promise(resolve => setTimeout(resolve, backoff));
      continue;
    }
    
    return response;
  }
  
  throw new Error('Max retries exceeded');
}`,
                },
              ]
            }
            defaultLanguage="go"
          />

          <Callout type="success" title="Smart Retry-After Handling">
            <p className="mb-2">
              RateGuard intelligently handles Retry-After headers:
            </p>
            <ul className="ml-4 space-y-1 text-sm">
              <li>✓ Supports both seconds and HTTP-date formats</li>
              <li>✓ Caps maximum wait time at 30 seconds</li>
              <li>✓ Falls back to exponential backoff if header is invalid</li>
              <li>✓ Logs wait duration for observability</li>
            </ul>
          </Callout>
        </section>

        {/* Circuit Breaker Integration */}
        <section>
          <div className="flex items-center gap-3 mb-6">
            <Activity className="size-6 text-primary" />
            <h2 className="text-3xl font-bold">Circuit Breaker Integration</h2>
          </div>

          <p className="text-muted-foreground mb-6 leading-relaxed">
            Retry logic integrates with the circuit breaker to prevent retry storms
            when upstream APIs are failing. If the circuit opens, retries are blocked
            immediately to protect the failing service.
          </p>

          <CodeTabs
            examples={[
                {
                  language: "go",
                  label: "Go (Coordinated Retry)",
                  code: `// executeWithRetryAndCircuitBreaker coordinates retries with circuit breaker
func (p *ProxyService) executeWithRetryAndCircuitBreaker(
    req *http.Request,
    apiConfig *models.APIConfig,
) (*http.Response, error) {
    // Get circuit breaker for this API
    cb := p.circuitBreakers.GetOrCreate(apiConfig.ID.String(), apiConfig.Name)
    
    maxRetries := apiConfig.RetryAttempts
    if maxRetries == 0 {
        maxRetries = 3 // Default
    }
    
    for attempt := 0; attempt <= maxRetries; attempt++ {
        // Check circuit breaker state
        if !cb.CanAttempt() {
            return nil, ErrCircuitOpen
        }
        
        // Execute with retry logic
        var retryErr error
        resp, retryErr := p.executeWithRetry(req, 0) // Single attempt here
        lastError = retryErr
        
        if retryErr != nil {
            // Record failure in circuit breaker
            cb.RecordFailure()
            
            // Check if circuit just opened
            if cb.State() == CircuitOpen {
                logger.Warn("Circuit breaker opened, stopping retries",
                    zap.String("api", apiConfig.Name),
                    zap.Int("attempt", attempt),
                )
                return nil, ErrCircuitOpen
            }
            
            // Continue retrying if circuit still closed
            continue
        }
        
        // Success - record in circuit breaker
        if resp.StatusCode < 500 {
            cb.RecordSuccess()
            return resp, nil
        }
        
        // Server error - record and retry
        cb.RecordFailure()
        resp.Body.Close()
    }
    
    return nil, fmt.Errorf("max retries exceeded: %w", lastError)
}`,
                },
              ]
            }
            defaultLanguage="go"
          />

          <Callout type="warning" title="Circuit Breaker Prevents Retry Storms">
            When the circuit opens due to repeated failures, all subsequent retry
            attempts are blocked immediately. This protects the upstream API from
            being overwhelmed and allows it time to recover.
          </Callout>
        </section>

        {/* Configuration */}
        <section>
          <div className="flex items-center gap-3 mb-6">
            <Code2 className="size-6 text-primary" />
            <h2 className="text-3xl font-bold">Configuration</h2>
          </div>

          <p className="text-muted-foreground mb-6 leading-relaxed">
            Configure retry behavior per-API or use global defaults.
          </p>

          <CodeTabs
            examples={[
                {
                  language: "typescript",
                  label: "TypeScript",
                  code: `// Configure API with custom retry attempts
const apiConfig = {
  name: 'unstable-api',
  target_url: 'https://api.example.com',
  rate_limit_per_second: 10,
  retry_attempts: 5,  // ← Increase retries for unreliable API
  timeout_seconds: 30,
};

await fetch('/api/v1/apis', {
  method: 'POST',
  headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify(apiConfig),
});`,
                },
                {
                  language: "json",
                  label: "JSON (API Body)",
                  code: `{
  "name": "my-api",
  "target_url": "https://api.example.com",
  "rate_limit_per_second": 100,
  "burst_size": 200,
  "retry_attempts": 3,     // Max retry attempts (default: 3)
  "timeout_seconds": 30    // Request timeout (default: 30)
}`,
                },
              ]
            }
            defaultLanguage="typescript"
          />
        </section>

        {/* Best Practices */}
        <section>
          <div className="flex items-center gap-3 mb-6">
            <CheckCircle2 className="size-6 text-primary" />
            <h2 className="text-3xl font-bold">Best Practices</h2>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
            <Card className="border-2 border-primary/20">
              <CardHeader>
                <CardTitle className="text-lg flex items-center gap-2 text-primary">
                  <CheckCircle2 className="size-5" />
                  Do
                </CardTitle>
              </CardHeader>
              <CardContent>
                <ul className="space-y-2 text-sm">
                  {[
                    "Use 3-5 retry attempts for transient failures",
                    "Set appropriate timeout values (30-60s)",
                    "Monitor retry metrics and success rates",
                    "Respect Retry-After headers from upstream",
                    "Use circuit breakers with retry logic",
                    "Implement idempotency for retried requests",
                  ].map((item) => (
                    <li key={item} className="flex items-start gap-2">
                      <CheckCircle2 className="size-4 text-primary mt-0.5 shrink-0" />
                      <span>{item}</span>
                    </li>
                  ))}
                </ul>
              </CardContent>
            </Card>

            <Card className="border-2 border-destructive/20">
              <CardHeader>
                <CardTitle className="text-lg flex items-center gap-2 text-destructive">
                  <AlertTriangle className="size-5" />
                  Don&apos;t
                </CardTitle>
              </CardHeader>
              <CardContent>
                <ul className="space-y-2 text-sm">
                  {[
                    "Retry indefinitely without max limit",
                    "Ignore Retry-After headers",
                    "Retry non-idempotent operations without safeguards",
                    "Use retries as a substitute for proper error handling",
                    "Retry client errors (4xx) - these won't succeed",
                    "Set retry attempts too high (>5-10)",
                  ].map((item) => (
                    <li key={item} className="flex items-start gap-2">
                      <AlertTriangle className="size-4 text-destructive mt-0.5 shrink-0" />
                      <span>{item}</span>
                    </li>
                  ))}
                </ul>
              </CardContent>
            </Card>
          </div>
        </section>
      </div>
    </div>
  );
}
