import { QueryClient } from "@tanstack/react-query";

const API_BASE_URL = process.env.NEXT_PUBLIC_API_URL || "http://localhost:8008";

// API Response Types (matching backend models exactly)
export interface User {
  id: string;
  email: string;
  plan: "free" | "pro" | "enterprise";
  api_key: string;
  active: boolean;
  email_verified: boolean;
  last_login_at?: string;
  created_at: string;
  updated_at: string;
}

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
}

export interface UsageByAPI {
  api_name: string;
  requests: number;
  avg_duration_ms: number;
  success_rate: number;
  error_rate: number;
  last_used: string;
}

export interface PlanFeatures {
  max_apis: number;
  max_requests_per_day: number;
  max_requests_per_month: number;
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
  plan?: "free" | "pro" | "enterprise";
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

export interface RequestPasswordResetRequest {
  email: string;
}

export interface ResetPasswordRequest {
  token: string;
  password: string;
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
          const publicPaths = ['/', '/login', '/signup', '/forgot-password', '/reset-password', '/pricing', '/docs'];
          const isPublicPage = typeof window !== "undefined" && publicPaths.some(path => 
            window.location.pathname === path || window.location.pathname.startsWith('/docs')
          );
          
          if (typeof window !== "undefined" && !isPublicPage && !window.location.pathname.startsWith("/login")) {
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
    return this.request<APIConfig>(`/api/v1/apis`, {
      method: "POST",
      body: JSON.stringify(data),
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

  async cancelQueuedRequest(requestId: string): Promise<{ cancelled: boolean }> {
    return this.request<{ cancelled: boolean }>(`/api/v1/dashboard/queues/${requestId}`, {
      method: "DELETE",
    });
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
}

// Export singleton instance
export const apiClient = new APIClient();

// Export individual API namespaces for convenience
export const dashboardAPI = {
  stats: () => apiClient.getDashboardStats(),
  usage: () => apiClient.getUsageStats(),
  alerts: () => apiClient.getAlerts(),
  costs: () => apiClient.getCostEstimate(),
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
