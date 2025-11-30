
'use client';

import { useState } from 'react';
import { ChevronDown, Lock, Sparkles } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Slider } from '@/components/ui/slider';
import { Alert, AlertDescription } from '@/components/ui/alert';
import {
  Collapsible,
  CollapsibleContent,
  CollapsibleTrigger,
} from '@/components/ui/collapsible';
import { CreateAPIState } from './types';
import { useUser } from '@/lib/hooks/use-user';
import Link from 'next/link';

interface RateLimitSetupProps {
  state: CreateAPIState;
  updateState: (updates: Partial<CreateAPIState>) => void;
  onNext: () => void;
  onBack: () => void;
}

export function RateLimitSetup({ state, updateState, onNext, onBack }: RateLimitSetupProps) {
  const { hasAccess, user } = useUser();
  const isPro = hasAccess('pro');
  const [isOpen, setIsOpen] = useState(false);

  // Plan limits
  const maxPerSecond = isPro ? 100 : 10;
  const planName = user?.plan === 'free' ? 'Free' : user?.plan === 'pro' ? 'Pro' : 'Enterprise';

  return (
    <div className="space-y-6 max-w-2xl mx-auto animate-in fade-in slide-in-from-bottom-4 duration-500">
      <div className="text-center mb-8">
        <h2 className="text-2xl font-bold mb-2">Set Rate Limits</h2>
        <p className="text-muted-foreground">
          Control how many requests can be made to your API to prevent abuse.
        </p>
      </div>

      {/* Per-Second Limit */}
      <div className="space-y-4">
        <div className="flex justify-between">
          <Label>Requests per second</Label>
          <span className="text-sm text-muted-foreground">{state.rate_limit_per_second} req/s</span>
        </div>
        <div className="flex items-center gap-4">
          <Slider
            value={[state.rate_limit_per_second]}
            onValueChange={([value]) => updateState({ rate_limit_per_second: value })}
            max={maxPerSecond}
            min={1}
            step={1}
            className="flex-1"
          />
          <Input
            type="number"
            value={state.rate_limit_per_second}
            onChange={(e) => updateState({ rate_limit_per_second: Number(e.target.value) })}
            className="w-20"
            min={1}
            max={maxPerSecond}
          />
        </div>
        <p className="text-xs text-muted-foreground">
          Your {planName} plan allows up to {maxPerSecond} req/s.
        </p>
      </div>

      {/* Burst Size */}
      <div className="space-y-4">
        <div className="flex justify-between">
          <Label>Burst size</Label>
          <span className="text-sm text-muted-foreground">{state.burst_size} requests</span>
        </div>
        <div className="flex items-center gap-4">
          <Slider
            value={[state.burst_size]}
            onValueChange={([value]) => updateState({ burst_size: value })}
            max={state.rate_limit_per_second * 10}
            min={state.rate_limit_per_second}
            step={1}
            className="flex-1"
          />
          <Input
            type="number"
            value={state.burst_size}
            onChange={(e) => updateState({ burst_size: Number(e.target.value) })}
            className="w-20"
          />
        </div>
        <p className="text-xs text-muted-foreground">
          Allows brief spikes above the rate limit. Recommended: {state.rate_limit_per_second * 2}.
        </p>
      </div>

      {/* Advanced Limits (Pro+) */}
      <Collapsible open={isOpen} onOpenChange={setIsOpen} className="border rounded-lg p-4">
        <CollapsibleTrigger asChild>
          <Button variant="ghost" className="flex w-full justify-between p-0 h-auto font-normal hover:bg-transparent">
            <span className="flex items-center gap-2 font-medium">
              Advanced Limits (Hourly, Daily, Monthly)
              {!isPro && <Lock className="h-3 w-3 text-muted-foreground" />}
            </span>
            <ChevronDown className={`h-4 w-4 transition-transform ${isOpen ? 'rotate-180' : ''}`} />
          </Button>
        </CollapsibleTrigger>
        <CollapsibleContent>
          {isPro ? (
            <div className="space-y-4 pt-4 mt-2 border-t">
              <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
                <div className="space-y-2">
                  <Label htmlFor="hourly">Per Hour</Label>
                  <Input
                    id="hourly"
                    type="number"
                    placeholder="Unlimited"
                    value={state.rate_limit_per_hour || ''}
                    onChange={(e) => updateState({ rate_limit_per_hour: e.target.value ? Number(e.target.value) : undefined })}
                  />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="daily">Per Day</Label>
                  <Input
                    id="daily"
                    type="number"
                    placeholder="Unlimited"
                    value={state.rate_limit_per_day || ''}
                    onChange={(e) => updateState({ rate_limit_per_day: e.target.value ? Number(e.target.value) : undefined })}
                  />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="monthly">Per Month</Label>
                  <Input
                    id="monthly"
                    type="number"
                    placeholder="Unlimited"
                    value={state.rate_limit_per_month || ''}
                    onChange={(e) => updateState({ rate_limit_per_month: e.target.value ? Number(e.target.value) : undefined })}
                  />
                </div>
              </div>
            </div>
          ) : (
            <Alert variant="default" className="mt-4 bg-muted/50">
              <Sparkles className="h-4 w-4 text-primary" />
              <AlertDescription>
                <strong>Pro Feature:</strong> Set hourly, daily, and monthly limits to control costs and usage.
                <Link href="/dashboard/billing" className="underline ml-1 text-primary">
                  Upgrade to Pro
                </Link>
              </AlertDescription>
            </Alert>
          )}
        </CollapsibleContent>
      </Collapsible>

      {/* Preview */}
      <div className="p-4 bg-muted/50 rounded-lg border">
        <p className="text-sm font-medium mb-2">Configuration Preview:</p>
        <ul className="text-sm space-y-1 text-muted-foreground">
          <li>✓ Up to {state.rate_limit_per_second} requests per second</li>
          <li>✓ Bursts up to {state.burst_size} requests allowed</li>
          {state.rate_limit_per_hour && <li>✓ Max {state.rate_limit_per_hour} requests per hour</li>}
          {state.rate_limit_per_day && <li>✓ Max {state.rate_limit_per_day} requests per day</li>}
        </ul>
      </div>

      <div className="flex justify-between pt-8 border-t mt-8">
        <Button variant="ghost" onClick={onBack}>
          Back
        </Button>
        <Button onClick={onNext}>
          Next Step
        </Button>
      </div>
    </div>
  );
}
