'use client';

import { useState } from 'react';
import { useWebSocket } from '@/lib/websocket/context';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import axios from 'axios';

const API_URL = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:3001';

export function WebSocketDebug() {
  const { connectionStatus, lastMessage } = useWebSocket();
  const [testResult, setTestResult] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(false);

  const handleTestBroadcast = async () => {
    setIsLoading(true);
    setTestResult(null);

    try {
      const token = localStorage.getItem('auth_token');
      const response = await axios.post(
        `${API_URL}/api/v1/test/broadcast`,
        {
          message: `Test message from frontend at ${new Date().toLocaleTimeString()}`,
          global: false, // Only send to current user
        },
        {
          headers: {
            Authorization: `Bearer ${token}`,
          },
        }
      );

      setTestResult(`Success: ${response.data.message}`);
    } catch (error: any) {
      setTestResult(`Error: ${error.response?.data?.error || error.message}`);
    } finally {
      setIsLoading(false);
    }
  };

  const getStatusColor = () => {
    switch (connectionStatus) {
      case 'connected':
        return 'bg-green-500';
      case 'connecting':
        return 'bg-yellow-500';
      case 'error':
        return 'bg-red-500';
      default:
        return 'bg-gray-500';
    }
  };

  return (
    <Card className="p-6 space-y-4">
      <div className="flex items-center justify-between">
        <h3 className="text-lg font-semibold">WebSocket Debug (Phase 1)</h3>
        <Badge className={getStatusColor()}>
          {connectionStatus.toUpperCase()}
        </Badge>
      </div>

      <div className="space-y-2">
        <p className="text-sm text-muted-foreground">
          Status: <span className="font-mono">{connectionStatus}</span>
        </p>

        <div>
          <p className="text-sm font-medium mb-1">Last Message:</p>
          {lastMessage ? (
            <pre className="text-xs bg-muted p-2 rounded overflow-auto max-h-32">
              {JSON.stringify(lastMessage, null, 2)}
            </pre>
          ) : (
            <p className="text-sm text-muted-foreground italic">No messages received yet</p>
          )}
        </div>

        <div className="pt-2">
          <Button 
            onClick={handleTestBroadcast}
            disabled={isLoading || connectionStatus !== 'connected'}
            className="w-full"
          >
            {isLoading ? 'Sending...' : 'Send Test Broadcast'}
          </Button>

          {testResult && (
            <p className="text-sm mt-2 p-2 rounded bg-muted">
              {testResult}
            </p>
          )}
        </div>

        <div className="text-xs text-muted-foreground pt-2 border-t">
          <p>📡 WebSocket URL: /ws?token=***</p>
          <p>🔔 Listening for events: test.message, metrics.update, alert.triggered</p>
        </div>
      </div>
    </Card>
  );
}
