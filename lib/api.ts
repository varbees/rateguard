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

export interface DashboardStats {
  total_requests: number;
  requests_today: number;
  active_apis: number;
  avg_response_time_ms: number;
  success_rate: number;
  monthly_usage: number;
  plan_limit: number;
  usage_by_api: UsageByAPI[];
  timestamp: string;
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
  api_key: string;
  token?: string;
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
  private apiKey: string | null = null;

  constructor() {
    this.baseURL = API_BASE_URL;
    // Try to load API key from localStorage on client side
    if (typeof window !== "undefined") {
      this.apiKey = localStorage.getItem("apiKey");
    }
  }

  setApiKey(apiKey: string) {
    this.apiKey = apiKey;
    if (typeof window !== "undefined") {
      localStorage.setItem("apiKey", apiKey);
    }
  }

  clearApiKey() {
    this.apiKey = null;
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

    // Backend expects X-API-Key header for authentication
    if (this.apiKey) {
      headers["X-API-Key"] = this.apiKey;
    }

    try {
      const response = await fetch(`${this.baseURL}${endpoint}`, {
        ...options,
        headers,
      });

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

  // Health Check
  async healthCheck() {
    return this.request<{ status: string; healthy: boolean }>("/health");
  }

  // Authentication
  async signup(data: SignupRequest): Promise<LoginResponse> {
    return this.request<LoginResponse>("/api/v1/auth/signup", {
      method: "POST",
      body: JSON.stringify(data),
    });
  }

  async login(data: LoginRequest): Promise<LoginResponse> {
    return this.request<LoginResponse>("/api/v1/auth/login", {
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
  async getAnalytics(params?: {
    dateRange?: "today" | "7d" | "30d" | "custom";
    startDate?: string;
    endDate?: string;
    apiId?: string;
  }): Promise<AnalyticsData> {
    // This will transform the existing dashboard stats into analytics format
    const stats = await this.getDashboardStats();
    const usage = await this.getUsageStats();

    // Transform backend data into analytics format
    // For now, we'll use mock data structure but call real endpoints
    // You can enhance this to aggregate multiple endpoint responses
    return this.transformToAnalytics(stats, usage);
  }

  // Transform backend stats to analytics format
  private transformToAnalytics(
    stats: DashboardStats,
    usage: UsageStats
  ): AnalyticsData {
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
      requestsPerAPI: stats.usage_by_api.map((api, index) => ({
        apiId: `api-${index}`,
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
      topEndpoints: stats.usage_by_api.map((api) => ({
        path: `/api/v1/${api.api_name.toLowerCase().replace(/\s+/g, "-")}`,
        method: "GET",
        requests: api.requests,
        avgResponseTime: api.avg_duration_ms,
        errorRate: api.error_rate,
      })),
    };
  }

  // Generate time series data from dashboard stats
  private generateTimeSeriesData(stats: DashboardStats): RequestsOverTime[] {
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
}

// Export singleton instance
export const apiClient = new APIClient();

// Export individual API namespaces for convenience
export const dashboardAPI = {
  stats: () => apiClient.getDashboardStats(),
  usage: () => apiClient.getUsageStats(),
};

export const analyticsAPI = {
  get: (params?: {
    dateRange?: "today" | "7d" | "30d" | "custom";
    startDate?: string;
    endDate?: string;
    apiId?: string;
  }) => apiClient.getAnalytics(params),
};

export const apiConfigAPI = {
  list: () => apiClient.listAPIConfigs(),
  get: (id: string) => apiClient.getAPIConfig(id),
  create: (data: Partial<APIConfig>) => apiClient.createAPIConfig(data),
  update: (id: string, data: Partial<APIConfig>) =>
    apiClient.updateAPIConfig(id, data),
  delete: (id: string) => apiClient.deleteAPIConfig(id),
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
