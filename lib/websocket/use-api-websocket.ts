/**
 * API-Specific WebSocket Hooks
 * 
 * Specialized hooks for monitoring individual APIs and their status
 */

'use client';

import { useWebSocket } from './use-websocket';

interface UseWebSocketOptions {
  enabled?: boolean;
  reconnect?: boolean;
  maxRetries?: number;
}

/**
 * Hook for monitoring all APIs status
 * Provides real-time updates for API health, circuit breaker states, and activity
 */
export function useAPIStatusWebSocket(options?: UseWebSocketOptions) {
  return useWebSocket('/apis/status', options);
}

/**
 * Hook for per-API overview metrics
 * Real-time statistics including requests, success rate, latency, etc.
 */
export function useAPIMetricsWebSocket(apiId: string, options?: UseWebSocketOptions) {
  return useWebSocket(`/apis/${apiId}/overview`, options);
}

/**
 * Hook for per-API usage timeline
 * Streaming chart data for usage over time
 */
export function useAPIUsageWebSocket(apiId: string, options?: UseWebSocketOptions) {
  return useWebSocket(`/apis/${apiId}/usage`, options);
}

/**
 * Hook for per-API request log stream
 * Real-time individual request monitoring
 */
export function useAPIRequestsWebSocket(apiId: string, options?: UseWebSocketOptions) {
  return useWebSocket(`/apis/${apiId}/requests`, options);
}

/**
 * Hook for per-API rate limit monitoring
 * Real-time rate limit consumption and throttle events
 */
export function useAPIRateLimitsWebSocket(apiId: string, options?: UseWebSocketOptions) {
  return useWebSocket(`/apis/${apiId}/rate-limits`, options);
}

/**
 * Hook for per-API circuit breaker status
 * Real-time circuit breaker state changes
 */
export function useAPICircuitBreakerWebSocket(apiId: string, options?: UseWebSocketOptions) {
  return useWebSocket(`/apis/${apiId}/circuit-breaker`, options);
}
