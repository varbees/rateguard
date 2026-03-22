"use client";

import { useQuery } from "@tanstack/react-query";
import { webhookAPI, type WebhookEvent } from "@/lib/api";
import { useState, useCallback } from "react";

export interface UseWebhookEventsOptions {
  page?: number;
  pageSize?: number;
  status?: string;
  source?: string;
  enablePolling?: boolean;
  pollingInterval?: number;
}

export interface UseWebhookEventsReturn {
  events: WebhookEvent[];
  totalCount: number;
  page: number;
  pageSize: number;
  isLoading: boolean;
  isError: boolean;
  error: Error | null;
  refetch: () => void;
  hasNextPage: boolean;
  fetchNextPage: () => void;
  isFetchingNextPage: boolean;
}

export function useWebhookEvents(options: UseWebhookEventsOptions = {}): UseWebhookEventsReturn {
  const {
    page = 1,
    pageSize = 20,
    status,
    source,
    enablePolling = true,
    pollingInterval = 5000, // 5 seconds
  } = options;

  const [currentPage, setCurrentPage] = useState(page);

  const { data, isLoading, isError, error, refetch, isFetching } = useQuery({
    queryKey: ["webhook-events", currentPage, pageSize, status, source],
    queryFn: () =>
      webhookAPI.status({
        page: currentPage,
        page_size: pageSize,
        status,
        source,
      }),
    refetchInterval: enablePolling ? pollingInterval : false,
    refetchIntervalInBackground: false, // Pause when tab is inactive
    staleTime: 3000, // Consider data stale after 3 seconds
  });

  const fetchNextPage = useCallback(() => {
    setCurrentPage((prev) => prev + 1);
  }, []);

  const hasNextPage = data
    ? currentPage * pageSize < data.total_count
    : false;

  return {
    events: data?.events || [],
    totalCount: data?.total_count || 0,
    page: data?.page || currentPage,
    pageSize: data?.page_size || pageSize,
    isLoading,
    isError,
    error: error as Error | null,
    refetch,
    hasNextPage,
    fetchNextPage,
    isFetchingNextPage: isFetching && currentPage > 1,
  };
}
