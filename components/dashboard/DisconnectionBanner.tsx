/**
 * WebSocket Disconnection Banner
 * 
 * Alert banner shown when WebSocket connection is lost,
 * with reconnection status and manual retry option.
 */

'use client';

import { Alert, AlertTitle, AlertDescription } from '@/components/ui/alert';
import { Button } from '@/components/ui/button';
import { WifiOff, RefreshCw } from 'lucide-react';
import { formatDistanceToNow } from 'date-fns';

interface DisconnectionBannerProps {
  lastUpdate: Date;
  onRetry?: () => void;
  isRetrying?: boolean;
}

export function DisconnectionBanner({
  lastUpdate,
  onRetry,
  isRetrying = false,
}: DisconnectionBannerProps) {
  return (
    <Alert variant="destructive" className="mb-4">
      <WifiOff className="h-4 w-4" />
      <AlertTitle>Live data unavailable</AlertTitle>
      <AlertDescription className="flex items-center justify-between gap-4">
        <span>
          Attempting to reconnect... Last update:{' '}
          {formatDistanceToNow(lastUpdate, { addSuffix: true })}
        </span>
        {onRetry && (
          <Button
            variant="outline"
            size="sm"
            onClick={onRetry}
            disabled={isRetrying}
          >
            {isRetrying ? (
              <>
                <RefreshCw className="mr-2 h-3 w-3 animate-spin" />
                Connecting...
              </>
            ) : (
              <>
                <RefreshCw className="mr-2 h-3 w-3" />
                Retry Now
              </>
            )}
          </Button>
        )}
      </AlertDescription>
    </Alert>
  );
}
