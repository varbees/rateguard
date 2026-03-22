import type {
    APIConfig as GeneratedAPIConfig,
    AlertsResponse as GeneratedAlertsResponse,
    CircuitBreakerMetrics as GeneratedCircuitBreakerMetrics,
    CircuitBreakerStats as GeneratedCircuitBreakerStats,
    CostEstimate as GeneratedCostEstimate,
    DashboardStats as GeneratedDashboardStats,
    ModelPricing as GeneratedModelPricing,
    QueueConfig as GeneratedQueueConfig,
    QueueStats as GeneratedQueueStats,
    TokenUsageSummary as GeneratedTokenUsageSummary,
    UsageStats as GeneratedUsageStats,
    User as GeneratedUser,
    WebhookConfig as GeneratedWebhookConfig,
    WebhookEvent as GeneratedWebhookEvent,
    WebhookStats as GeneratedWebhookStats,
} from "./rateguard-generated";

// Strip the `[key: string]: unknown` catch-all index signature from generated types
type KnownProps<T> = {
    [K in keyof T as string extends K ? never : K]: T[K];
};

export type User = KnownProps<GeneratedUser> & {
    id: string;
    email: string;
    handle: string;
    preset?: string;
    active: boolean;
    email_verified: boolean;
    api_key?: string;
    country_code?: string;
    detected_currency?: string;
    last_login_at?: string;
    created_at: string;
    updated_at: string;
};

export type APIConfig = KnownProps<GeneratedAPIConfig> & {
    id: string;
    user_id: string;
    name: string;
    slug: string;
    target_url: string;
    proxy_url?: string;
    rate_limit_per_second: number;
    burst_size: number;
    rate_limit_per_hour: number;
    rate_limit_per_day: number;
    rate_limit_per_month: number;
    allowed_origins: string[];
    enabled: boolean;
    auth_type: "none" | "bearer" | "api_key" | "basic";
    auth_credentials?: Record<string, string>;
    timeout_seconds: number;
    retry_attempts: number;
    created_at: string;
    updated_at: string;
    custom_headers?: Record<string, string>;
    provider?: string;
};

export type DashboardStats = KnownProps<GeneratedDashboardStats> & {
    stats: {
        total_requests: number;
        requests_today: number;
        active_apis: number;
        avg_response_time_ms: number;
        success_rate: number;
        monthly_usage: number;
        plan_limit: number;
        usage_by_api: Array<{
            api_name: string;
            requests: number;
            avg_duration_ms: number;
            success_rate: number;
            error_rate: number;
            last_used: string;
        }>;
        usage_percentages: {
            daily_pct: number;
            monthly_pct: number;
        };
        timestamp: string;
    };
    preset: {
        tier: string;
        features: {
            max_apis: number;
            max_requests_per_day: number;
            max_requests_per_month: number;
            advanced_analytics: boolean;
            priority_support: boolean;
            custom_rate_limits: boolean;
            webhooks: boolean;
            api_access: boolean;
        };
        limits: {
            apis: { used: number; max: number };
            requests: { used: number; max: number };
        };
    };
};

export type UsageStats = KnownProps<GeneratedUsageStats> & {
    user_id: string;
    total_requests: number;
    apis_used: number;
    avg_duration_ms: number;
    success_rate: number;
    error_rate: number;
    period: string;
    period_start: string;
    period_end: string;
};

export type AlertsResponse = KnownProps<GeneratedAlertsResponse> & {
    alerts: Array<Record<string, unknown>>;
    count: number;
};

export type CostEstimate = KnownProps<GeneratedCostEstimate> & {
    today_cost: number;
    monthly_projection: number;
    mtd_cost: number;
    mtd_requests: number;
    api_costs: Array<{
        api_id: string;
        api_name: string;
        request_count: number;
        cost_per_request: number;
        total_cost: number;
    }>;
    calculated_at: string;
    mtd_tokens?: number;
    tokens_by_model?: Record<string, number>;
    cost_by_model?: Record<string, number>;
};

export type QueueStats = KnownProps<GeneratedQueueStats> & {
    active_queues: number;
    total_queued_requests: number;
    longest_queued_time_ms: number;
    avg_wait_time_ms: number;
    peak_queue_length: number;
    total_requests_queued_24h: number;
    queued_by_api: Array<{
        api_name: string;
        queued_requests: number;
        avg_wait_time_ms: number;
        rate_limit_hits_24h: number;
    }>;
    timestamp: string;
};

export type QueueConfig = KnownProps<GeneratedQueueConfig> & {
    enabled: boolean;
    max_wait_time_ms: number;
    queueing_strategy: "fifo" | "priority" | "weighted";
    per_api_settings: Array<{
        api_name: string;
        enabled: boolean;
        max_wait_time_ms: number;
        max_queue_length: number;
        priority: number;
    }>;
};

export type CircuitBreakerStats = KnownProps<GeneratedCircuitBreakerStats> & {
    timestamp: string;
    total_circuit_breakers: number;
    closed_count: number;
    open_count: number;
    half_open_count: number;
    open_apis: string[];
    total_requests: number;
    total_successes: number;
    total_failures: number;
    total_rejections: number;
};

export type CircuitBreakerMetrics = KnownProps<GeneratedCircuitBreakerMetrics> & {
    state: "closed" | "open" | "half-open";
    state_string: string;
    api_name: string;
    total_requests: number;
    total_successes: number;
    total_failures: number;
    total_rejections: number;
    consecutive_failures: number;
    consecutive_successes: number;
    state_transitions: number;
    time_in_state: string;
    last_state_change: string;
};

export type TokenUsageSummary = KnownProps<GeneratedTokenUsageSummary> & {
    user_id: string;
    total_tokens: number;
    input_tokens: number;
    output_tokens: number;
    total_cost_cents: number;
    total_cost_usd: number;
    by_model: Record<
        string,
        {
            model: string;
            tokens: number;
            requests: number;
            cost_cents: number;
            cost_usd: number;
        }
    >;
    period: string;
    calculated_at: string;
};

export type ModelPricing = KnownProps<GeneratedModelPricing> & {
    provider: string;
    model: string;
    input_price_per_million: number;
    output_price_per_million: number;
    effective_date: string;
};

export type WebhookEvent = KnownProps<GeneratedWebhookEvent> & {
    id: string;
    user_id: string;
    source: string;
    event_type: string;
    payload: Record<string, unknown>;
    headers?: Record<string, string>;
    target_url: string;
    status: "pending" | "processing" | "delivered" | "failed" | "dead_letter";
    retries: number;
    max_retries: number;
    next_attempt_at?: string;
    last_error?: string;
    last_attempt_at?: string;
    delivered_at?: string;
    response_status_code?: number;
    response_body?: string;
    created_at: string;
    updated_at: string;
};

export type WebhookStats = KnownProps<GeneratedWebhookStats> & {
    database_stats: {
        total: number;
        pending: number;
        processing: number;
        delivered: number;
        failed: number;
        dead_letter: number;
        last_24h: number;
        last_hour: number;
    };
    worker_metrics: {
        delivery_attempts: number;
        successful_deliveries: number;
        failed_deliveries: number;
        worker_count: number;
        poll_interval_seconds: number;
    };
    config: {
        max_retries: number;
        base_retry_delay: string;
        max_retry_delay: string;
        delivery_timeout: string;
    };
    timestamp: string;
};

export type WebhookConfig = KnownProps<GeneratedWebhookConfig> & {
    inbox_url: string;
    destination_url: string;
    retry_policy: "auto" | "custom";
    max_retries?: number;
    retry_delays?: number[];
    dead_letter_action: "store" | "discard" | "email";
    signature_secret?: string;
    enabled: boolean;
    event_types: string[];
};
