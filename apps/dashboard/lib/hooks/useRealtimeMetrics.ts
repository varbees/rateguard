import { useEffect, useState, useRef } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { useWebSocket } from '@/lib/websocket/context';
import { fetchStreamingStats, type StreamingStats, type TimePeriod } from '@/lib/api/streaming';

interface RealtimeMetricsOptions {
  period?: TimePeriod;
  enabled?: boolean;
}

export function useRealtimeMetrics({ period = '30d', enabled = true }: RealtimeMetricsOptions = {}) {
  const queryClient = useQueryClient();
  const { lastMessage, connectionStatus } = useWebSocket();
  const [realtimeStats, setRealtimeStats] = useState<StreamingStats | null>(null);
  
  // Fetch initial snapshot
  const { data: snapshot, isLoading, error, refetch } = useQuery({
    queryKey: ['/api/v1/dashboard/stats/streaming', period],
    queryFn: () => fetchStreamingStats(period),
    enabled: enabled,
    staleTime: 60 * 1000, // Snapshot is fresh for 1 minute (we'll update it via WS)
  });

  // Initialize realtime stats with snapshot
  useEffect(() => {
    if (snapshot) {
      setRealtimeStats(snapshot);
    }
  }, [snapshot]);

  // Handle WebSocket updates
  useEffect(() => {
    if (!enabled || !realtimeStats || connectionStatus !== 'connected') return;
    
    if (lastMessage && lastMessage.type === 'metrics.update') {
      const update = lastMessage.data;
      
      // Update stats incrementally
      setRealtimeStats(prev => {
        if (!prev) return null;
        
        const newRequests = Number(update.requests) || 0;
        const newBytes = Number(update.bytes) || 0;
        const updateAvgLatency = Number(update.avg_latency) || 0;
        
        // Calculate new average duration
        // Current total duration = prev.avg_duration_ms * prev.total_streams
        // New total duration = Current + (updateAvgLatency * newRequests)
        // New Avg = New Total / (prev.total_streams + newRequests)
        
        const currentTotalDuration = prev.avg_duration_ms * prev.total_streams;
        const additionalDuration = updateAvgLatency * newRequests;
        const newTotalStreams = prev.total_streams + newRequests;
        
        const newAvgDuration = newTotalStreams > 0 
          ? (currentTotalDuration + additionalDuration) / newTotalStreams 
          : prev.avg_duration_ms;

        return {
          ...prev,
          total_streams: newTotalStreams,
          total_bytes: prev.total_bytes + newBytes,
          total_bytes_gb: (prev.total_bytes + newBytes) / (1024 * 1024 * 1024),
          avg_duration_ms: newAvgDuration,
          // We don't have max duration in update, keep previous
        };
      });
    }
  }, [lastMessage, enabled, connectionStatus]);

  // Refetch snapshot on reconnection to ensure data consistency
  useEffect(() => {
    if (connectionStatus === 'connected') {
      refetch();
    }
  }, [connectionStatus, refetch]);

  return {
    data: realtimeStats || snapshot,
    isLoading,
    error,
    isConnected: connectionStatus === 'connected',
    isConnecting: connectionStatus === 'connecting',
  };
}
