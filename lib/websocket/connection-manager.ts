/**
 * WebSocket Connection Manager
 * 
 * Handles WebSocket connections with automatic reconnection,
 * exponential backoff, and event-based messaging.
 */

export interface WebSocketConfig {
  url: string;
  token: string;
  reconnect?: boolean;
  maxRetries?: number;
  retryDelay?: number;
}

export type ConnectionStatus = 'connecting' | 'connected' | 'disconnected' | 'error';

export class WebSocketManager {
  private ws: WebSocket | null = null;
  private reconnectAttempts = 0;
  private maxRetries = 5;
  private retryDelay = 1000; // Base delay in ms
  private listeners = new Map<string, Set<(data: any) => void>>();
  private reconnectTimeout: NodeJS.Timeout | null = null;

  constructor(private config: WebSocketConfig) {
    this.maxRetries = config.maxRetries || 5;
    this.retryDelay = config.retryDelay || 1000;
  }

  connect() {
    if (this.ws?.readyState === WebSocket.OPEN) {
      console.log('[WebSocket] Already connected');
      return;
    }

    if (this.ws?.readyState === WebSocket.CONNECTING) {
      console.log('[WebSocket] Connection in progress');
      return;
    }

    const wsUrl = `${this.config.url}?token=${this.config.token}`;
    
    try {
      this.ws = new WebSocket(wsUrl);
      this.setupEventHandlers();
    } catch (error) {
      console.error('[WebSocket] Connection error:', error);
      this.emit('connection', { status: 'error', error });
    }
  }

  private setupEventHandlers() {
    if (!this.ws) return;

    this.ws.onopen = () => {
      console.log('[WebSocket] Connected');
      this.reconnectAttempts = 0;
      this.emit('connection', { status: 'connected' });
    };

    this.ws.onmessage = (event) => {
      try {
        const message = JSON.parse(event.data);
        
        // Emit the message to all subscribers of this message type
        this.emit(message.type, message.data);
        
        // Also emit to 'message' event for raw message handling
        this.emit('message', message);
      } catch (error) {
        console.error('[WebSocket] Failed to parse message:', error);
      }
    };

    this.ws.onerror = (error) => {
      console.error('[WebSocket] Error:', error);
      this.emit('connection', { status: 'error', error });
    };

    this.ws.onclose = (event) => {
      console.log('[WebSocket] Disconnected', event.code, event.reason);
      this.emit('connection', { status: 'disconnected', code: event.code });
      
      // Attempt reconnection if enabled and not a clean close
      if (this.config.reconnect && event.code !== 1000 && this.reconnectAttempts < this.maxRetries) {
        this.reconnect();
      }
    };
  }

  private reconnect() {
    this.reconnectAttempts++;
    
    // Exponential backoff: 1s, 2s, 4s, 8s, 16s
    const delay = this.retryDelay * Math.pow(2, this.reconnectAttempts - 1);
    
    console.log(
      `[WebSocket] Reconnecting in ${delay}ms (attempt ${this.reconnectAttempts}/${this.maxRetries})`
    );
    
    this.emit('connection', {
      status: 'connecting',
      attempt: this.reconnectAttempts,
      maxRetries: this.maxRetries,
    });

    this.reconnectTimeout = setTimeout(() => {
      this.connect();
    }, delay);
  }

  /**
   * Subscribe to a specific event type
   * @param event Event name to listen for
   * @param callback Function to call when event is emitted
   * @returns Unsubscribe function
   */
  on(event: string, callback: (data: any) => void) {
    if (!this.listeners.has(event)) {
      this.listeners.set(event, new Set());
    }
    this.listeners.get(event)!.add(callback);

    // Return unsubscribe function
    return () => this.off(event, callback);
  }

  /**
   * Unsubscribe from an event
   */
  off(event: string, callback: (data: any) => void) {
    this.listeners.get(event)?.delete(callback);
  }

  /**
   * Emit an event to all subscribers
   */
  private emit(event: string, data: any) {
    this.listeners.get(event)?.forEach((callback) => {
      try {
        callback(data);
      } catch (error) {
        console.error(`[WebSocket] Error in ${event} listener:`, error);
      }
    });
  }

  /**
   * Send a message through the WebSocket
   */
  send(message: any) {
    if (this.ws?.readyState === WebSocket.OPEN) {
      this.ws.send(JSON.stringify(message));
    } else {
      console.warn('[WebSocket] Cannot send, not connected');
      throw new Error('WebSocket not connected');
    }
  }

  /**
   * Close the WebSocket connection
   */
  disconnect() {
    if (this.reconnectTimeout) {
      clearTimeout(this.reconnectTimeout);
      this.reconnectTimeout = null;
    }

    if (this.ws) {
      this.ws.close(1000, 'Client disconnect'); // 1000 = normal closure
      this.ws = null;
    }

    this.listeners.clear();
  }

  /**
   * Get current connection state
   */
  getStatus(): ConnectionStatus {
    if (!this.ws) return 'disconnected';
    
    switch (this.ws.readyState) {
      case WebSocket.CONNECTING:
        return 'connecting';
      case WebSocket.OPEN:
        return 'connected';
      case WebSocket.CLOSING:
      case WebSocket.CLOSED:
        return 'disconnected';
      default:
        return 'disconnected';
    }
  }
}
