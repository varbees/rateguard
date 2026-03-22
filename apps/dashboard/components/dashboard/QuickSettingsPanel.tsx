'use client';

import { useState } from 'react';
import { Pause, Play, Settings, Loader2 } from 'lucide-react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Switch } from '@/components/ui/switch';
import { Label } from '@/components/ui/label';
import { Badge } from '@/components/ui/badge';
import { useRouter } from 'next/navigation';
import { APIConfig } from '@/lib/api';

interface QuickSettingsPanelProps {
  api: APIConfig;
  onToggle?: (enabled: boolean) => Promise<void>;
}

export function QuickSettingsPanel({ api, onToggle }: QuickSettingsPanelProps) {
  const router = useRouter();
  const [isToggling, setIsToggling] = useState(false);

  const handleToggle = async () => {
    if (!onToggle) return;
    
    setIsToggling(true);
    try {
      await onToggle(!api.enabled);
    } finally {
      setIsToggling(false);
    }
  };

  return (
    <Card>
      <CardHeader>
        <div className="flex items-center justify-between">
          <div>
            <CardTitle>Quick Settings</CardTitle>
            <CardDescription>Manage API status and configuration</CardDescription>
          </div>
          <Button
            variant="outline"
            size="sm"
            onClick={() => router.push(`/dashboard/apis/${api.id}/edit`)}
            className="gap-2"
          >
            <Settings className="h-4 w-4" />
            Advanced Settings
          </Button>
        </div>
      </CardHeader>
      <CardContent className="space-y-6">
        {/* Enable/Disable Toggle */}
        <div className="flex items-center justify-between p-4 border rounded-lg">
          <div className="space-y-0.5">
            <div className="flex items-center gap-2">
              <Label htmlFor="api-enabled" className="text-base font-medium cursor-pointer">
                API Status
              </Label>
              <Badge variant={api.enabled ? "default" : "secondary"}>
                {api.enabled ? "Enabled" : "Disabled"}
              </Badge>
            </div>
            <p className="text-sm text-muted-foreground">
              {api.enabled 
                ? "API is currently accepting requests" 
                : "API is paused and rejecting all requests"}
            </p>
          </div>
          <div className="flex items-center gap-2">
            {isToggling && <Loader2 className="h-4 w-4 animate-spin text-muted-foreground" />}
            <Switch
              id="api-enabled"
              checked={api.enabled}
              onCheckedChange={handleToggle}
              disabled={isToggling || !onToggle}
            />
          </div>
        </div>

        {/* Rate Limits Summary */}
        <div className="space-y-3">
          <h4 className="text-sm font-medium">Current Rate Limits</h4>
          <div className="grid grid-cols-2 gap-3">
            <div className="p-3 bg-muted rounded-lg">
              <p className="text-xs text-muted-foreground mb-1">Per Second</p>
              <p className="text-lg font-semibold">{api.rate_limit_per_second}</p>
            </div>
            <div className="p-3 bg-muted rounded-lg">
              <p className="text-xs text-muted-foreground mb-1">Burst Size</p>
              <p className="text-lg font-semibold">{api.burst_size}</p>
            </div>
            {api.rate_limit_per_hour > 0 && (
              <div className="p-3 bg-muted rounded-lg">
                <p className="text-xs text-muted-foreground mb-1">Per Hour</p>
                <p className="text-lg font-semibold">{api.rate_limit_per_hour}</p>
              </div>
            )}
            {api.rate_limit_per_day > 0 && (
              <div className="p-3 bg-muted rounded-lg">
                <p className="text-xs text-muted-foreground mb-1">Per Day</p>
                <p className="text-lg font-semibold">{api.rate_limit_per_day}</p>
              </div>
            )}
          </div>
          <Button
            variant="outline"
            size="sm"
            onClick={() => router.push(`/dashboard/apis/${api.id}/edit#rate-limits`)}
            className="w-full"
          >
            Modify Rate Limits
          </Button>
        </div>

        {/* Additional Info */}
        <div className="space-y-2 text-sm">
          <div className="flex justify-between">
            <span className="text-muted-foreground">Timeout</span>
            <span className="font-medium">{api.timeout_seconds}s</span>
          </div>
          <div className="flex justify-between">
            <span className="text-muted-foreground">Retry Attempts</span>
            <span className="font-medium">{api.retry_attempts}</span>
          </div>
          <div className="flex justify-between">
            <span className="text-muted-foreground">Created</span>
            <span className="font-medium">
              {new Date(api.created_at).toLocaleDateString()}
            </span>
          </div>
        </div>
      </CardContent>
    </Card>
  );
}
