"use client";

import { useQuery } from "@tanstack/react-query";
import { webhookAPI, type WebhookStats } from "@/lib/api";

export interface UseWebhookStatsOptions {
  enablePolling?: boolean;
  pollingInterval?: number;
}

export function useWebhookStats(options: UseWebhookStatsOptions = {}) {
  const {
    enablePolling = true,
    pollingInterval = 10000, // 10 seconds (less frequent than events)
  } = options;

  return useQuery({
    queryKey: ["webhook-stats"],
    queryFn: () => webhookAPI.stats(),
    refetchInterval: enablePolling ? pollingInterval : false,
    refetchIntervalInBackground: false,
    staleTime: 5000,
  });
}
