import { QueryClient } from "@tanstack/react-query";
import type {
    APIConfig as ContractAPIConfig,
    CircuitBreakerMetrics as ContractCircuitBreakerMetrics,
    CircuitBreakerStats as ContractCircuitBreakerStats,
    CostEstimate as ContractCostEstimate,
    DashboardStats as ContractDashboardStats,
    ModelPricing as ContractModelPricing,
    QueueConfig as ContractQueueConfig,
    QueueStats as ContractQueueStats,
    TokenUsageSummary as ContractTokenUsageSummary,
    UsageStats as ContractUsageStats,
    User as ContractUser,
    WebhookConfig as ContractWebhookConfig,
    WebhookEvent as ContractWebhookEvent,
    WebhookStats as ContractWebhookStats,
} from "./contracts/rateguard-sdk";
import { slugify } from "@/lib/utils-slug";

// Strip the `[key: string]: unknown` catch-all index signature that the
// generated SDK adds to every interface. Without this, intersecting with
// concrete field types still resolves those fields as `unknown`, causing
// implicit-any errors in strict mode during the Docker/CI build.
type KnownProps<T> = {
    [K in keyof T as string extends K ? never : K]: T[K];
};

// In production, we use Next.js Rewrites (proxy) to avoid CORS/Cookie issues.
// This makes requests relative (e.g. /api/v1/...) which Vercel forwards to Render.
// In development, we use the direct URL or localhost.
const isProduction = process.env.NODE_ENV === "production";
const API_BASE_URL = isProduction
    ? ""
    : process.env.NEXT_PUBLIC_API_URL || "http://localhost:8008";

// API response types backed by the generated SDK and extended for UI needs.
export type User = KnownProps<ContractUser> & {
    handle: string;
    api_key?: string;
    country_code?: string;
    detected_currency?: string;
    preset?: string;
    last_login_at?: string;
    created_at?: string;
    updated_at?: string;
};

export type APIConfig = KnownProps<ContractAPIConfig> & {
    user_id?: string;
    slug?: string;
    target_url?: string;
    proxy_url?: string;
    rate_limit_per_hour?: number;
    rate_limit_per_day?: number;
    rate_limit_per_month?: number;
    allowed_origins?: string[];
    auth_type?: "none" | "bearer" | "api_key" | "basic";
    auth_credentials?: Record<string, string>;
    timeout_seconds?: number;
    retry_attempts?: number;
    created_at?: string;
    updated_at?: string;
    custom_headers?: Record<string, string>;
    provider?: string;
};

export interface UsageByAPI {
    api_name: string;
    requests: number;
    avg_duration_ms: number;
    success_rate: number;
    error_rate: number;
    last_used: string;
}

export interface DashboardStatsData {
    total_requests: number;
    requests_today: number;
    active_apis: number;
    avg_response_time_ms: number;
    success_rate: number;
    monthly_usage: number;
    monthly_request_limit: number;
    usage_by_api: UsageByAPI[];
    usage_percentages: {
        daily_pct: number;
        monthly_pct: number;
    };
    timestamp: string;
}

export type DashboardStats = KnownProps<ContractDashboardStats> & {
    stats: DashboardStatsData;
};

export type UsageStats = KnownProps<ContractUsageStats> & {
    user_id?: string;
    total_requests?: number;
    apis_used?: number;
    avg_duration_ms?: number;
    success_rate?: number;
    error_rate?: number;
    period?: string;
    period_start?: string;
    period_end?: string;
};

// Alert Types
export type AlertType = "critical" | "warning" | "info";

export interface Alert {
    id: string;
    type: AlertType;
    title: string;
    message: string;
    api_id?: string;
    api_name?: string;
    metric?: string;
    metric_value?: number;
    detected_at: string;
    dismissible: boolean;
}

export interface AlertsResponse {
    alerts: Alert[];
    count: number;
}

// Cost Estimate Types
export interface APICost {
    api_id: string;
    api_name: string;
    request_count: number;
    cost_per_request: number;
    total_cost: number;
}

export type CostEstimate = KnownProps<ContractCostEstimate> & {
    today_cost?: number;
    monthly_projection?: number;
    mtd_cost?: number;
    mtd_requests?: number;
    api_costs?: APICost[];
    calculated_at?: string;
    mtd_tokens?: number;
    tokens_by_model?: Record<string, number>;
    cost_by_model?: Record<string, number>;
};

// LLM Token Tracking Types
export interface ModelUsage {
    model: string;
    tokens: number;
    requests: number;
    cost_cents: number;
    cost_usd: number;
}

export type TokenUsageSummary = KnownProps<ContractTokenUsageSummary> & {
    user_id?: string;
    total_tokens?: number;
    input_tokens?: number;
    output_tokens?: number;
    total_cost_cents?: number;
    total_cost_usd?: number;
    by_model?: Record<string, ModelUsage>;
    period?: string;
    calculated_at?: string;
};

export type ModelPricing = KnownProps<ContractModelPricing> & {
    provider?: string;
    model?: string;
    input_price_per_million?: number;
    output_price_per_million?: number;
    effective_date?: string;
};

// Circuit Breaker Types
export type CircuitBreakerState = "closed" | "open" | "half-open";

export type CircuitBreakerMetrics = KnownProps<ContractCircuitBreakerMetrics> & {
    state?: CircuitBreakerState;
    state_string?: string;
    api_name?: string;
    total_requests?: number;
    total_successes?: number;
    total_failures?: number;
    total_rejections?: number;
    consecutive_failures?: number;
    consecutive_successes?: number;
    state_transitions?: number;
    time_in_state?: string;
    last_state_change?: string;
};

export type CircuitBreakerStats = KnownProps<ContractCircuitBreakerStats> & {
    timestamp?: string;
    total_circuit_breakers?: number;
    closed_count?: number;
    open_count?: number;
    half_open_count?: number;
    open_apis?: string[];
    total_requests?: number;
    total_successes?: number;
    total_failures?: number;
    total_rejections?: number;
};

export interface CircuitBreakerStatsResponse {
    circuit_breaker_stats: CircuitBreakerStats;
    timestamp: string;
}

export interface CircuitBreakerMetricsResponse {
    metrics: Record<string, CircuitBreakerMetrics>;
    count: number;
    timestamp: string;
}

export interface CircuitBreakerResetResponse {
    message: string;
    api_id: string;
    timestamp: string;
}

// Analytics Types
export interface AnalyticsMetrics {
    totalRequests: number;
    successRate: number;
    avgResponseTime: number;
    errorCount: number;
    bandwidthGB: number;
    estimatedCost: number;
    trends: {
        requests: { change: number; direction: "up" | "down" };
        successRate: { change: number; direction: "up" | "down" };
        avgResponseTime: { change: number; direction: "up" | "down" };
        errorCount: { change: number; direction: "up" | "down" };
        bandwidth: { change: number; direction: "up" | "down" };
        cost: { change: number; direction: "up" | "down" };
    };
}

export interface RequestsOverTime {
    date: string;
    timestamp: number;
    requests: number;
    successRate: number;
}

export interface RequestsPerAPI {
    apiId: string;
    apiName: string;
    requests: number;
    percentage: number;
}

export interface StatusCodeDistribution {
    name: string;
    code: string;
    value: number;
    count: number;
}

export interface EndpointStats {
    path: string;
    method: string;
    requests: number;
    avgResponseTime: number;
    errorRate: number;
    p95ResponseTime?: number;
    p99ResponseTime?: number;
}

export interface AnalyticsData {
    metrics: AnalyticsMetrics;
    requestsOverTime: RequestsOverTime[];
    requestsPerAPI: RequestsPerAPI[];
    statusCodes: StatusCodeDistribution[];
    topEndpoints: EndpointStats[];
}

// Auth Types
export interface SignupRequest {
    email: string;
    password: string;
    handle: string; // NEW: Username for vanity URLs
    preset?: string;
}

export interface LoginRequest {
    identifier: string;
    email?: string;
    password: string;
}

export interface RequestOptions extends RequestInit {
    idempotencyKey?: string;
}

export interface LoginResponse {
    user: User;
    access_token: string;
    refresh_token: string;
    expires_in: number;
    api_key?: string;
}

// TODO: OAuth Support - Future Enhancement
// Consider adding OAuth 2.0 providers (Google, GitHub, etc.) for authentication
// This would require:
// - New OAuth provider interfaces
// - OAuth callback handlers
// - Provider-specific configuration (client_id, client_secret, redirect_uri)
// - Token exchange endpoints
// - Provider account linking to existing users

export interface RequestPasswordResetRequest {
    email: string;
}

export interface ResetPasswordRequest {
    token: string;
    password: string;
}

// Usage History Types
export interface UsageHistoryPoint {
    timestamp: string;
    requests: number;
    success_rate: number;
    avg_response_time_ms: number;
}

export interface UsageHistoryResponse {
    period: string;
    data: UsageHistoryPoint[];
}

// Recent Requests Types
export interface RecentRequest {
    id: string;
    user_id: string;
    api_id: string;
    api_name: string;
    method: string;
    path: string;
    status_code: number;
    response_time_ms: number;
    timestamp: string;
    error_message?: string;
}

export interface RecentRequestsResponse {
    requests: RecentRequest[];
    total: number;
}

// Webhook Types
export type WebhookEvent = KnownProps<ContractWebhookEvent> & {
    id?: string;
    user_id?: string;
    source?: string;
    event_type?: string;
    payload?: Record<string, unknown>;
    headers?: Record<string, string>;
    target_url?: string;
    status?: "pending" | "processing" | "delivered" | "failed" | "dead_letter";
    retries?: number;
    max_retries?: number;
    next_attempt_at?: string;
    last_error?: string;
    last_attempt_at?: string;
    delivered_at?: string;
    response_status_code?: number;
    response_body?: string;
    created_at?: string;
    updated_at?: string;
};

export interface WebhookStatusResponse {
    events: WebhookEvent[];
    total_count: number;
    page: number;
    page_size: number;
    timestamp: string;
}

export type WebhookStats = KnownProps<ContractWebhookStats> & {
    database_stats?: {
        total: number;
        pending: number;
        processing: number;
        delivered: number;
        failed: number;
        dead_letter: number;
        last_24h: number;
        last_hour: number;
    };
    worker_metrics?: {
        delivery_attempts: number;
        successful_deliveries: number;
        failed_deliveries: number;
        worker_count: number;
        poll_interval_seconds: number;
    };
    config?: {
        max_retries: number;
        base_retry_delay: string;
        max_retry_delay: string;
        delivery_timeout: string;
    };
    timestamp?: string;
};

export interface WebhookInboxRequest {
    source: string;
    event_type: string;
    payload: Record<string, unknown>;
    target_url: string;
    headers?: Record<string, string>;
}

export interface WebhookDeliveryAttempt {
    attempt_number: number;
    timestamp: string;
    status_code?: number;
    latency_ms?: number;
    error?: string;
    response_headers?: Record<string, string>;
    request_headers?: Record<string, string>;
}

export type WebhookConfig = KnownProps<ContractWebhookConfig> & {
    inbox_url?: string;
    destination_url?: string;
    retry_policy?: "auto" | "custom";
    max_retries?: number;
    retry_delays?: number[]; // in seconds
    dead_letter_action?: "store" | "discard" | "email";
    signature_secret?: string;
    enabled?: boolean;
    event_types?: string[]; // e.g. ["payment.succeeded", "user.created"]
};

// API Keys Types (NEW - multiple keys)
export interface APIKey {
    id: string;
    key_name: string;
    masked_key: string;
    created_at: string;
    last_used_at?: string;
    revoked_at?: string;
    is_active: boolean;
}

export interface CreateAPIKeyRequest {
    key_name: string;
}

export interface CreateAPIKeyResponse {
    id: string;
    key_name: string;
    api_key: string; // Full key - shown once
    created_at: string;
    message: string;
}

export interface ListAPIKeysResponse {
    api_keys: APIKey[];
    count: number;
}

// Queue Types
export interface QueuedRequest {
    request_id: string;
    target_api: string;
    method: string;
    path: string;
    enqueued_at: string;
    queued_for_ms: number;
    position: number;
    est_wait_time_ms: number;
}

export interface APIQueue {
    api_name: string;
    queued_requests: number;
    avg_wait_time_ms: number;
    rate_limit_hits_24h: number;
}

export type QueueStats = KnownProps<ContractQueueStats> & {
    active_queues?: number;
    total_queued_requests?: number;
    longest_queued_time_ms?: number;
    avg_wait_time_ms?: number;
    peak_queue_length?: number;
    total_requests_queued_24h?: number;
    queued_by_api?: APIQueue[];
    timestamp?: string;
};

export interface APIQueueConfig {
    api_name: string;
    enabled: boolean;
    max_wait_time_ms: number;
    max_queue_length: number;
    priority: number;
}

export type QueueConfig = KnownProps<ContractQueueConfig> & {
    enabled?: boolean;
    max_wait_time_ms?: number;
    queueing_strategy?: "fifo" | "priority" | "weighted";
    per_api_settings?: APIQueueConfig[];
};

// Test Connection Types
export interface TestConnectionRequest {
    provider?: string;
    target_url: string;
    auth_type: "none" | "bearer" | "api_key" | "basic";
    auth_credentials?: Record<string, string>;
    custom_headers?: Record<string, string>;
    timeout_seconds?: number;
}

export interface TestConnectionResponse {
    success: boolean;
    status_code?: number;
    status_text?: string;
    latency_ms: number;
    error_message?: string;
    error_code?: string;
    server_info?: string;
    content_type?: string;
    tls_version?: string;
    tested_at: string;
}

// Marketplace Template Types (NEW)
export interface APITemplate {
    id: string;
    provider: string; // 'openai', 'anthropic', 'stripe', etc.
    display_name: string;
    description: string;
    icon_url?: string;
    category: string; // 'ai', 'payments', 'communication', etc.
    target_url: string;
    auth_type: string;
    required_headers: Record<string, string>;
    rate_limit_per_second: number;
    burst_size: number;
    popularity_score: number;
    is_active: boolean;
    created_at: string;
    updated_at: string;
}

export interface TemplateUsage {
    user_id: string;
    template_provider: string;
    requests: number;
    usage_date: string;
}

export interface ListTemplatesResponse {
    templates: APITemplate[];
    count: number;
}

export interface TemplateUsageStatsResponse {
    usage: TemplateUsage[];
    total_requests: number;
}

// Handle availability check
export interface HandleAvailabilityResponse {
    available: boolean;
    suggestions?: string[];
}

// Slug availability check
export interface SlugAvailabilityResponse {
    available: boolean;
    suggestions?: string[];
}

// Custom API Error Class
export class APIError extends Error {
    constructor(
        message: string,
        public statusCode: number,
        public code?: string,
        public details?: string
    ) {
        super(message);
        this.name = "APIError";
        Object.setPrototypeOf(this, APIError.prototype);
    }

    isNetworkError(): boolean {
        return this.statusCode === 0;
    }

    isUnauthorized(): boolean {
        return this.statusCode === 401 || this.statusCode === 403;
    }

    isNotFound(): boolean {
        return this.statusCode === 404;
    }

    isRateLimited(): boolean {
        return this.statusCode === 429;
    }

    isServerError(): boolean {
        return this.statusCode >= 500 && this.statusCode < 600;
    }
}

// API Client Class
class APIClient {
    private baseURL: string;
    private isRefreshing = false;
    private refreshPromise: Promise<void> | null = null;

    constructor() {
        this.baseURL = API_BASE_URL;
    }

    // JWT tokens are stored in httpOnly cookies - no localStorage!
    clearAuth() {
        // Cookies will be cleared by logout endpoint
        // Remove any cached API keys from localStorage
        if (typeof window !== "undefined") {
            localStorage.removeItem("apiKey");
        }
    }

    private async request<T>(
        endpoint: string,
        options: RequestOptions = {}
    ): Promise<T> {
        const headers: Record<string, string> = {
            "Content-Type": "application/json",
            ...(options.headers as Record<string, string>),
        };

        if (options.idempotencyKey) {
            headers["Idempotency-Key"] = options.idempotencyKey;
        }

        try {
            const response = await fetch(`${this.baseURL}${endpoint}`, {
                ...options,
                headers,
                credentials: "include", // IMPORTANT: Send cookies with every request
            });

            // Handle 401 (token expired) - attempt to refresh
            if (
                response.status === 401 &&
                endpoint !== "/api/v1/auth/refresh" &&
                endpoint !== "/api/v1/auth/login" &&
                endpoint !== "/api/v1/auth/me" // Don't auto-redirect when checking auth status
            ) {
                try {
                    await this.refreshAccessToken();
                    // Retry the original request
                    return this.request<T>(endpoint, options);
                } catch {
                    // Refresh failed - redirect to login ONLY from protected pages
                    const publicPaths = [
                        "/",
                        "/login",
                        "/signup",
                        "/forgot-password",
                        "/reset-password",
                        "/docs",
                    ];
                    const isPublicPage =
                        typeof window !== "undefined" &&
                        publicPaths.some(
                            (path) =>
                                window.location.pathname === path ||
                                window.location.pathname.startsWith("/docs")
                        );

                    if (
                        typeof window !== "undefined" &&
                        !isPublicPage &&
                        !window.location.pathname.startsWith("/login")
                    ) {
                        window.location.href = "/login";
                    }
                    throw new APIError("Session expired. Please log in again.", 401);
                }
            }

            if (!response.ok) {
                // Try to parse error response
                const errorData = await response.json().catch(() => ({
                    message: response.statusText || "An error occurred",
                }));
                const errorCode = errorData.error_code || errorData.code;
                const details = errorData.details || errorData.error_message;

                // Create detailed error with status code
                const error = new APIError(
                    errorData.message || errorData.error || `HTTP ${response.status}`,
                    response.status,
                    errorCode,
                    details
                );

                throw error;
            }

            return response.json();
        } catch (error) {
            // Handle network errors
            if (error instanceof APIError) {
                throw error;
            }

            // Handle fetch/network errors
            if (error instanceof TypeError && error.message.includes("fetch")) {
                throw new APIError(
                    "Unable to connect to server. Please check your internet connection.",
                    0,
                    "NETWORK_ERROR"
                );
            }

            // Re-throw unknown errors
            throw error;
        }
    }

    // Refresh access token using refresh token from cookie
    private async refreshAccessToken(): Promise<void> {
        // Prevent multiple simultaneous refresh attempts
        if (this.isRefreshing) {
            return this.refreshPromise!;
        }

        this.isRefreshing = true;
        this.refreshPromise = (async () => {
            try {
                const response = await fetch(`${this.baseURL}/api/v1/auth/refresh`, {
                    method: "POST",
                    credentials: "include", // Send refresh token cookie
                });

                if (!response.ok) {
                    throw new Error("Token refresh failed");
                }

                // New access token is set in cookie by backend
                await response.json();
            } finally {
                this.isRefreshing = false;
                this.refreshPromise = null;
            }
        })();

        return this.refreshPromise;
    }

    // Health Check
    async healthCheck() {
        return this.request<{ status: string; healthy: boolean }>("/health");
    }

    // Authentication
    async signup(data: SignupRequest): Promise<LoginResponse> {
        const response = await this.request<LoginResponse>("/api/v1/auth/signup", {
            method: "POST",
            body: JSON.stringify(data),
        });
        // Tokens are stored in httpOnly cookies by backend
        return response;
    }

    async login(data: LoginRequest): Promise<LoginResponse> {
        const response = await this.request<LoginResponse>("/api/v1/auth/login", {
            method: "POST",
            body: JSON.stringify(data),
        });
        // Tokens are stored in httpOnly cookies by backend
        return response;
    }

    async verifyEmail(token: string): Promise<{ message: string }> {
        return this.request<{ message: string }>(`/api/v1/auth/verify?token=${token}`);
    }

    async resendVerificationEmail(email: string): Promise<{ message: string; dev_token?: string }> {
        return this.request<{ message: string; dev_token?: string }>("/api/v1/auth/resend-verification", {
            method: "POST",
            body: JSON.stringify({ email }),
        });
    }

    async logout(): Promise<void> {
        await this.request("/api/v1/auth/logout", {
            method: "POST",
        });
        this.clearAuth();
    }

    // Get current authenticated user
    async getCurrentUser(): Promise<User> {
        const response = await this.request<{ user: User }>("/api/v1/auth/me");
        return response.user;
    }

    // Manual token refresh (usually automatic via 401 handler)
    async refreshToken(): Promise<void> {
        return this.refreshAccessToken();
    }

    // Password Reset
    async requestPasswordReset(
        data: RequestPasswordResetRequest
    ): Promise<{ message: string }> {
        return this.request<{ message: string }>("/api/v1/auth/request-reset", {
            method: "POST",
            body: JSON.stringify(data),
        });
    }

    async resetPassword(
        data: ResetPasswordRequest
    ): Promise<{ message: string }> {
        return this.request<{ message: string }>("/api/v1/auth/reset-password", {
            method: "POST",
            body: JSON.stringify(data),
        });
    }

    // Handle Operations (NEW)
    async checkHandleAvailability(handle: string): Promise<HandleAvailabilityResponse> {
        return this.request<HandleAvailabilityResponse>("/api/v1/auth/handle/check", {
            method: "POST",
            body: JSON.stringify({ handle }),
        });
    }

    async updateHandle(newHandle: string): Promise<User> {
        const response = await this.request<{ user: User }>("/api/v1/auth/handle", {
            method: "PUT",
            body: JSON.stringify({ handle: newHandle }),
        });
        return response.user;
    }

    // Slug Operations (NEW)
    async checkSlugAvailability(slug: string): Promise<SlugAvailabilityResponse> {
        return this.request<SlugAvailabilityResponse>("/api/v1/apis/slug/check", {
            method: "POST",
            body: JSON.stringify({ slug }),
        });
    }

    // Marketplace Template Operations (NEW)
    async listTemplates(category?: string): Promise<ListTemplatesResponse> {
        const params = category ? `?category=${encodeURIComponent(category)}` : '';
        return this.request<ListTemplatesResponse>(`/api/v1/marketplace/templates${params}`);
    }

    async getTemplate(provider: string): Promise<APITemplate> {
        return this.request<APITemplate>(`/api/v1/marketplace/templates/${provider}`);
    }

    async getTemplateUsage(days: number = 30): Promise<TemplateUsageStatsResponse> {
        return this.request<TemplateUsageStatsResponse>(`/api/v1/marketplace/usage?days=${days}`);
    }

    // Dashboard Stats
    async getDashboardStats(): Promise<DashboardStats> {
        return this.request<DashboardStats>("/api/v1/dashboard/stats");
    }

    // Usage Stats
    async getUsageStats(): Promise<UsageStats> {
        return this.request<UsageStats>("/api/v1/dashboard/usage");
    }

    // Alerts
    async getAlerts(): Promise<AlertsResponse> {
        return this.request<AlertsResponse>("/api/v1/dashboard/alerts");
    }

    // Cost Estimates
    async getCostEstimate(): Promise<CostEstimate> {
        return this.request<CostEstimate>("/api/v1/dashboard/costs");
    }

    // API Configurations
    async listAPIConfigs(): Promise<APIConfig[]> {
        return this.request<APIConfig[]>("/api/v1/apis");
    }

    async getAPIConfig(id: string): Promise<APIConfig> {
        return this.request<APIConfig>(`/api/v1/apis/${id}`);
    }

    async createAPIConfig(
        data: Partial<APIConfig>,
        options: { idempotencyKey?: string } = {}
    ): Promise<APIConfig> {
        // Ensure all field names are in snake_case format as expected by the backend
        const derivedSlug = data.slug || slugify(String(data.name || ""));
        const formattedData = {
            name: data.name,
            slug: derivedSlug || undefined,
            target_url: data.target_url,
            rate_limit_per_second: data.rate_limit_per_second,
            burst_size: data.burst_size,
            rate_limit_per_hour: data.rate_limit_per_hour,
            rate_limit_per_day: data.rate_limit_per_day,
            rate_limit_per_month: data.rate_limit_per_month,
            allowed_origins: data.allowed_origins,
            custom_headers: data.custom_headers,
            auth_type: data.auth_type,
            auth_credentials: data.auth_credentials,
            timeout_seconds: data.timeout_seconds,
            retry_attempts: data.retry_attempts,
            enabled: data.enabled,
        };

        return this.request<APIConfig>(`/api/v1/apis`, {
            method: "POST",
            body: JSON.stringify(formattedData),
            idempotencyKey: options.idempotencyKey,
        });
    }

    async updateAPIConfig(
        id: string,
        data: Partial<APIConfig>
    ): Promise<APIConfig> {
        return this.request<APIConfig>(`/api/v1/apis/${id}`, {
            method: "PUT",
            body: JSON.stringify(data),
        });
    }

    async deleteAPIConfig(id: string): Promise<void> {
        return this.request(`/api/v1/apis/${id}`, {
            method: "DELETE",
        });
    }

    // Rate Limit Suggestions
    async getRateLimitSuggestions(
        apiId: string
    ): Promise<{ suggestion: unknown }> {
        return this.request(`/api/v1/apis/${apiId}/rate-limit/suggestions`);
    }

    async applyRateLimitSuggestions(apiId: string): Promise<{ message: string }> {
        return this.request(`/api/v1/apis/${apiId}/rate-limit/apply`, {
            method: "POST",
        });
    }

    async getRateLimitObservations(apiId: string): Promise<unknown[]> {
        return this.request(`/api/v1/apis/${apiId}/rate-limit/observations`);
    }

    // Queue API methods
    async getQueueStats(): Promise<QueueStats> {
        return this.request<QueueStats>("/api/v1/dashboard/queues");
    }

    async getActiveQueues(): Promise<QueuedRequest[]> {
        return this.request<QueuedRequest[]>("/api/v1/dashboard/queues/active");
    }

    async getQueueConfig(): Promise<QueueConfig> {
        return this.request<QueueConfig>("/api/v1/dashboard/queues/config");
    }

    async updateQueueConfig(config: QueueConfig): Promise<QueueConfig> {
        return this.request<QueueConfig>("/api/v1/dashboard/queues/config", {
            method: "PUT",
            body: JSON.stringify(config),
        });
    }

    async cancelQueuedRequest(
        requestId: string
    ): Promise<{ cancelled: boolean }> {
        return this.request<{ cancelled: boolean }>(
            `/api/v1/dashboard/queues/${requestId}`,
            {
                method: "DELETE",
            }
        );
    }

    // Proxy Request
    async proxyRequest(data: {
        api_name: string;
        method: string;
        path?: string;
        headers?: Record<string, string>;
        body?: unknown;
        query_params?: Record<string, string>;
    }) {
        return this.request("/api/v1/proxy", {
            method: "POST",
            body: JSON.stringify(data),
        });
    }

    // Analytics - Get comprehensive analytics data
    async getAnalytics(period: string = "30d"): Promise<AnalyticsData> {
        const [dashboardData, usageHistory, recentRequests] = await Promise.all([
            this.getDashboardStats(),
            this.getUsageHistory(period),
            this.getRecentRequests({ limit: 200 }),
        ]);

        return this.transformToAnalytics(
            dashboardData.stats,
            usageHistory.data,
            recentRequests.requests
        );
    }

    // Transform backend stats to analytics format
    private transformToAnalytics(
        stats: DashboardStatsData,
        usageHistory: UsageHistoryPoint[],
        recentRequests: RecentRequest[]
    ): AnalyticsData {
        // Calculate metrics
        const errorCount = Math.round(
            stats.total_requests * (1 - stats.success_rate / 100)
        );
        const bandwidthGB = (stats.total_requests * 0.5) / 1024; // Estimate
        const estimatedCost = bandwidthGB * 0.004 + stats.total_requests * 0.0001;
        const firstHistoryPoint = usageHistory[0];
        const lastHistoryPoint = usageHistory[usageHistory.length - 1];
        const firstErrorCount = firstHistoryPoint
            ? Math.round(
                  firstHistoryPoint.requests *
                      (1 - firstHistoryPoint.success_rate / 100)
              )
            : errorCount;
        const lastErrorCount = lastHistoryPoint
            ? Math.round(
                  lastHistoryPoint.requests *
                      (1 - lastHistoryPoint.success_rate / 100)
              )
            : errorCount;

        return {
            metrics: {
                totalRequests: stats.total_requests,
                successRate: stats.success_rate,
                avgResponseTime: stats.avg_response_time_ms,
                errorCount,
                bandwidthGB,
                estimatedCost,
                trends: {
                    requests: this.calculateTrend(
                        firstHistoryPoint?.requests,
                        lastHistoryPoint?.requests
                    ),
                    successRate: this.calculateTrend(
                        firstHistoryPoint?.success_rate,
                        lastHistoryPoint?.success_rate
                    ),
                    avgResponseTime: this.calculateTrend(
                        firstHistoryPoint?.avg_response_time_ms,
                        lastHistoryPoint?.avg_response_time_ms,
                        true
                    ),
                    errorCount: this.calculateTrend(
                        firstErrorCount,
                        lastErrorCount,
                        true
                    ),
                    bandwidth: this.calculateTrend(
                        firstHistoryPoint?.requests,
                        lastHistoryPoint?.requests
                    ),
                    cost: this.calculateTrend(
                        firstHistoryPoint?.requests,
                        lastHistoryPoint?.requests
                    ),
                },
            },
            requestsOverTime: this.generateTimeSeriesData(
                usageHistory,
                stats
            ),
            requestsPerAPI: stats.usage_by_api.map((api: UsageByAPI) => ({
                apiId: `api-${api.api_name}`,
                apiName: api.api_name,
                requests: api.requests,
                percentage:
                    stats.total_requests > 0
                        ? (api.requests / stats.total_requests) * 100
                        : 0,
            })),
            statusCodes: this.generateStatusCodeDistribution(
                recentRequests,
                stats
            ),
            topEndpoints: this.generateTopEndpoints(recentRequests, stats),
        };
    }

    // Generate time series data from dashboard stats
    private generateTimeSeriesData(
        history: UsageHistoryPoint[],
        stats: DashboardStatsData
    ): RequestsOverTime[] {
        if (history.length > 0) {
            return history.map((point) => ({
                date: new Date(point.timestamp).toLocaleDateString("en-US", {
                    month: "short",
                    day: "numeric",
                }),
                timestamp: new Date(point.timestamp).getTime(),
                requests: point.requests,
                successRate: point.success_rate,
            }));
        }

        // Generate a deterministic fallback from the aggregate stats.
        const result: RequestsOverTime[] = [];
        const now = new Date();
        const avgDaily = stats.total_requests / 30; // Approximate daily average

        for (let i = 6; i >= 0; i--) {
            const date = new Date(now);
            date.setDate(date.getDate() - i);
            const offset = (i - 3) * 0.04;

            result.push({
                date: date.toLocaleDateString("en-US", {
                    month: "short",
                    day: "numeric",
                }),
                timestamp: date.getTime(),
                requests: Math.max(
                    0,
                    Math.round(avgDaily * (1 + offset))
                ),
                successRate: Math.max(
                    0,
                    Math.min(100, stats.success_rate + offset * 10)
                ),
            });
        }

        return result;
    }

    private calculateTrend(
        previous?: number,
        current?: number,
        lowerIsBetter = false
    ): { change: number; direction: "up" | "down" } {
        const prior = previous ?? 0;
        const next = current ?? prior;

        if (prior === 0) {
            return {
                change: 0,
                direction: lowerIsBetter ? "down" : "up",
            };
        }

        const delta = next - prior;
        const direction = lowerIsBetter
            ? delta <= 0
                ? "down"
                : "up"
            : delta >= 0
                ? "up"
                : "down";

        return {
            change: Math.abs((delta / prior) * 100),
            direction,
        };
    }

    private generateStatusCodeDistribution(
        recentRequests: RecentRequest[],
        stats: DashboardStatsData
    ): StatusCodeDistribution[] {
        if (recentRequests.length === 0) {
            const successCount = Math.round(
                stats.total_requests * (stats.success_rate / 100)
            );
            const errorCount = Math.max(0, stats.total_requests - successCount);
            const clientErrors = Math.round(errorCount * 0.85);
            const serverErrors = Math.max(0, errorCount - clientErrors);

            return [
                {
                    name: "2xx Success",
                    code: "2xx",
                    value: stats.success_rate,
                    count: successCount,
                },
                {
                    name: "4xx Client Error",
                    code: "4xx",
                    value: errorCount > 0 ? (clientErrors / stats.total_requests) * 100 : 0,
                    count: clientErrors,
                },
                {
                    name: "5xx Server Error",
                    code: "5xx",
                    value: errorCount > 0 ? (serverErrors / stats.total_requests) * 100 : 0,
                    count: serverErrors,
                },
            ];
        }

        let successCount = 0;
        let clientErrorCount = 0;
        let serverErrorCount = 0;

        for (const request of recentRequests) {
            if (request.status_code >= 200 && request.status_code < 300) {
                successCount++;
                continue;
            }

            if (request.status_code >= 400 && request.status_code < 500) {
                clientErrorCount++;
                continue;
            }

            if (request.status_code >= 500) {
                serverErrorCount++;
            }
        }

        const total = recentRequests.length;

        return [
            {
                name: "2xx Success",
                code: "2xx",
                value: (successCount / total) * 100,
                count: successCount,
            },
            {
                name: "4xx Client Error",
                code: "4xx",
                value: (clientErrorCount / total) * 100,
                count: clientErrorCount,
            },
            {
                name: "5xx Server Error",
                code: "5xx",
                value: (serverErrorCount / total) * 100,
                count: serverErrorCount,
            },
        ];
    }

    private generateTopEndpoints(
        recentRequests: RecentRequest[],
        stats: DashboardStatsData
    ): EndpointStats[] {
        if (recentRequests.length === 0) {
            return stats.usage_by_api.map((api: UsageByAPI) => ({
                path: `/api/v1/${api.api_name.toLowerCase().replace(/\s+/g, "-")}`,
                method: "GET",
                requests: api.requests,
                avgResponseTime: api.avg_duration_ms,
                errorRate: api.error_rate,
            }));
        }

        type EndpointBucket = {
            path: string;
            method: string;
            requests: number;
            totalDuration: number;
            errorCount: number;
        };

        const buckets = new Map<string, EndpointBucket>();

        for (const request of recentRequests) {
            const key = `${request.method} ${request.path}`;
            const bucket = buckets.get(key) ?? {
                path: request.path,
                method: request.method,
                requests: 0,
                totalDuration: 0,
                errorCount: 0,
            };

            bucket.requests++;
            bucket.totalDuration += request.response_time_ms;
            if (request.status_code >= 400) {
                bucket.errorCount++;
            }

            buckets.set(key, bucket);
        }

        return Array.from(buckets.values())
            .sort((a, b) => b.requests - a.requests)
            .slice(0, 10)
            .map((bucket) => ({
                path: bucket.path,
                method: bucket.method,
                requests: bucket.requests,
                avgResponseTime: bucket.totalDuration / bucket.requests,
                errorRate: (bucket.errorCount / bucket.requests) * 100,
            }));
    }

    // Settings API methods
    async getSettings(): Promise<{
        user: {
            id: string;
            email: string;
            name: string;
            preset?: string;
            email_verified: boolean;
            country_code?: string;
            detected_currency?: string;
            created_at: string;
            last_login_at?: string;
        };
        notifications: {
            email_alerts: boolean;
            usage_threshold_percent: number;
            error_alerts: boolean;
            weekly_report: boolean;
        };
    }> {
        const response = await fetch(`${this.baseURL}/api/v1/dashboard/settings`, {
            method: "GET",
            credentials: "include",
            headers: {
                "Content-Type": "application/json",
            },
        });

        if (!response.ok) {
            throw new Error(`Failed to get settings: ${response.statusText}`);
        }

        return response.json();
    }

    async updateSettings(settings: {
        email_alerts?: boolean;
        usage_threshold_percent?: number;
        error_alerts?: boolean;
        weekly_report?: boolean;
    }): Promise<{ success: boolean; message: string }> {
        const response = await fetch(`${this.baseURL}/api/v1/dashboard/settings`, {
            method: "PUT",
            credentials: "include",
            headers: {
                "Content-Type": "application/json",
            },
            body: JSON.stringify(settings),
        });

        if (!response.ok) {
            throw new Error(`Failed to update settings: ${response.statusText}`);
        }

        return response.json();
    }

    async changePassword(data: {
        current_password: string;
        new_password: string;
    }): Promise<{ success: boolean; message: string }> {
        const response = await fetch(
            `${this.baseURL}/api/v1/dashboard/settings/password`,
            {
                method: "POST",
                credentials: "include",
                headers: {
                    "Content-Type": "application/json",
                },
                body: JSON.stringify(data),
            }
        );

        if (!response.ok) {
            const error = await response.json().catch(() => ({}));
            throw new Error(
                error.message || `Failed to change password: ${response.statusText}`
            );
        }

        return response.json();
    }

    // API Keys Management (NEW - multiple keys)
    async listAPIKeys(): Promise<ListAPIKeysResponse> {
        return this.request<ListAPIKeysResponse>("/api/v1/api-keys");
    }

    async createAPIKey(keyName: string): Promise<CreateAPIKeyResponse> {
        return this.request<CreateAPIKeyResponse>("/api/v1/api-keys", {
            method: "POST",
            body: JSON.stringify({ key_name: keyName }),
        });
    }

    async revokeAPIKey(
        keyId: string
    ): Promise<{ success: boolean; message: string }> {
        return this.request(`/api/v1/api-keys/${keyId}`, {
            method: "DELETE",
        });
    }

    // API key regeneration for the dashboard
    async regenerateAPIKey(): Promise<{
        success: boolean;
        message: string;
        api_key: string;
    }> {
        const response = await fetch(
            `${this.baseURL}/api/v1/dashboard/api-key/regenerate`,
            {
                method: "POST",
                credentials: "include",
                headers: {
                    "Content-Type": "application/json",
                },
            }
        );

        if (!response.ok) {
            throw new Error(`Failed to regenerate API key: ${response.statusText}`);
        }

        return response.json();
    }

    // Circuit Breaker Methods
    async getCircuitBreakerStats(): Promise<CircuitBreakerStatsResponse> {
        return this.request<CircuitBreakerStatsResponse>(
            "/api/v1/proxy/circuit-breakers/stats"
        );
    }

    async getCircuitBreakerMetrics(): Promise<CircuitBreakerMetricsResponse> {
        return this.request<CircuitBreakerMetricsResponse>(
            "/api/v1/proxy/circuit-breakers/metrics"
        );
    }

    async resetCircuitBreaker(
        apiId: string
    ): Promise<CircuitBreakerResetResponse> {
        return this.request<CircuitBreakerResetResponse>(
            `/api/v1/proxy/circuit-breakers/${apiId}/reset`,
            {
                method: "POST",
            }
        );
    }

    // Recent Requests Methods
    async getRecentRequests(params?: {
        limit?: number;
        api_id?: string;
        status_code?: number;
    }): Promise<RecentRequestsResponse> {
        const queryParams = new URLSearchParams();
        if (params?.limit) queryParams.append("limit", String(params.limit));
        if (params?.api_id) queryParams.append("api_id", params.api_id);
        if (params?.status_code)
            queryParams.append("status_code", String(params.status_code));

        const query = queryParams.toString();
        return this.request<RecentRequestsResponse>(
            `/api/v1/dashboard/requests/recent${query ? `?${query}` : ""}`
        );
    }

    // Streaming Metrics
    async getStreamingMetrics(): Promise<{
        total_requests: number;
        requests_per_second: number;
        avg_latency_ms: number;
        error_count: number;
    }> {
        return this.request(`/api/v1/dashboard/stats/streaming`);
    }

    // Streaming History
    async getStreamingHistory(
        period: string = "24h"
    ): Promise<UsageHistoryResponse> {
        return this.request<UsageHistoryResponse>(
            `/api/v1/dashboard/streaming/history?period=${period}`
        );
    }

    // Streaming By API
    async getStreamingByAPI(apiId?: string): Promise<{ data: UsageByAPI[] }> {
        const url = apiId
            ? `/api/v1/dashboard/streaming/by-api?api_id=${apiId}`
            : "/api/v1/dashboard/streaming/by-api";
        return this.request<{ data: UsageByAPI[] }>(url);
    }

    // Usage History
    async getUsageHistory(period: string = "30d"): Promise<UsageHistoryResponse> {
        return this.request<UsageHistoryResponse>(
            `/api/v1/dashboard/usage/history?period=${period}`
        );
    }

    // Budget Management
    async getBudgetConfig(): Promise<any> {
        return this.request("/api/v1/guardrails/config");
    }

    async createBudgetConfig(data: any): Promise<any> {
        return this.request("/api/v1/guardrails/config", {
            method: "POST",
            body: JSON.stringify(data),
        });
    }

    async getBudgetAlerts(includeAcknowledged: boolean = false): Promise<any> {
        const params = new URLSearchParams({
            include_acknowledged: includeAcknowledged.toString(),
        });
        return this.request(`/api/v1/guardrails/alerts?${params}`);
    }

    async acknowledgeBudgetAlert(alertId: string): Promise<any> {
        return this.request(`/api/v1/guardrails/alerts/${alertId}/ack`, {
            method: "POST",
        });
    }

    async getCostOptimizations(): Promise<any> {
        return this.request("/api/v1/guardrails/optimizations");
    }

    // Webhook Methods
    async getWebhookStatus(params?: {
        page?: number;
        page_size?: number;
        status?: string;
        source?: string;
    }): Promise<WebhookStatusResponse> {
        const queryParams = new URLSearchParams();
        if (params?.page) queryParams.append("page", String(params.page));
        if (params?.page_size)
            queryParams.append("page_size", String(params.page_size));
        if (params?.status) queryParams.append("status", params.status);
        if (params?.source) queryParams.append("source", params.source);

        const query = queryParams.toString();
        return this.request<WebhookStatusResponse>(
            `/api/v1/webhook/status${query ? `?${query}` : ""}`
        );
    }

    async getWebhookStats(): Promise<WebhookStats> {
        return this.request<WebhookStats>("/api/v1/webhook/stats");
    }

    // LLM Token Tracking APIs
    async getTokenUsage(): Promise<TokenUsageSummary> {
        return this.request<TokenUsageSummary>("/api/v1/dashboard/tokens");
    }

    async getModelPricing(): Promise<ModelPricing[]> {
        return this.request<ModelPricing[]>("/api/v1/models/pricing");
    }

    async getWebhookEvent(eventId: string): Promise<WebhookEvent> {
        return this.request<WebhookEvent>(`/api/v1/webhook/events/${eventId}`);
    }

    async createWebhookEvent(data: WebhookInboxRequest): Promise<WebhookEvent> {
        return this.request<WebhookEvent>("/api/v1/webhook/inbox", {
            method: "POST",
            body: JSON.stringify(data),
        });
    }

    async retryWebhookEvent(eventId: string): Promise<{
        message: string;
        id: string;
        status: string;
    }> {
        return this.request(`/api/v1/webhook/events/${eventId}/replay`, {
            method: "POST",
        });
    }

    // Geo Detection
    async detectGeo(): Promise<{
        CountryCode: string;
        Currency: string;
        Provider: string;
    }> {
        return this.request<{
            CountryCode: string;
            Currency: string;
            Provider: string;
        }>("/api/v1/auth/geo");
    }

    // Test Connection - Tests connectivity to a target API endpoint
    async testConnection(
        data: TestConnectionRequest,
        options: { idempotencyKey?: string } = {}
    ): Promise<TestConnectionResponse> {
        return this.request<TestConnectionResponse>(
            "/api/v1/apis/test-connection",
            {
                method: "POST",
                body: JSON.stringify(data),
                idempotencyKey: options.idempotencyKey,
            }
        );
    }
}

// Export singleton instance
export const apiClient = new APIClient();

export const authAPI = {
    signup: (data: SignupRequest) => apiClient.signup(data),
    login: (data: LoginRequest) => apiClient.login(data),
    logout: () => apiClient.logout(),
    me: () => apiClient.getCurrentUser(),
    requestPasswordReset: (data: RequestPasswordResetRequest) =>
        apiClient.requestPasswordReset(data),
    resetPassword: (data: ResetPasswordRequest) => apiClient.resetPassword(data),
    detectGeo: () => apiClient.detectGeo(),
};

// Export individual API namespaces for convenience
export const dashboardAPI = {
    stats: () => apiClient.getDashboardStats(),
    usage: () => apiClient.getUsageStats(),
    alerts: () => apiClient.getAlerts(),
    costs: () => apiClient.getCostEstimate(),
    tokens: () => apiClient.getTokenUsage(),
    modelPricing: () => apiClient.getModelPricing(),
};

export const analyticsAPI = {
    get: (period?: string) => apiClient.getAnalytics(period),
};

export const apiConfigAPI = {
    list: () => apiClient.listAPIConfigs(),
    get: (id: string) => apiClient.getAPIConfig(id),
    create: (data: Partial<APIConfig>, idempotencyKey?: string) =>
        apiClient.createAPIConfig(data, { idempotencyKey }),
    update: (id: string, data: Partial<APIConfig>) =>
        apiClient.updateAPIConfig(id, data),
    delete: (id: string) => apiClient.deleteAPIConfig(id),
    testConnection: (data: TestConnectionRequest, idempotencyKey?: string) =>
        apiClient.testConnection(data, { idempotencyKey }),
};

// NEW: Marketplace Template API
export const marketplaceAPI = {
    listTemplates: (category?: string) => apiClient.listTemplates(category),
    getTemplate: (provider: string) => apiClient.getTemplate(provider),
    getUsage: (days?: number) => apiClient.getTemplateUsage(days),
};

// NEW: Handle/Slug API
export const handleAPI = {
    checkAvailability: (handle: string) => apiClient.checkHandleAvailability(handle),
    update: (newHandle: string) => apiClient.updateHandle(newHandle),
};

export const slugAPI = {
    checkAvailability: (slug: string) => apiClient.checkSlugAvailability(slug),
};

export const settingsAPI = {
    get: () => apiClient.getSettings(),
    update: (settings: {
        email_alerts?: boolean;
        usage_threshold_percent?: number;
        error_alerts?: boolean;
        weekly_report?: boolean;
    }) => apiClient.updateSettings(settings),
    changePassword: (data: { current_password: string; new_password: string }) =>
        apiClient.changePassword(data),
    regenerateAPIKey: () => apiClient.regenerateAPIKey(),
};

export const circuitBreakerAPI = {
    stats: () => apiClient.getCircuitBreakerStats(),
    metrics: () => apiClient.getCircuitBreakerMetrics(),
    reset: (apiId: string) => apiClient.resetCircuitBreaker(apiId),
};

export const webhookAPI = {
    status: (params?: {
        page?: number;
        page_size?: number;
        status?: string;
        source?: string;
    }) => apiClient.getWebhookStatus(params),
    stats: () => apiClient.getWebhookStats(),
    get: (eventId: string) => apiClient.getWebhookEvent(eventId),
    create: (data: WebhookInboxRequest) => apiClient.createWebhookEvent(data),
    retry: (eventId: string) => apiClient.retryWebhookEvent(eventId),
};

// Query Client Configuration
export const queryClient = new QueryClient({
    defaultOptions: {
        queries: {
            staleTime: 1000 * 60, // 1 minute
            refetchOnWindowFocus: false,
            retry: 1,
        },
    },
});
