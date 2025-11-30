import {
  useQuery,
  useMutation,
  useQueryClient,
  keepPreviousData,
} from "@tanstack/react-query";
import {
  webhookAPI,
  WebhookConfig,
  WebhookInboxRequest,
  WebhookStatusResponse,
} from "../api";
import { toast } from "../toast";

// Keys for React Query cache
export const webhookKeys = {
  all: ["webhooks"] as const,
  status: (params?: Record<string, unknown>) =>
    ["webhooks", "status", params] as const,
  stats: ["webhooks", "stats"] as const,
  events: (params?: Record<string, unknown>) =>
    ["webhooks", "events", params] as const,
  event: (id: string) => ["webhooks", "event", id] as const,
  config: ["webhooks", "config"] as const,
};

// Hooks

export function useWebhookStatus(params?: {
  page?: number;
  page_size?: number;
  status?: string;
  source?: string;
}) {
  return useQuery<WebhookStatusResponse>({
    queryKey: webhookKeys.status(params),
    queryFn: () => webhookAPI.status(params),
    placeholderData: keepPreviousData,
  });
}

export function useWebhookStats(refreshInterval = 0) {
  return useQuery({
    queryKey: webhookKeys.stats,
    queryFn: () => webhookAPI.stats(),
    refetchInterval: refreshInterval,
  });
}

export function useWebhookEvent(id: string) {
  return useQuery({
    queryKey: webhookKeys.event(id),
    queryFn: () => webhookAPI.get(id),
    enabled: !!id,
  });
}

export function useWebhookConfig() {
  return useQuery({
    queryKey: webhookKeys.config,
    queryFn: () => webhookAPI.getConfig(),
  });
}

// Mutations

export function useUpdateWebhookConfig() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (config: Partial<WebhookConfig>) =>
      webhookAPI.updateConfig(config),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: webhookKeys.config });
      toast.success("Webhook configuration updated");
    },
    onError: (error: any) => {
      toast.error(error.message || "Failed to update webhook configuration");
    },
  });
}

export function useRetryWebhookEvent() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (id: string) => webhookAPI.retry(id),
    onSuccess: (_, id) => {
      queryClient.invalidateQueries({ queryKey: webhookKeys.event(id) });
      queryClient.invalidateQueries({ queryKey: webhookKeys.status() });
      queryClient.invalidateQueries({ queryKey: webhookKeys.stats });
      toast.success("Webhook retry scheduled");
    },
    onError: (error: any) => {
      toast.error(error.message || "Failed to retry webhook");
    },
  });
}

export function useDeleteWebhookEvent() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (id: string) => webhookAPI.delete(id),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: webhookKeys.status() });
      queryClient.invalidateQueries({ queryKey: webhookKeys.stats });
      toast.success("Webhook event deleted");
    },
    onError: (error: any) => {
      toast.error(error.message || "Failed to delete webhook event");
    },
  });
}

export function useBulkRetryWebhookEvents() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (ids: string[]) => webhookAPI.bulkRetry(ids),
    onSuccess: (data) => {
      queryClient.invalidateQueries({ queryKey: webhookKeys.status() });
      queryClient.invalidateQueries({ queryKey: webhookKeys.stats });
      toast.success(data.message || "Bulk retry scheduled");
    },
    onError: (error: any) => {
      toast.error(error.message || "Failed to retry webhooks");
    },
  });
}

export function useTestWebhookDelivery() {
  return useMutation({
    mutationFn: (data: {
      target_url: string;
      payload: Record<string, unknown>;
      headers?: Record<string, string>;
    }) => webhookAPI.test(data),
    onSuccess: (data) => {
      if (data.success) {
        toast.success(`Test delivery successful (HTTP ${data.status_code})`);
      } else {
        toast.error(`Test delivery failed (HTTP ${data.status_code})`);
      }
    },
    onError: (error: any) => {
      toast.error(error.message || "Test delivery failed");
    },
  });
}

export function useCreateWebhookEvent() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (data: WebhookInboxRequest) => webhookAPI.create(data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: webhookKeys.status() });
      queryClient.invalidateQueries({ queryKey: webhookKeys.stats });
      toast.success("Webhook event created");
    },
    onError: (error: any) => {
      toast.error(error.message || "Failed to create webhook event");
    },
  });
}
