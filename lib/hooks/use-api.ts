import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import {
  apiClient,
  User,
  DashboardStats,
  UsageStats,
  AlertsResponse,
  APIConfig,
  CostEstimate,
  AnalyticsData,
  QueueStats,
  QueuedRequest,
  QueueConfig,
  CircuitBreakerStatsResponse,
  CircuitBreakerMetricsResponse,
} from "@/lib/api";

// Query Keys
export const queryKeys = {
  user: ["user"],
  dashboardStats: ["dashboardStats"],
  usageStats: ["usageStats"],
  alerts: ["alerts"],
  apiConfigs: ["apiConfigs"],
  apiConfig: (id: string) => ["apiConfigs", id],
  costEstimate: ["costEstimate"],
  analytics: ["analytics"],
  queueStats: ["queueStats"],
  activeQueues: ["activeQueues"],
  queueConfig: ["queueConfig"],
  settings: ["settings"],
  circuitBreakerStats: ["circuitBreakerStats"],
  circuitBreakerMetrics: ["circuitBreakerMetrics"],
};

// User Hooks
export function useUser() {
  return useQuery({
    queryKey: queryKeys.user,
    queryFn: async () => {
      try {
        return await apiClient.getCurrentUser();
      } catch (error: any) {
        // If user is not authenticated (401), return null instead of throwing
        // This allows public pages to check auth without errors
        if (error?.statusCode === 401) {
          return null;
        }
        throw error;
      }
    },
    retry: false,
    staleTime: 1000 * 60 * 15, // 15 minutes - User data rarely changes
    gcTime: 1000 * 60 * 30, // 30 minutes
  });
}

export function useLogin() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (credentials: any) => apiClient.login(credentials),
    onSuccess: () => {
      // Invalidate user query to fetch fresh data
      queryClient.invalidateQueries({ queryKey: queryKeys.user });
    },
  });
}

export function useLogout() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async () => {
      await apiClient.logout(); // Call backend to clear JWT cookie
    },
    onSuccess: () => {
      // Clear all queries from cache on logout
      queryClient.clear();
    },
  });
}

export function useSignup() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (data: any) => apiClient.signup(data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: queryKeys.user });
    },
  });
}

export function useForgotPassword() {
  return useMutation({
    mutationFn: (email: string) => apiClient.requestPasswordReset({ email }),
  });
}

export function useResetPassword() {
  return useMutation({
    mutationFn: (data: any) => apiClient.resetPassword(data),
  });
}

// Dashboard Hooks
export function useDashboardStats() {
  return useQuery({
    queryKey: queryKeys.dashboardStats,
    queryFn: () => apiClient.getDashboardStats(),
    refetchInterval: 30000, // Refresh every 30s
  });
}

export function useUsageStats() {
  return useQuery({
    queryKey: queryKeys.usageStats,
    queryFn: () => apiClient.getUsageStats(),
  });
}

export function useAlerts() {
  return useQuery({
    queryKey: queryKeys.alerts,
    queryFn: () => apiClient.getAlerts(),
    // No polling - WebSocket provides real-time alert updates
  });
}

export function useCostEstimate() {
  return useQuery({
    queryKey: queryKeys.costEstimate,
    queryFn: () => apiClient.getCostEstimate(),
  });
}

export function useAnalytics() {
  return useQuery({
    queryKey: queryKeys.analytics,
    queryFn: () => apiClient.getAnalytics(),
  });
}

// API Config Hooks
export function useAPIConfigs() {
  return useQuery({
    queryKey: queryKeys.apiConfigs,
    queryFn: () => apiClient.listAPIConfigs(),
    staleTime: 1000 * 60 * 1, // 1 minute - Config lists don't change often
    gcTime: 1000 * 60 * 5, // 5 minutes
  });
}

export function useAPIConfig(id: string) {
  return useQuery({
    queryKey: queryKeys.apiConfig(id),
    queryFn: () => apiClient.getAPIConfig(id),
    enabled: !!id,
    staleTime: 1000 * 60 * 1, // 1 minute
    gcTime: 1000 * 60 * 5, // 5 minutes
  });
}

export function useRateLimitObservations(apiId: string) {
  return useQuery({
    queryKey: ["rate-limit-observations", apiId],
    queryFn: async () => {
      const response = await apiClient.getRateLimitObservations(apiId);
      return response as any[]; // Type assertion for now, or import the type if available
    },
    enabled: !!apiId,
  });
}

export function useCreateAPIConfig() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (data: Partial<APIConfig>) => apiClient.createAPIConfig(data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: queryKeys.apiConfigs });
    },
  });
}

export function useUpdateAPIConfig() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ id, data }: { id: string; data: Partial<APIConfig> }) =>
      apiClient.updateAPIConfig(id, data),
    onSuccess: (data, variables) => {
      queryClient.invalidateQueries({ queryKey: queryKeys.apiConfigs });
      queryClient.invalidateQueries({
        queryKey: queryKeys.apiConfig(variables.id),
      });
    },
  });
}

export function useDeleteAPIConfig() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (id: string) => apiClient.deleteAPIConfig(id),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: queryKeys.apiConfigs });
    },
  });
}

// Queue Hooks
export function useQueueStats() {
  return useQuery({
    queryKey: queryKeys.queueStats,
    queryFn: () => apiClient.getQueueStats(),
    refetchInterval: 10000, // Real-time updates
  });
}

export function useActiveQueues() {
  return useQuery({
    queryKey: queryKeys.activeQueues,
    queryFn: () => apiClient.getActiveQueues(),
    refetchInterval: 5000,
  });
}

export function useQueueConfig() {
  return useQuery({
    queryKey: queryKeys.queueConfig,
    queryFn: () => apiClient.getQueueConfig(),
  });
}

export function useUpdateQueueConfig() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (config: QueueConfig) => apiClient.updateQueueConfig(config),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: queryKeys.queueConfig });
    },
  });
}

export function useCancelQueuedRequest() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (requestId: string) => apiClient.cancelQueuedRequest(requestId),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: queryKeys.activeQueues });
      queryClient.invalidateQueries({ queryKey: queryKeys.queueStats });
    },
  });
}

// Settings Hooks
export function useSettings() {
  return useQuery({
    queryKey: queryKeys.settings,
    queryFn: () => apiClient.getSettings(),
  });
}

export function useUpdateSettings() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (settings: {
      email_alerts?: boolean;
      usage_threshold_percent?: number;
      error_alerts?: boolean;
      weekly_report?: boolean;
    }) => apiClient.updateSettings(settings),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: queryKeys.settings });
    },
  });
}

// Circuit Breaker Hooks
export function useCircuitBreakerStats() {
  return useQuery({
    queryKey: queryKeys.circuitBreakerStats,
    queryFn: () => apiClient.getCircuitBreakerStats(),
    // No polling - WebSocket provides real-time circuit breaker updates
  });
}

export function useCircuitBreakerMetrics() {
  return useQuery({
    queryKey: queryKeys.circuitBreakerMetrics,
    queryFn: () => apiClient.getCircuitBreakerMetrics(),
    // No polling - WebSocket provides real-time circuit breaker updates
  });
}

export function useResetCircuitBreaker() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (apiId: string) => apiClient.resetCircuitBreaker(apiId),
    onSuccess: () => {
      queryClient.invalidateQueries({
        queryKey: queryKeys.circuitBreakerStats,
      });
      queryClient.invalidateQueries({
        queryKey: queryKeys.circuitBreakerMetrics,
      });
      queryClient.invalidateQueries({ queryKey: queryKeys.alerts });
    },
  });
}

// Usage History Hooks
export function useUsageHistory(period: "24h" | "7d" | "30d" = "7d") {
  return useQuery({
    queryKey: ["usageHistory", period],
    queryFn: () => apiClient.getUsageHistory(period),
    refetchInterval: 60000, // Refresh every minute
  });
}

// Recent Requests Hooks
export function useRecentRequests(params?: {
  limit?: number;
  api_id?: string;
  status_code?: number;
}) {
  return useQuery({
    queryKey: ["recentRequests", params],
    queryFn: () => apiClient.getRecentRequests(params || { limit: 10 }),
    refetchInterval: 30000, // Refresh every 30 seconds
  });
}

// Webhook Hooks
export function useWebhookStatus(params?: {
  page?: number;
  page_size?: number;
  status?: string;
  source?: string;
}) {
  return useQuery({
    queryKey: ["webhookStatus", params],
    queryFn: () => apiClient.getWebhookStatus(params),
    refetchInterval: 10000, // Refresh every 10 seconds
  });
}

export function useWebhookStats() {
  return useQuery({
    queryKey: ["webhookStats"],
    queryFn: () => apiClient.getWebhookStats(),
    refetchInterval: 30000,
  });
}

export function useWebhookEvent(eventId: string) {
  return useQuery({
    queryKey: ["webhookEvent", eventId],
    queryFn: () => apiClient.getWebhookEvent(eventId),
    enabled: !!eventId,
  });
}

export function useCreateWebhookEvent() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (data: Parameters<typeof apiClient.createWebhookEvent>[0]) =>
      apiClient.createWebhookEvent(data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["webhookStatus"] });
      queryClient.invalidateQueries({ queryKey: ["webhookStats"] });
    },
  });
}
