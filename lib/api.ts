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

    const response = await fetch(`${this.baseURL}${endpoint}`, {
      ...options,
      headers,
    });

    if (!response.ok) {
      const error = await response.json().catch(() => ({
        message: "An error occurred",
      }));
      throw new Error(error.message || `HTTP ${response.status}`);
    }

    return response.json();
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
}

// Export singleton instance
export const apiClient = new APIClient();

// Export individual API namespaces for convenience
export const dashboardAPI = {
  stats: () => apiClient.getDashboardStats(),
  usage: () => apiClient.getUsageStats(),
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
