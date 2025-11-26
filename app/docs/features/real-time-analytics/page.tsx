"use client";

import * as React from "react";
import { Metadata } from "next";
import {
  BarChart3,
  Activity,
  AlertTriangle,  
  TrendingUp,
  Bell,
  Code2,
  Zap,
  Clock,
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
//   title: "Real-Time Analytics & Monitoring | RateGuard Documentation",
//   description:
//     "Monitor your APIs in real-time with streaming metrics, intelligent alerts, and comprehensive analytics dashboards.",
// };

export default function RealTimeAnalyticsPage() {
  return (
    <div className="min-h-screen bg-background">
      {/* Hero Section */}
      <div className="border-b bg-linear-to-b from-muted/50 to-background">
        <div className="container max-w-5xl mx-auto px-6 py-16">
          <div className="flex items-start gap-4 mb-6">
            <div className="p-3 rounded-lg bg-primary/10 border border-primary/20">
              <BarChart3 className="size-8 text-primary" />
            </div>
            <div className="flex-1">
              <h1 className="text-4xl font-bold tracking-tight mb-3">
                Real-Time Analytics & Monitoring
              </h1>
              <p className="text-xl text-muted-foreground leading-relaxed">
                Monitor your APIs with streaming metrics, intelligent alert detection,
                and comprehensive analytics. Track performance, detect issues, and
                optimize usage in real-time.
              </p>
            </div>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-4 gap-4 mt-8">
            {[
              {
                icon: Activity,
                color: "text-chart-1",
                name: "Live Streaming",
                desc: "Server-Sent Events for real-time updates",
              },
              {
                icon: AlertTriangle,
                color: "text-chart-2",
                name: "Smart Alerts",
                desc: "Automatic detection of rate limit issues",
              },
              {
                icon: TrendingUp,
                color: "text-primary",
                name: "Usage Analytics",
                desc: "Track requests, costs, and patterns",
              },
              {
                icon: Clock,
                color: "text-chart-3",
                name: "5-Second Updates",
                desc: "Continuous monitoring every 5 seconds",
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
            <Activity className="size-6 text-primary" />
            <h2 className="text-3xl font-bold">Overview</h2>
          </div>

          <p className="text-muted-foreground mb-6 leading-relaxed">
            RateGuard provides comprehensive real-time monitoring through streaming
            metrics, intelligent alert detection, and detailed analytics. The system
            continuously monitors your APIs every 5 seconds, detecting issues before
            they become critical.
          </p>

          <Callout type="default" title="Three-Layer Monitoring System">
            RateGuard implements a <strong>three-layer monitoring approach</strong>:
            <ol className="mt-2 ml-4 space-y-1">
              <li><strong>1. Streaming Metrics</strong> - Live updates via Server-Sent Events</li>
              <li><strong>2. Alert Detection</strong> - Automated issue detection every 5 seconds</li>
              <li><strong>3. Historical Analytics</strong> - Cost analysis and usage patterns</li>
            </ol>
          </Callout>
        </section>

        {/* Streaming Metrics */}
        <section>
          <div className="flex items-center gap-3 mb-6">
            <Zap className="size-6 text-primary" />
            <h2 className="text-3xl font-bold">Streaming Metrics</h2>
          </div>

          <p className="text-muted-foreground mb-6 leading-relaxed">
            Connect to the streaming endpoint to receive real-time updates about your
            API usage, queue status, and system health.
          </p>

          <CodeTabs
            examples={[
                {
                  language: "typescript",
                  label: "TypeScript (React)",
                  code: `import { useEffect, useState } from 'react';

interface StreamingMetrics {
  total_requests: number;
  requests_today: number;
  active_apis: number;
  queue_depth: number;
  avg_response_time_ms: number;
  success_rate: number;
  timestamp: string;
}

export function useStreamingMetrics() {
  const [metrics, setMetrics] = useState<StreamingMetrics | null>(null);
  const [isConnected, setIsConnected] = useState(false);

  useEffect(() => {
    const eventSource = new EventSource('/api/v1/dashboard/stats/streaming', {
      withCredentials: true,
    });

    eventSource.onopen = () => {
      console.log('Connected to streaming metrics');
      setIsConnected(true);
    };

    eventSource.onmessage = (event) => {
      const data = JSON.parse(event.data);
      setMetrics(data);
    };

    eventSource.onerror = (error) => {
      console.error('Streaming error:', error);
      setIsConnected(false);
      eventSource.close();
    };

    return () => {
      eventSource.close();
      setIsConnected(false);
    };
  }, []);

  return { metrics, isConnected };
}`,
                },
                {
                  language: "javascript",
                  label: "JavaScript (Browser)",
                  code: `// Connect to streaming endpoint
const eventSource = new EventSource(
  'https://api.rateguard.io/api/v1/dashboard/stats/streaming',
  { withCredentials: true }
);

// Handle incoming metrics
eventSource.onmessage = (event) => {
  const metrics = JSON.parse(event.data);
  
  updateDashboard({
    totalRequests: metrics.total_requests,
    requestsToday: metrics.requests_today,
    activeAPIs: metrics.active_apis,
    queueDepth: metrics.queue_depth,
    avgResponseTime: metrics.avg_response_time_ms,
    successRate: metrics.success_rate,
  });
};

// Handle connection events
eventSource.onopen = () => {
  console.log('✓ Connected to streaming metrics');
};

eventSource.onerror = (error) => {
  console.error('Streaming connection error:', error);
  eventSource.close();
};`,
                },
                {
                  language: "go",
                  label: "Go (Backend Implementation)",
                  code: `// Handler for streaming stats endpoint
func (h *DashboardHandler) GetStreamingStats(c *fiber.Ctx) error {
    user := c.Locals("user").(*models.User)
    
    // Set SSE headers
    c.Set("Content-Type", "text/event-stream")
    c.Set("Cache-Control", "no-cache")
    c.Set("Connection", "keep-alive")
    c.Set("X-Accel-Buffering", "no")
    
    // Streaming loop - send updates every 5 seconds
    ticker := time.NewTicker(5 * time.Second)
    defer ticker.Stop()
    
    ctx := c.Context()
    
    for {
        select {
        case <-ctx.Done():
            return nil
        case <-ticker.C:
            stats, err := h.usageTracker.GetDashboardStats(ctx, user.ID)
            if err != nil {
                logger.Error("Failed to get stats", zap.Error(err))
                continue
            }
            
            data, _ := json.Marshal(stats)
            fmt.Fprintf(c, "data: %s\\n\\n", data)
            
            if err := c.Context().Conn().Flush(); err != nil {
                return nil
            }
        }
    }
}`,
                },
              ]
            }
            defaultLanguage="typescript"
          />
        </section>

        {/* Alert Detection */}
        <section>
          <div className="flex items-center gap-3 mb-6">
            <Bell className="size-6 text-primary" />
            <h2 className="text-3xl font-bold">Intelligent Alert Detection</h2>
          </div>

          <p className="text-muted-foreground mb-6 leading-relaxed">
            RateGuard automatically detects three types of critical issues and surfaces
            them as alerts in your dashboard. The alert detector runs every 5 seconds
            in a background process.
          </p>

          <div className="grid grid-cols-1 md:grid-cols-3 gap-4 mb-6">
            <Card className="border-2 border-destructive/20">
              <CardHeader>
                <CardTitle className="text-lg flex items-center gap-2">
                  <AlertTriangle className="size-5 text-destructive" />
                  High 429 Rate
                </CardTitle>
                <CardDescription>Critical Alert</CardDescription>
              </CardHeader>
              <CardContent>
                <p className="text-sm text-muted-foreground mb-2">
                  Triggered when an API experiences{" "}
                  <strong>&gt;10% 429 errors</strong> in the last 5 minutes.
                </p>
                <Badge variant="destructive">Auto-detected</Badge>
              </CardContent>
            </Card>

            <Card className="border-2 border-yellow-500/20">
              <CardHeader>
                <CardTitle className="text-lg flex items-center gap-2">
                  <TrendingUp className="size-5 text-yellow-600" />
                  Approaching Limit
                </CardTitle>
                <CardDescription>Warning Alert</CardDescription>
              </CardHeader>
              <CardContent>
                <p className="text-sm text-muted-foreground mb-2">
                  Triggered when usage reaches <strong>&gt;80%</strong> of rate limit
                  in the last minute.
                </p>
                <Badge className="bg-yellow-500/20 text-yellow-700">Predictive</Badge>
              </CardContent>
            </Card>

            <Card className="border-2 border-destructive/20">
              <CardHeader>
                <CardTitle className="text-lg flex items-center gap-2">
                  <Activity className="size-5 text-destructive" />
                  Circuit Breaker Open
                </CardTitle>
                <CardDescription>Critical Alert</CardDescription>
              </CardHeader>
              <CardContent>
                <p className="text-sm text-muted-foreground mb-2">
                  Triggered when a circuit breaker opens due to upstream API failures.
                </p>
                <Badge variant="destructive">Non-dismissible</Badge>
              </CardContent>
            </Card>
          </div>

          <CodeTabs
            examples={[
                {
                  language: "go",
                  label: "High 429 Rate Detection",
                  code: `// detectHigh429Rate checks for APIs experiencing high 429 error rates
func (d *AlertDetector) detectHigh429Rate(ctx context.Context) error {
    // Query for high 429 rates in the last 5 minutes
    query := \`
        WITH recent_429s AS (
            SELECT 
                user_id,
                target_api,
                COUNT(*) FILTER (WHERE status_code = 429) as error_count,
                COUNT(*) as total_count
            FROM api_metrics
            WHERE timestamp > NOW() - INTERVAL '5 minutes'
            GROUP BY user_id, target_api
            HAVING COUNT(*) FILTER (WHERE status_code = 429) > 0
        ),
        api_details AS (
            SELECT 
                ac.id as api_id,
                ac.user_id,
                ac.name as api_name,
                r.error_count,
                r.total_count,
                ROUND((r.error_count::numeric / r.total_count::numeric) * 100, 1) as error_rate
            FROM recent_429s r
            JOIN api_configs ac ON ac.user_id = r.user_id AND ac.name = r.target_api
            WHERE (r.error_count::numeric / r.total_count::numeric) >= 0.1  -- 10% threshold
        )
        SELECT user_id, api_id, api_name, error_count, total_count, error_rate
        FROM api_details
        ORDER BY error_rate DESC
    \`
    
    rows, err := d.db.QueryContext(ctx, query)
    if err != nil {
        return fmt.Errorf("failed to query 429 rates: %w", err)
    }
    defer rows.Close()
    
    // Create alerts for affected users
    for rows.Next() {
        var userID, apiID uuid.UUID
        var apiName string
        var errorCount, totalCount int64
        var errorRate float64
        
        rows.Scan(&userID, &apiID, &apiName, &errorCount, &totalCount, &errorRate)
        
        alert := models.Alert{
            ID:          fmt.Sprintf("429-%s-%d", apiID, time.Now().Unix()),
            Type:        models.AlertTypeCritical,
            Title:       "High Rate Limit Errors",
            Message:     fmt.Sprintf("API '%s' is experiencing high 429 errors (%.1f%% of requests)", apiName, errorRate),
            APIName:     apiName,
            Metric:      "429_rate",
            MetricValue: errorRate / 100.0,
            DetectedAt:  time.Now(),
            Dismissible: true,
        }
        
        d.cacheMutex.Lock()
        d.alertCache[userID] = append(d.alertCache[userID], alert)
        d.cacheMutex.Unlock()
    }
    
    return nil
}`,
                },
                {
                  language: "typescript",
                  label: "Fetching Alerts",
                  code: `// Fetch current alerts for the authenticated user
async function fetchAlerts(): Promise<Alert[]> {
  const response = await fetch('/api/v1/alerts', {
    headers: {
      'Authorization': \`Bearer \${token}\`,
    },
  });
  
  if (!response.ok) {
    throw new Error('Failed to fetch alerts');
  }
  
  const alerts = await response.json();
  return alerts;
}

// Alert interface
interface Alert {
  id: string;
  type: 'critical' | 'warning' | 'info';
  title: string;
  message: string;
  api_id?: string;
  api_name?: string;
  metric: string;
  metric_value: number;
  detected_at: string;
  dismissible: boolean;
}

// Display alerts in UI
function AlertList({ alerts }: { alerts: Alert[] }) {
  return (
    <div className="space-y-2">
      {alerts.map((alert) => (
        <Alert key={alert.id} variant={alert.type}>
          <AlertTitle>{alert.title}</AlertTitle>
          <AlertDescription>
            {alert.message}
            {alert.api_name && (
              <Badge className="ml-2">{alert.api_name}</Badge>
            )}
          </AlertDescription>
        </Alert>
      ))}
    </div>
  );
}`,
                },
              ]
            }
            defaultLanguage="go"
          />
        </section>

        {/* Usage Analytics */}
        <section>
          <div className="flex items-center gap-3 mb-6">
            <BarChart3 className="size-6 text-primary" />
            <h2 className="text-3xl font-bold">Historical Analytics</h2>
          </div>

          <p className="text-muted-foreground mb-6 leading-relaxed">
            Track API usage patterns, costs, and performance metrics over time.
            RateGuard stores all metrics in PostgreSQL for historical analysis and
            cost optimization.
          </p>

          <CodeTabs
            examples={[
                {
                  language: "typescript",
                  label: "Dashboard Stats Interface",
                  code: `// Complete dashboard statistics structure
interface DashboardStats {
  total_requests: number;
  requests_today: number;
  active_apis: number;
  avg_response_time_ms: number;
  success_rate: number;  // 0.0 - 1.0
  monthly_usage: number;
  plan_limit: number;
  usage_by_api: UsageByAPI[];
  usage_percentages: {
    daily_pct: number;    // 0-100
    monthly_pct: number;  // 0-100
  };
  timestamp: string;
}

interface UsageByAPI {
  api_name: string;
  requests: number;
  avg_duration_ms: number;
  success_rate: number;
  error_rate: number;
  last_used: string;
}

// Fetch dashboard stats
async function getDashboardStats(): Promise<DashboardStats> {
  const response = await fetch('/api/v1/dashboard/stats');
  return response.json();
}`,
                },
                {
                  language: "go",
                  label: "Cost Estimation",
                  code: `// CostEstimator calculates API usage costs
type CostEstimator struct {
    db *sql.DB
}

func (c *CostEstimator) EstimateMonthlyCost(
    ctx context.Context,
    userID uuid.UUID,
) (*CostEstimate, error) {
    // Get usage stats for the current month
    query := \`
        SELECT 
            target_api,
            COUNT(*) as request_count,
            AVG(duration_ms) as avg_duration
        FROM api_metrics
        WHERE user_id = $1
          AND timestamp >= date_trunc('month', NOW())
        GROUP BY target_api
    \`
    
    rows, err := c.db.QueryContext(ctx, query, userID)
    if err != nil {
        return nil, err
    }
    defer rows.Close()
    
    var totalCost float64
    apiCosts := make(map[string]float64)
    
    for rows.Next() {
        var apiName string
        var requestCount int64
        var avgDuration float64
        
        rows.Scan(&apiName, &requestCount, &avgDuration)
        
        // Cost calculation: Base + (requests/1000 * rate)
        baseCost := 0.0
        perThousandCost := 0.002 // $0.002 per 1000 requests
        
        apiCost := baseCost + (float64(requestCount) / 1000.0 * perThousandCost)
        apiCosts[apiName] = apiCost
        totalCost += apiCost
    }
    
    return &CostEstimate{
        TotalCost:      totalCost,
        CostByAPI:      apiCosts,
        EstimatedMonth: time.Now().Format("2006-01"),
    }, nil
}`,
                },
              ]
            }
            defaultLanguage="typescript"
          />
        </section>

        {/* API Endpoints */}
        <section>
          <div className="flex items-center gap-3 mb-6">
            <Code2 className="size-6 text-primary" />
            <h2 className="text-3xl font-bold">API Endpoints</h2>
          </div>

          <div className="space-y-4">
            <Card>
              <CardHeader>
                <CardTitle className="text-lg font-mono">
                  GET /api/v1/dashboard/stats
                </CardTitle>
                <CardDescription>
                  Get current dashboard statistics (snapshot)
                </CardDescription>
              </CardHeader>
              <CardContent>
                <p className="text-sm text-muted-foreground mb-2">
                  Returns complete dashboard stats including usage by API, success
                  rates, and performance metrics.
                </p>
                <Badge>Authenticated</Badge>
              </CardContent>
            </Card>

            <Card>
              <CardHeader>
                <CardTitle className="text-lg font-mono">
                  GET /api/v1/dashboard/stats/streaming
                </CardTitle>
                <CardDescription>
                  Stream real-time metrics via Server-Sent Events
                </CardDescription>
              </CardHeader>
              <CardContent>
                <p className="text-sm text-muted-foreground mb-2">
                  Long-lived connection that pushes updates every 5 seconds. Use for
                  live dashboards and monitoring.
                </p>
                <div className="flex gap-2">
                  <Badge>Authenticated</Badge>
                  <Badge variant="outline">SSE</Badge>
                </div>
              </CardContent>
            </Card>

            <Card>
              <CardHeader>
                <CardTitle className="text-lg font-mono">
                  GET /api/v1/alerts
                </CardTitle>
                <CardDescription>
                  Get current active alerts for user
                </CardDescription>
              </CardHeader>
              <CardContent>
                <p className="text-sm text-muted-foreground mb-2">
                  Returns all active alerts including 429 rate alerts, approaching
                  limit warnings, and circuit breaker status.
                </p>
                <Badge>Authenticated</Badge>
              </CardContent>
            </Card>

            <Card>
              <CardHeader>
                <CardTitle className="text-lg font-mono">
                  GET /api/v1/analytics/cost
                </CardTitle>
                <CardDescription>
                  Get cost estimates and breakdown
                </CardDescription>
              </CardHeader>
              <CardContent>
                <p className="text-sm text-muted-foreground mb-2">
                  Returns estimated monthly costs broken down by API, helping optimize
                  spending and usage patterns.
                </p>
                <Badge>Authenticated</Badge>
              </CardContent>
            </Card>
          </div>
        </section>

        {/* Best Practices */}
        <section>
          <div className="flex items-center gap-3 mb-6">
            <Activity className="size-6 text-primary" />
            <h2 className="text-3xl font-bold">Best Practices</h2>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
            <Card className="border-2 border-primary/20">
              <CardHeader>
                <CardTitle className="text-lg flex items-center gap-2 text-primary">
                  <Activity className="size-5" />
                  Do
                </CardTitle>
              </CardHeader>
              <CardContent>
                <ul className="space-y-2 text-sm">
                  {[
                    "Use streaming endpoint for live dashboards",
                    "Implement reconnection logic for SSE",
                    "Monitor alerts and respond to warnings",
                    "Track cost estimates monthly",
                    "Set up alert notifications (email/Slack)",
                    "Review historical analytics for patterns",
                  ].map((item) => (
                    <li key={item} className="flex items-start gap-2">
                      <Activity className="size-4 text-primary mt-0.5 shrink-0" />
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
                    "Poll stats endpoint rapidly (use streaming instead)",
                    "Ignore circuit breaker alerts",
                    "Dismiss all alerts without investigating",
                    "Keep SSE connections open indefinitely without health checks",
                    "Ignore approaching limit warnings",
                    "Forget to handle SSE reconnection on failure",
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
