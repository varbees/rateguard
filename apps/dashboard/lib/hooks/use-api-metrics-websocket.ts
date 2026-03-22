"use client";

import { useEffect, useState } from "react";
import type { APIMetrics } from "@/lib/types/api";
import { useWebSocket } from "@/lib/websocket/context";

export interface LiveAPIMetrics {
  api_id: string;
  api_name: string;
  metrics: APIMetrics;
}

/**
 * Hook to subscribe to real-time per-API metrics updates via WebSocket
 */
export function useAPIMetricsWebSocket(apiId: string) {
  const { subscribe, isConnected } = useWebSocket();
  const [liveMetrics, setLiveMetrics] = useState<LiveAPIMetrics | null>(null);
  const [lastUpdate, setLastUpdate] = useState<Date | null>(null);

  useEffect(() => {
    if (!apiId || !isConnected) return;

    const unsubscribe = subscribe("api.metrics.update", (event) => {
      // Extract data from WebSocket event
     const data = event.data as any;
      
      // Only update if the metrics are for the current API
      if (data.api_id === apiId) {
        setLiveMetrics({
          api_id: data.api_id,
          api_name: data.api_name,
          metrics: data.metrics,
        });
        setLastUpdate(new Date());
      }
    });

    return () => {
      unsubscribe();
    };
  }, [apiId, isConnected, subscribe]);

  return {
    liveMetrics,
    lastUpdate,
    isLive: isConnected && liveMetrics !== null,
  };
}
