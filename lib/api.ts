import { QueryClient } from "@tanstack/react-query";

// In production, we use Next.js Rewrites (proxy) to avoid CORS/Cookie issues.
// This makes requests relative (e.g. /api/v1/...) which Vercel forwards to Render.
// In development, we use the direct URL or localhost.
const isProduction = process.env.NODE_ENV === "production";
const API_BASE_URL = isProduction
  ? ""
  : process.env.NEXT_PUBLIC_API_URL || "http://localhost:8008";

// API Response Types (matching backend models exactly)
export interface User {
  id: string;
  email: string;
  plan: "free" | "pro" | "business"; // Backend uses "business" not "enterprise"
  api_key?: string; // Optional - only present after signup/login, NOT in /me
  active: boolean;
  email_verified: boolean;
  last_login_at?: string;
  created_at: string;
  updated_at: string;
}

// Matches backend RateLimits struct
export interface PlanLimits {
  plan: string;
  requests_per_second: number;
  burst_size: number;
  max_apis: number;
  monthly_request_limit: number;
}

export interface APIConfig {
  id: string;
  user_id: string;
  name: string;
  target_url: string;
  proxy_url?: string; // Computed by backend
  rate_limit_per_second: number;
  burst_size: number;
  rate_limit_per_hour: number; // NEW: Hourly rate limit (0 = unlimited)
  rate_limit_per_day: number; // NEW: Daily rate limit (0 = unlimited)
  rate_limit_per_month: number; // NEW: Monthly rate limit (0 = unlimited)
  allowed_origins: string[]; // NEW: CORS whitelisted origins
  enabled: boolean;
  auth_type: "none" | "bearer" | "api_key" | "basic";
  auth_credentials?: Record<string, string>;
  timeout_seconds: number;
  retry_attempts: number;
  created_at: string;
  updated_at: string;
  custom_headers?: Record<string, string>;
  provider?: string;
}

export interface UsageByAPI {
  api_name: string;
  requests: number;
  avg_duration_ms: number;
  success_rate: number;
  error_rate: number;
  last_used: string;
}

// Matches backend PlanFeatures struct exactly
export interface PlanFeatures {
  max_apis: number;
  max_requests_per_day: number; // int64 in backend
  max_requests_per_month: number; // int64 in backend
  advanced_analytics: boolean;
  priority_support: boolean;
  custom_rate_limits: boolean;
  webhooks: boolean;
  api_access: boolean;
}

export interface PlanInfo {
  tier: string;
  features: PlanFeatures;
  limits: {
    apis: { used: number; max: number };
    requests: { used: number; max: number };
  };
}

export interface DashboardStatsData {
  total_requests: number;
  requests_today: number;
  active_apis: number;
  avg_response_time_ms: number;
  success_rate: number;
  monthly_usage: number;
  plan_limit: number;
  usage_by_api: UsageByAPI[];
  usage_percentages: {
    daily_pct: number;
    monthly_pct: number;
  };
  timestamp: string;
}

export interface DashboardStats {
  stats: DashboardStatsData;
  plan: PlanInfo;
}

export interface UsageStats {
  user_id: string;
  total_requests: number;
  apis_used: number;
  avg_duration_ms: number;
  success_rate: number;
  error_rate: number;
  period: string;
  period_start: string;
  period_end: string;
}

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

export interface CostEstimate {
  today_cost: number;
  monthly_projection: number;
  mtd_cost: number;
  mtd_requests: number;
  api_costs: APICost[];
  calculated_at: string;
  // NEW: Token-based metrics for LLMs
  mtd_tokens?: number;
  tokens_by_model?: Record<string, number>;
  cost_by_model?: Record<string, number>;
}

// LLM Token Tracking Types
export interface ModelUsage {
  model: string;
  tokens: number;
  requests: number;
  cost_cents: number;
  cost_usd: number;
}

export interface TokenUsageSummary {
  user_id: string;
  total_tokens: number;
  input_tokens: number;
  output_tokens: number;
  total_cost_cents: number;
  total_cost_usd: number;
  by_model: Record<string, ModelUsage>;
  period: string;
  calculated_at: string;
}

export interface ModelPricing {
  provider: string;
  model: string;
  input_price_per_million: number; // cents
  output_price_per_million: number; // cents
  effective_date: string;
}

// Circuit Breaker Types
export type CircuitBreakerState = "closed" | "open" | "half-open";

export interface CircuitBreakerMetrics {
  state: CircuitBreakerState;
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
}

export interface CircuitBreakerStats {
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
}

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
  plan?: "free" | "pro" | "business";
}

export interface LoginRequest {
  email: string;
  password: string;
}

export interface LoginResponse {
  user: User;
  access_token: string;
  refresh_token: string;
  expires_in: number;
  api_key?: string; // Deprecated - for backward compatibility
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
export interface WebhookEvent {
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
}

export interface WebhookStatusResponse {
  events: WebhookEvent[];
  total_count: number;
  page: number;
  page_size: number;
  timestamp: string;
}

export interface WebhookStats {
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
}

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

export interface WebhookConfig {
  inbox_url: string;
  destination_url: string;
  retry_policy: "auto" | "custom";
  max_retries?: number;
  retry_delays?: number[]; // in seconds
  dead_letter_action: "store" | "discard" | "email";
  signature_secret?: string;
  enabled: boolean;
  event_types: string[]; // e.g. ["payment.succeeded", "user.created"]
}

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

export interface QueueStats {
  active_queues: number;
  total_queued_requests: number;
  longest_queued_time_ms: number;
  avg_wait_time_ms: number;
  peak_queue_length: number;
  total_requests_queued_24h: number;
  queued_by_api: APIQueue[];
  timestamp: string;
}

export interface APIQueueConfig {
  api_name: string;
  enabled: boolean;
  max_wait_time_ms: number;
  max_queue_length: number;
  priority: number;
}

export interface QueueConfig {
  enabled: boolean;
  max_wait_time_ms: number;
  queueing_strategy: "fifo" | "priority" | "weighted";
  per_api_settings: APIQueueConfig[];
}

// Test Connection Types
export interface TestConnectionRequest {
  target_url: string;
  auth_type: "none" | "bearer" | "api_key" | "basic";
  auth_credentials?: Record<string, string>;
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
    // Just remove any legacy API keys from localStorage
    if (typeof window !== "undefined") {
      localStorage.removeItem("apiKey");
    }
  }

  private async request<T>(
    endpoint: string,
    options: RequestInit = {}
  ): Promise<T> {
    const headers: Record<string, string> = {
      "Content-Type": "application/json",
      ...(options.headers as Record<string, string>),
    };

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
            "/pricing",
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

        // Create detailed error with status code
        const error = new APIError(
          errorData.message || errorData.error || `HTTP ${response.status}`,
          response.status,
          errorData.code,
          errorData.details
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

  async createAPIConfig(data: Partial<APIConfig>): Promise<APIConfig> {
    // Ensure all field names are in snake_case format as expected by the backend
    const formattedData = {
      name: data.name,
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
  async getAnalytics(): Promise<AnalyticsData> {
    // This will transform the existing dashboard stats into analytics format
    const dashboardData = await this.getDashboardStats();

    // Transform backend data into analytics format
    // For now, we'll use mock data structure but call real endpoints
    // You can enhance this to aggregate multiple endpoint responses
    return this.transformToAnalytics(dashboardData.stats);
  }

  // Transform backend stats to analytics format
  private transformToAnalytics(stats: DashboardStatsData): AnalyticsData {
    // Calculate metrics
    const errorCount = Math.round(
      stats.total_requests * (1 - stats.success_rate / 100)
    );
    const bandwidthGB = (stats.total_requests * 0.5) / 1024; // Estimate
    const estimatedCost = bandwidthGB * 0.004 + stats.total_requests * 0.0001;

    return {
      metrics: {
        totalRequests: stats.total_requests,
        successRate: stats.success_rate,
        avgResponseTime: stats.avg_response_time_ms,
        errorCount,
        bandwidthGB,
        estimatedCost,
        trends: {
          requests: { change: 12.5, direction: "up" },
          successRate: { change: 2.1, direction: "up" },
          avgResponseTime: { change: 5, direction: "down" },
          errorCount: { change: 0.8, direction: "down" },
          bandwidth: { change: 15, direction: "up" },
          cost: { change: 2.1, direction: "up" },
        },
      },
      requestsOverTime: this.generateTimeSeriesData(stats),
      requestsPerAPI: stats.usage_by_api.map((api: UsageByAPI) => ({
        apiId: `api-${api.api_name}`,
        apiName: api.api_name,
        requests: api.requests,
        percentage: (api.requests / stats.total_requests) * 100,
      })),
      statusCodes: [
        {
          name: "2xx Success",
          code: "2xx",
          value: stats.success_rate,
          count: Math.round(stats.total_requests * (stats.success_rate / 100)),
        },
        {
          name: "4xx Client Error",
          code: "4xx",
          value: (100 - stats.success_rate) * 0.85,
          count: Math.round(
            stats.total_requests * ((100 - stats.success_rate) / 100) * 0.85
          ),
        },
        {
          name: "5xx Server Error",
          code: "5xx",
          value: (100 - stats.success_rate) * 0.15,
          count: Math.round(
            stats.total_requests * ((100 - stats.success_rate) / 100) * 0.15
          ),
        },
      ],
      topEndpoints: stats.usage_by_api.map((api: UsageByAPI) => ({
        path: `/api/v1/${api.api_name.toLowerCase().replace(/\s+/g, "-")}`,
        method: "GET",
        requests: api.requests,
        avgResponseTime: api.avg_duration_ms,
        errorRate: api.error_rate,
      })),
    };
  }

  // Generate time series data from dashboard stats
  private generateTimeSeriesData(
    stats: DashboardStatsData
  ): RequestsOverTime[] {
    // Generate last 7 days of data
    const result: RequestsOverTime[] = [];
    const now = new Date();
    const avgDaily = stats.total_requests / 30; // Approximate daily average

    for (let i = 6; i >= 0; i--) {
      const date = new Date(now);
      date.setDate(date.getDate() - i);

      result.push({
        date: date.toLocaleDateString("en-US", {
          month: "short",
          day: "numeric",
        }),
        timestamp: date.getTime(),
        requests: Math.round(avgDaily * (0.8 + Math.random() * 0.4)),
        successRate: stats.success_rate + (Math.random() - 0.5) * 2,
      });
    }

    return result;
  }

  // Settings API methods
  async getSettings(): Promise<{
    user: {
      id: string;
      email: string;
      name: string;
      plan: string;
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
    const response = await fetch(`${this.baseURL}/dashboard/settings`, {
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
    const response = await fetch(`${this.baseURL}/dashboard/settings`, {
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
      `${this.baseURL}/dashboard/settings/password`,
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

  // Legacy API key regeneration (single key - deprecated)
  async regenerateAPIKey(): Promise<{
    success: boolean;
    message: string;
    api_key: string;
  }> {
    const response = await fetch(
      `${this.baseURL}/dashboard/api-key/regenerate`,
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

  // Budget Management (NEW - Pro feature)
  async getBudgetConfig(): Promise<any> {
    return this.request("/api/v1/budget/config");
  }

  async createBudgetConfig(data: any): Promise<any> {
    return this.request("/api/v1/budget/config", {
      method: "POST",
      body: JSON.stringify(data),
    });
  }

  async getBudgetAlerts(includeAcknowledged: boolean = false): Promise<any> {
    const params = new URLSearchParams({
      include_acknowledged: includeAcknowledged.toString(),
    });
    return this.request(`/api/v1/budget/alerts?${params}`);
  }

  async acknowledgeBudgetAlert(alertId: string): Promise<any> {
    return this.request(`/api/v1/budget/alerts/${alertId}/ack`, {
      method: " POST",
    });
  }

  async getCostOptimizations(): Promise<any> {
    return this.request("/api/v1/budget/optimizations");
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
    success: boolean;
    message: string;
    next_attempt_at: string;
  }> {
    return this.request(`/api/v1/webhook/events/${eventId}/retry`, {
      method: "POST",
    });
  }

  async deleteWebhookEvent(
    eventId: string
  ): Promise<{ success: boolean; message: string }> {
    return this.request(`/api/v1/webhook/events/${eventId}`, {
      method: "DELETE",
    });
  }

  async bulkRetryWebhookEvents(eventIds: string[]): Promise<{
    success: boolean;
    message: string;
    retried_count: number;
  }> {
    return this.request("/api/v1/webhook/events/bulk-retry", {
      method: "POST",
      body: JSON.stringify({ event_ids: eventIds }),
    });
  }

  async getWebhookConfig(): Promise<WebhookConfig> {
    return this.request<WebhookConfig>("/api/v1/webhook/config");
  }

  async updateWebhookConfig(
    config: Partial<WebhookConfig>
  ): Promise<WebhookConfig> {
    return this.request<WebhookConfig>("/api/v1/webhook/config", {
      method: "PUT",
      body: JSON.stringify(config),
    });
  }

  async testWebhookDelivery(data: {
    target_url: string;
    payload: Record<string, unknown>;
    headers?: Record<string, string>;
  }): Promise<{
    success: boolean;
    status_code: number;
    latency_ms: number;
    response_body: string;
  }> {
    return this.request("/api/v1/webhook/test", {
      method: "POST",
      body: JSON.stringify(data),
    });
  }

  // Billing Methods
  async getPaymentProviders(): Promise<{
    providers: string[];
    preferred: string;
  }> {
    return this.request<{ providers: string[]; preferred: string }>(
      "/api/v1/billing/providers"
    );
  }

  async createCheckout(
    provider: string,
    planId: string
  ): Promise<{ checkout_url: string }> {
    return this.request<{ checkout_url: string }>(
      `/api/v1/billing/${provider}/checkout`,
      {
        method: "POST",
        body: JSON.stringify({ plan_id: planId }),
      }
    );
  }

  async getPortal(provider: string): Promise<{ portal_url: string }> {
    return this.request<{ portal_url: string }>(
      `/api/v1/billing/${provider}/portal`,
      {
        method: "POST",
      }
    );
  }

  async cancelSubscription(
    provider: string
  ): Promise<{ success: boolean; message: string }> {
    return this.request<{ success: boolean; message: string }>(
      `/api/v1/billing/${provider}/cancel`,
      {
        method: "POST",
      }
    );
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
    data: TestConnectionRequest
  ): Promise<TestConnectionResponse> {
    return this.request<TestConnectionResponse>(
      "/api/v1/apis/test-connection",
      {
        method: "POST",
        body: JSON.stringify(data),
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
  get: () => apiClient.getAnalytics(),
};

export const apiConfigAPI = {
  list: () => apiClient.listAPIConfigs(),
  get: (id: string) => apiClient.getAPIConfig(id),
  create: (data: Partial<APIConfig>) => apiClient.createAPIConfig(data),
  update: (id: string, data: Partial<APIConfig>) =>
    apiClient.updateAPIConfig(id, data),
  delete: (id: string) => apiClient.deleteAPIConfig(id),
  testConnection: (data: TestConnectionRequest) =>
    apiClient.testConnection(data),
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
  delete: (eventId: string) => apiClient.deleteWebhookEvent(eventId),
  bulkRetry: (eventIds: string[]) => apiClient.bulkRetryWebhookEvents(eventIds),
  getConfig: () => apiClient.getWebhookConfig(),
  updateConfig: (config: Partial<WebhookConfig>) =>
    apiClient.updateWebhookConfig(config),
  test: (data: {
    target_url: string;
    payload: Record<string, unknown>;
    headers?: Record<string, string>;
  }) => apiClient.testWebhookDelivery(data),
};

export const billingAPI = {
  getProviders: () => apiClient.getPaymentProviders(),
  checkout: (provider: string, planId: string) =>
    apiClient.createCheckout(provider, planId),
  portal: (provider: string) => apiClient.getPortal(provider),
  cancel: (provider: string) => apiClient.cancelSubscription(provider),
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
