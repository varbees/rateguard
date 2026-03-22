import {
  useQuery,
  useMutation,
  useQueryClient,
  keepPreviousData,
} from "@tanstack/react-query";
import {
  webhookAPI,
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

// Mutations

export function useRetryWebhookEvent() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (id: string) => webhookAPI.retry(id),
    onSuccess: (_, id) => {
      queryClient.invalidateQueries({ queryKey: webhookKeys.event(id) });
      queryClient.invalidateQueries({ queryKey: webhookKeys.status() });
      queryClient.invalidateQueries({ queryKey: webhookKeys.stats });
      toast.success("Webhook replay scheduled");
    },
    onError: (error: any) => {
      toast.error(error.message || "Failed to replay webhook");
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
