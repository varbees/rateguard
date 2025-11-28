import {
  createContext,
  useContext,
  useEffect,
  useState,
  useCallback,
  useRef,
} from "react";

/**
 * WebSocket event types matching backend EventType
 */
export type WebSocketEventType =
  | "metrics.update"
  | "alert.triggered"
  | "circuit_breaker.state_change"
  | "system.health"
  | "api.metrics.update"
  | "test.message";

/**
 * WebSocket event structure matching backend WebSocketEvent
 * Ensures type-safe data flow between frontend and backend
 */
export interface WebSocketEvent {
  type: WebSocketEventType;
  timestamp: number; // Unix milliseconds
  data: Record<string, any>; // Event-specific payload
  user_id?: string; // Optional user ID for user-specific events
}

/**
 * WebSocket error details for production logging
 */
export interface WebSocketError {
  code: string;
  message: string;
  timestamp: number;
  details?: Record<string, any>;
}

/**
 * Connection error event for error tracking
 */
export interface ConnectionErrorEvent {
  type: "connection_error";
  error: WebSocketError;
  retryAttempt: number;
  maxRetries: number;
}

/**
 * WebSocket connection status
 */
export type ConnectionStatus =
  | "connecting"
  | "connected"
  | "disconnected"
  | "error";

/**
 * WebSocket context value with production-level features
 */
interface WebSocketContextValue {
  connectionStatus: ConnectionStatus;
  lastMessage: WebSocketEvent | null;
  lastError: WebSocketError | null;
  isConnected: boolean; // Convenience flag
  subscribe: (
    eventType: WebSocketEventType | "*",
    callback: (event: WebSocketEvent) => void
  ) => () => void;
  sendMessage: (message: any) => void;
  reconnect: () => void; // Manual reconnect trigger
}

const WebSocketContext = createContext<WebSocketContextValue | null>(null);

/**
 * Hook to access WebSocket context
 */
/**
 * Hook to access WebSocket context with fallback
 * Throws error if used outside WebSocketProvider
 */
export function useWebSocket() {
  const context = useContext(WebSocketContext);
  if (!context) {
    throw new Error(
      "useWebSocket must be used within WebSocketProvider. " +
        "Ensure WebSocketProvider wraps your component tree in app/providers.tsx"
    );
  }
  return context;
}

/**
 * Hook to safely access WebSocket context with optional fallback
 * Returns null if not within provider instead of throwing
 */
export function useWebSocketOptional() {
  return useContext(WebSocketContext);
}

/**
 * WebSocket Provider Props
 */
interface WebSocketProviderProps {
  children: React.ReactNode;
  url?: string; // WebSocket URL (defaults to current host)
  enabled?: boolean; // Enable/disable WebSocket connection (default: true)
  debug?: boolean; // Enable debug logging (default: false)
}

/**
 * WebSocket Provider Component
 */
export function WebSocketProvider({
  children,
  url,
  enabled = true,
  debug = false,
}: WebSocketProviderProps) {
  const [connectionStatus, setConnectionStatus] =
    useState<ConnectionStatus>("disconnected");
  const [lastMessage, setLastMessage] = useState<WebSocketEvent | null>(null);
  const [lastError, setLastError] = useState<WebSocketError | null>(null);

  const wsRef = useRef<WebSocket | null>(null);
  const reconnectTimeoutRef = useRef<NodeJS.Timeout | null>(null);
  const subscribersRef = useRef<
    Map<string, Set<(event: WebSocketEvent) => void>>
  >(new Map());
  const reconnectAttemptsRef = useRef(0);
  const maxReconnectAttempts = 10;
  const baseReconnectDelay = 1000; // 1 second

  /**
   * Get JWT token from cookies (httpOnly cookies are sent automatically by browser)
   * For WebSocket, we need to extract from document.cookie or use a query parameter
   * Since httpOnly cookies can't be read from JS, we'll use a fallback approach:
   * 1. Try to get from document.cookie (non-httpOnly fallback)
   * 2. If not found, proceed without token - browser will send httpOnly cookies automatically
   */
  const getToken = useCallback(() => {
    if (typeof window === "undefined") return null;

    // Try to get from regular cookies (if any non-httpOnly token exists)
    const cookies = document.cookie.split(";");
    for (const cookie of cookies) {
      const [name, value] = cookie.trim().split("=");
      if (name === "access_token" || name === "auth_token") {
        return decodeURIComponent(value);
      }
    }

    // If no token in cookies, return null
    // The browser will still send httpOnly cookies automatically with the WebSocket upgrade
    return null;
  }, []);

  /**
   * Calculate reconnect delay with exponential backoff
   */
  const getReconnectDelay = useCallback(() => {
    const delay = Math.min(
      baseReconnectDelay * Math.pow(2, reconnectAttemptsRef.current),
      30000 // Max 30 seconds
    );
    return delay;
  }, []);

  /**
   * Connect to WebSocket server
   */
  const connect = useCallback(() => {
    if (!enabled) return;
    if (wsRef.current?.readyState === WebSocket.OPEN) return;

    // Determine WebSocket URL
    const wsUrl =
      url ||
      (() => {
        const protocol = window.location.protocol === "https:" ? "wss:" : "ws:";
        const host =
          process.env.NEXT_PUBLIC_API_URL?.replace(/^https?:\/\//, "") ||
          window.location.host;

        // Try to include token in query if available (non-httpOnly cookie)
        // If not available, httpOnly cookies will be sent automatically by browser
        const token = getToken();
        const tokenParam = token ? `?token=${token}` : "";
        return `${protocol}//${host}/ws${tokenParam}`;
      })();

    if (debug || process.env.NODE_ENV === "development") {
      console.log(
        "[WebSocket] Connecting to:",
        wsUrl.replace(/token=.+/, "token=***")
      );
    }
    setConnectionStatus("connecting");

    try {
      const ws = new WebSocket(wsUrl);
      wsRef.current = ws;

      ws.onopen = () => {
        console.log("[WebSocket] Connected successfully");
        setConnectionStatus("connected");
        reconnectAttemptsRef.current = 0; // Reset reconnect attempts on successful connection
      };

      ws.onmessage = (event) => {
        try {
          const message: WebSocketEvent = JSON.parse(event.data);
          if (debug || process.env.NODE_ENV === "development") {
            console.log(
              "[WebSocket] Message received:",
              message.type,
              message.data
            );
          }

          setLastMessage(message);

          // Notify subscribers
          const typeSubscribers = subscribersRef.current.get(message.type);
          if (typeSubscribers) {
            typeSubscribers.forEach((callback) => callback(message));
          }

          // Also notify wildcard subscribers
          const wildcardSubscribers = subscribersRef.current.get("*");
          if (wildcardSubscribers) {
            wildcardSubscribers.forEach((callback) => callback(message));
          }
        } catch (error) {
          const errorMessage =
            error instanceof Error ? error.message : "Unknown error";
          console.error(
            "[WebSocket] Failed to parse message:",
            errorMessage,
            event.data
          );
        }
      };

      ws.onerror = (event: Event) => {
        // Extract error details safely
        const errorCode = (event as any)?.code || "UNKNOWN_ERROR";
        const errorMessage =
          (event as any)?.message || "WebSocket error occurred";
        const wsError: WebSocketError = {
          code: errorCode,
          message: errorMessage,
          timestamp: Date.now(),
          details: {
            readyState: ws.readyState,
            url: ws.url,
            protocol: ws.protocol,
          },
        };

        console.error(
          `[WebSocket] Error (${errorCode}):`,
          errorMessage,
          wsError.details
        );

        setLastError(wsError);
        setConnectionStatus("error");
      };

      ws.onclose = (event: CloseEvent) => {
        const closeCode = event.code;
        const closeReason = event.reason || "No reason provided";
        const wasClean = event.wasClean;

        console.log(
          `[WebSocket] Connection closed (code: ${closeCode}, clean: ${wasClean}):`,
          closeReason
        );

        setConnectionStatus("disconnected");
        wsRef.current = null;

        // Determine if we should attempt reconnection
        const shouldReconnect =
          enabled &&
          reconnectAttemptsRef.current < maxReconnectAttempts &&
          // Don't reconnect on normal closure (1000) if explicitly closed
          !(closeCode === 1000 && wasClean);

        if (shouldReconnect) {
          const delay = getReconnectDelay();
          const attempt = reconnectAttemptsRef.current + 1;

          console.log(
            `[WebSocket] Reconnecting in ${delay}ms (attempt ${attempt}/${maxReconnectAttempts})`
          );

          reconnectTimeoutRef.current = setTimeout(() => {
            reconnectAttemptsRef.current++;
            connect();
          }, delay);
        } else if (reconnectAttemptsRef.current >= maxReconnectAttempts) {
          const finalError: WebSocketError = {
            code: "MAX_RETRIES_EXCEEDED",
            message: `Failed to connect after ${maxReconnectAttempts} attempts`,
            timestamp: Date.now(),
            details: {
              lastCloseCode: closeCode,
              lastCloseReason: closeReason,
            },
          };
          setLastError(finalError);
          console.error(
            "[WebSocket] Max reconnect attempts reached:",
            finalError.message
          );
        }
      };
    } catch (error) {
      const errorMessage =
        error instanceof Error ? error.message : "Unknown error";
      const wsError: WebSocketError = {
        code: "CREATION_FAILED",
        message: `Failed to create WebSocket: ${errorMessage}`,
        timestamp: Date.now(),
        details: {
          error: errorMessage,
          url: wsUrl,
        },
      };

      console.error("[WebSocket] Failed to create WebSocket:", wsError);
      setLastError(wsError);
      setConnectionStatus("error");
    }
  }, [enabled, url, getToken, getReconnectDelay, debug]);

  /**
   * Disconnect from WebSocket server
   */
  const disconnect = useCallback(() => {
    if (reconnectTimeoutRef.current) {
      clearTimeout(reconnectTimeoutRef.current);
      reconnectTimeoutRef.current = null;
    }

    if (wsRef.current) {
      try {
        wsRef.current.close(1000, "Client disconnect");
      } catch (error) {
        console.warn("[WebSocket] Error closing connection:", error);
      }
      wsRef.current = null;
    }

    setConnectionStatus("disconnected");
    setLastError(null);
  }, []);

  /**
   * Manual reconnect trigger
   */
  const reconnect = useCallback(() => {
    console.log("[WebSocket] Manual reconnect triggered");
    reconnectAttemptsRef.current = 0;
    setLastError(null);
    disconnect();
    connect();
  }, [connect, disconnect]);

  /**
   * Subscribe to WebSocket events
   */
  const subscribe = useCallback(
    (
      eventType: WebSocketEventType | "*",
      callback: (event: WebSocketEvent) => void
    ): (() => void) => {
      if (!subscribersRef.current.has(eventType)) {
        subscribersRef.current.set(eventType, new Set());
      }

      subscribersRef.current.get(eventType)!.add(callback);

      // Return unsubscribe function
      return () => {
        const subscribers = subscribersRef.current.get(eventType);
        if (subscribers) {
          subscribers.delete(callback);
          if (subscribers.size === 0) {
            subscribersRef.current.delete(eventType);
          }
        }
      };
    },
    []
  );

  /**
   * Send message to WebSocket server with error handling
   */
  const sendMessage = useCallback((message: any) => {
    if (!wsRef.current) {
      console.warn(
        "[WebSocket] Cannot send message: WebSocket not initialized"
      );
      return;
    }

    if (wsRef.current.readyState !== WebSocket.OPEN) {
      console.warn(
        `[WebSocket] Cannot send message: Connection not ready (state: ${wsRef.current.readyState})`
      );
      return;
    }

    try {
      wsRef.current.send(JSON.stringify(message));
      console.debug("[WebSocket] Message sent:", message.type || "unknown");
    } catch (error) {
      const errorMessage =
        error instanceof Error ? error.message : "Unknown error";
      console.error("[WebSocket] Failed to send message:", errorMessage);
    }
  }, []);

  // Connect on mount, disconnect on unmount
  useEffect(() => {
    if (enabled) {
      connect();
    }
    return () => disconnect();
  }, [connect, disconnect, enabled]);

  const value: WebSocketContextValue = {
    connectionStatus,
    lastMessage,
    lastError,
    isConnected: connectionStatus === "connected",
    subscribe,
    sendMessage,
    reconnect,
  };

  return (
    <WebSocketContext.Provider value={value}>
      {children}
    </WebSocketContext.Provider>
  );
}
