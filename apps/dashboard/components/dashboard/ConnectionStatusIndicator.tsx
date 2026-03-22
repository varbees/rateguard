/**
 * Connection Status Indicator Component
 * 
 * Displays the current WebSocket connection status with appropriate
 * visual feedback and accessibility attributes.
 */

'use client';

import { Wifi, WifiOff, Loader2 } from 'lucide-react';
import { ConnectionStatus } from '@/lib/websocket/connection-manager';
import { cn } from '@/lib/utils';

interface ConnectionStatusIndicatorProps {
  status: ConnectionStatus;
  className?: string;
  showLabel?: boolean;
}

export function ConnectionStatusIndicator({
  status,
  className,
  showLabel = true,
}: ConnectionStatusIndicatorProps) {
  const getStatusConfig = () => {
    switch (status) {
      case 'connected':
        return {
          icon: Wifi,
          label: 'Live',
          color: 'text-green-600',
          bgColor: 'bg-green-500/10',
          dotColor: 'bg-green-500',
        };
      case 'connecting':
        return {
          icon: Loader2,
          label: 'Connecting...',
          color: 'text-yellow-600',
          bgColor: 'bg-yellow-500/10',
          dotColor: 'bg-yellow-500',
          animate: 'animate-spin',
        };
      case 'disconnected':
      case 'error':
        return {
          icon: WifiOff,
          label: 'Disconnected',
          color: 'text-red-600',
          bgColor: 'bg-red-500/10',
          dotColor: 'bg-red-500',
        };
    }
  };

  const config = getStatusConfig();
  const Icon = config.icon;

  return (
    <div 
      className={cn(
        'flex items-center gap-1.5 text-xs font-medium',
        config.color,
        className
      )}
      role="status"
      aria-live="polite"
      aria-label={`Connection status: ${config.label}`}
    >
      <div className={cn(
        'flex items-center justify-center',
        config.animate
      )}>
        <Icon className="h-3 w-3" aria-hidden="true" />
      </div>
      {showLabel && <span>{config.label}</span>}
      {status === 'connected' && (
        <div 
          className={cn('w-1.5 h-1.5 rounded-full', config.dotColor)}
          aria-hidden="true"
        />
      )}
    </div>
  );
}
