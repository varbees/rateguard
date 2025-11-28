import type { APIConfig } from "../api";

export interface APIMetrics {
  api_id: string;
  api_name: string;
  requests_today: number;
  requests_hour: number;
  success_rate: number;
  avg_latency_ms: number;
  p95_latency_ms: number;
  error_count: number;
  last_request_at: string | null;
  circuit_breaker: {
    state: "closed" | "open" | "half-open";
    failures: number;
    last_failure?: string;
  };
  queue_status: {
    pending: number;
    failed: number;
  };
}

export interface APIWithMetrics extends APIConfig {
  metrics?: APIMetrics;
  isLive?: boolean;
}
