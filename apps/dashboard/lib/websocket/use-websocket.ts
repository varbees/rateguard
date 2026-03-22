/**
 * React Hook for WebSocket Connections
 * 
 * Provides WebSocket functionality with auth-gated access control,
 * connection state management, and cleanup.
 */

'use client';

import { useEffect, useState, useCallback, useRef } from 'react';
import { WebSocketManager, ConnectionStatus } from './connection-manager';
import { useUser } from '@/lib/hooks/use-user';

interface UseWebSocketOptions {
  enabled?: boolean;
  reconnect?: boolean;
  maxRetries?: number;
}

interface UseWebSocketReturn {
  status: ConnectionStatus;
  subscribe: (event: string, callback: (data: any) => void) => () => void;
  send: (message: any) => void;
  isConnected: boolean;
  hasAccess: boolean;
  reconnect: () => void;
}

/**
 * Hook to establish and manage a WebSocket connection
 * 
 * @param endpoint WebSocket endpoint path (e.g., '/dashboard', '/usage/api_123')
 * @param options Configuration options
 * @returns WebSocket state and methods
 * 
 * @example
 * ```tsx
 * const { status, subscribe, isConnected } = useWebSocket('/dashboard');
 * 
 * useEffect(() => {
 *   if (isConnected) {
 *     return subscribe('stats_update', (data) => {
 *       console.log('New stats:', data);
 *     });
 *   }
 * }, [isConnected, subscribe]);
 * ```
 */
export function useWebSocket(
  endpoint: string,
  options: UseWebSocketOptions = {}
): UseWebSocketReturn {
  const { enabled = true, reconnect = true, maxRetries = 5 } = options;
  
  const { user } = useUser();
  const [status, setStatus] = useState<ConnectionStatus>('disconnected');
  const managerRef = useRef<WebSocketManager | null>(null);

  // WebSocket access is controlled by auth availability and feature enablement.
  const hasAccess = Boolean(enabled && user);

  useEffect(() => {
    // Don't connect if user doesn't have access or feature is disabled
    if (!hasAccess) {
      setStatus('disconnected');
      return;
    }

    if (!user) {
      console.warn('[useWebSocket] No authenticated user available');
      return;
    }

    // Create WebSocket manager
    const wsUrl = process.env.NEXT_PUBLIC_WS_URL || 'ws://localhost:8008';
    const fullUrl = `${wsUrl}/ws${endpoint}`;

    const manager = new WebSocketManager({
      url: fullUrl,
      reconnect,
      maxRetries,
    });

    // Subscribe to connection status changes
    manager.on('connection', ({ status: connectionStatus }) => {
      setStatus(connectionStatus);
    });

    // Connect
    manager.connect();

    // Store manager ref
    managerRef.current = manager;

    // Cleanup on unmount
    return () => {
      manager.disconnect();
      managerRef.current = null;
    };
  }, [endpoint, hasAccess, user, reconnect, maxRetries]);

  /**
   * Subscribe to a WebSocket event
   */
  const subscribe = useCallback((event: string, callback: (data: any) => void) => {
    if (!managerRef.current) {
      console.warn(`[useWebSocket] Cannot subscribe to "${event}", not connected`);
      return () => {};
    }

    return managerRef.current.on(event, callback);
  }, []);

  /**
   * Send a message through the WebSocket
   */
  const send = useCallback((message: any) => {
    if (!managerRef.current) {
      console.warn('[useWebSocket] Cannot send message, not connected');
      return;
    }

    try {
      managerRef.current.send(message);
    } catch (error) {
      console.error('[useWebSocket] Failed to send message:', error);
    }
  }, []);

  /**
   * Manually trigger reconnection
   */
  const reconnectManually = useCallback(() => {
    if (managerRef.current) {
      managerRef.current.disconnect();
      managerRef.current.connect();
    }
  }, []);

  return {
    status,
    subscribe,
    send,
    isConnected: status === 'connected',
    hasAccess,
    reconnect: reconnectManually,
  };
}

/**
 * Hook for dashboard-wide WebSocket connection
 * Convenience wrapper for the main dashboard WebSocket
 */
export function useDashboardWebSocket(options?: UseWebSocketOptions) {
  return useWebSocket('/dashboard', options);
}

/**
 * Hook for API-specific usage data WebSocket
 */
export function useUsageWebSocket(apiId: string, options?: UseWebSocketOptions) {
  return useWebSocket(`/usage/${apiId}`, options);
}

/**
 * Hook for request log WebSocket
 */
export function useRequestsWebSocket(options?: UseWebSocketOptions) {
  return useWebSocket('/requests', options);
}

/**
 * Hook for alerts WebSocket.
 */
export function useAlertsWebSocket(options?: UseWebSocketOptions) {
  return useWebSocket('/alerts', options);
}
