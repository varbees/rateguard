
'use client';

import { useState } from 'react';
import { Plus, Trash2, AlertTriangle, Lock, Sparkles } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { CreateAPIState } from './types';
import { useUser } from '@/lib/hooks/use-user';
import Link from 'next/link';

interface AdvancedSettingsProps {
  state: CreateAPIState;
  updateState: (updates: Partial<CreateAPIState>) => void;
  onNext: () => void;
  onBack: () => void;
}

export function AdvancedSettings({ state, updateState, onNext, onBack }: AdvancedSettingsProps) {
  const { hasAccess } = useUser();
  const isPro = hasAccess('pro');
  const isEnterprise = hasAccess('enterprise');
  
  // CORS Management
  const addOrigin = () => {
    updateState({ allowed_origins: [...state.allowed_origins, ''] });
  };

  const updateOrigin = (index: number, value: string) => {
    const newOrigins = [...state.allowed_origins];
    newOrigins[index] = value;
    updateState({ allowed_origins: newOrigins });
  };

  const removeOrigin = (index: number) => {
    const newOrigins = [...state.allowed_origins];
    newOrigins.splice(index, 1);
    updateState({ allowed_origins: newOrigins });
  };

  // Headers Management
  const addHeader = () => {
    updateState({ custom_headers: { ...state.custom_headers, '': '' } });
  };

  const updateHeaderKey = (oldKey: string, newKey: string) => {
    const value = state.custom_headers[oldKey];
    const newHeaders = { ...state.custom_headers };
    delete newHeaders[oldKey];
    newHeaders[newKey] = value;
    updateState({ custom_headers: newHeaders });
  };

  const updateHeaderValue = (key: string, value: string) => {
    updateState({ custom_headers: { ...state.custom_headers, [key]: value } });
  };

  const removeHeader = (key: string) => {
    const newHeaders = { ...state.custom_headers };
    delete newHeaders[key];
    updateState({ custom_headers: newHeaders });
  };

  if (!isPro) {
    return (
      <div className="space-y-6 max-w-2xl mx-auto animate-in fade-in slide-in-from-bottom-4 duration-500">
        <div className="text-center mb-8">
          <h2 className="text-2xl font-bold mb-2">Advanced Settings</h2>
          <p className="text-muted-foreground">
            Configure CORS, Custom Headers, and Webhooks.
          </p>
        </div>

        <div className="p-8 border-2 border-dashed rounded-xl flex flex-col items-center justify-center text-center bg-muted/20">
          <div className="w-16 h-16 bg-primary/10 rounded-full flex items-center justify-center mb-4">
            <Lock className="w-8 h-8 text-primary" />
          </div>
          <h3 className="text-xl font-semibold mb-2">Pro Features Locked</h3>
          <p className="text-muted-foreground max-w-md mb-6">
            Upgrade to the Pro plan to access advanced security settings like CORS configuration, custom headers, and webhooks.
          </p>
          <Button asChild size="lg">
            <Link href="/dashboard/billing">Upgrade to Pro</Link>
          </Button>
        </div>

        <div className="flex justify-between pt-8 border-t mt-8">
          <Button variant="ghost" onClick={onBack}>
            Back
          </Button>
          <Button onClick={onNext}>
            Skip for Now
          </Button>
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-6 max-w-2xl mx-auto animate-in fade-in slide-in-from-bottom-4 duration-500">
      <div className="text-center mb-8">
        <h2 className="text-2xl font-bold mb-2">Advanced Settings</h2>
        <p className="text-muted-foreground">
          Fine-tune your API proxy security and behavior.
        </p>
      </div>

      <Tabs defaultValue="cors" className="w-full">
        <TabsList className="grid w-full grid-cols-3">
          <TabsTrigger value="cors">CORS</TabsTrigger>
          <TabsTrigger value="headers">Custom Headers</TabsTrigger>
          <TabsTrigger value="webhooks">Webhooks</TabsTrigger>
        </TabsList>

        {/* CORS Tab */}
        <TabsContent value="cors" className="space-y-4 mt-4">
          <div>
            <Label>Allowed Origins</Label>
            <p className="text-sm text-muted-foreground mb-3">
              Whitelist domains that can make requests to your proxy (e.g., https://myapp.com).
            </p>
          </div>

          <div className="space-y-2">
            {state.allowed_origins.map((origin, index) => (
              <div key={index} className="flex gap-2">
                <Input
                  value={origin}
                  onChange={(e) => updateOrigin(index, e.target.value)}
                  placeholder="https://example.com"
                  className="flex-1"
                />
                <Button
                  variant="ghost"
                  size="icon"
                  onClick={() => removeOrigin(index)}
                  className="text-muted-foreground hover:text-destructive"
                >
                  <Trash2 className="h-4 w-4" />
                </Button>
              </div>
            ))}
            
            {state.allowed_origins.length === 0 && (
              <div className="text-sm text-muted-foreground italic p-2 border border-dashed rounded text-center">
                No origins configured. All origins might be blocked depending on browser policy.
              </div>
            )}
          </div>

          <Button variant="outline" size="sm" onClick={addOrigin} className="gap-2">
            <Plus className="h-4 w-4" />
            Add Origin
          </Button>

          {state.allowed_origins.includes('*') && (
            <Alert variant="destructive" className="bg-yellow-50 dark:bg-yellow-900/10 border-yellow-200 dark:border-yellow-900/50 text-yellow-800 dark:text-yellow-200">
              <AlertTriangle className="h-4 w-4" />
              <AlertDescription>
                Using "*" allows requests from ANY origin. This is not recommended for production.
              </AlertDescription>
            </Alert>
          )}
        </TabsContent>

        {/* Headers Tab */}
        <TabsContent value="headers" className="space-y-4 mt-4">
          <div>
            <Label>Custom Headers</Label>
            <p className="text-sm text-muted-foreground mb-3">
              Add static headers to every request forwarded to your API.
            </p>
          </div>

          <div className="space-y-2">
            {Object.entries(state.custom_headers).map(([key, value], index) => (
              <div key={index} className="flex gap-2">
                <Input
                  value={key}
                  onChange={(e) => updateHeaderKey(key, e.target.value)}
                  placeholder="X-Custom-Header"
                  className="flex-1"
                />
                <Input
                  value={value}
                  onChange={(e) => updateHeaderValue(key, e.target.value)}
                  placeholder="Value"
                  className="flex-1"
                />
                <Button
                  variant="ghost"
                  size="icon"
                  onClick={() => removeHeader(key)}
                  className="text-muted-foreground hover:text-destructive"
                >
                  <Trash2 className="h-4 w-4" />
                </Button>
              </div>
            ))}

            {Object.keys(state.custom_headers).length === 0 && (
              <div className="text-sm text-muted-foreground italic p-2 border border-dashed rounded text-center">
                No custom headers configured.
              </div>
            )}
          </div>

          <Button variant="outline" size="sm" onClick={addHeader} className="gap-2">
            <Plus className="h-4 w-4" />
            Add Header
          </Button>
        </TabsContent>

        {/* Webhooks Tab (Enterprise) */}
        <TabsContent value="webhooks" className="space-y-4 mt-4">
          {isEnterprise ? (
            <div className="p-4 border rounded-lg bg-muted/50 text-center">
              <p>Webhook configuration is available in the API settings page after creation.</p>
            </div>
          ) : (
            <div className="p-6 border border-dashed rounded-lg flex flex-col items-center justify-center text-center bg-muted/20">
              <Sparkles className="w-8 h-8 mb-2 text-primary" />
              <h3 className="font-semibold mb-1">Enterprise Feature</h3>
              <p className="text-sm text-muted-foreground mb-4">
                Webhooks are available on the Enterprise plan.
              </p>
              <Button variant="outline" size="sm" asChild>
                <Link href="/contact">Contact Sales</Link>
              </Button>
            </div>
          )}
        </TabsContent>
      </Tabs>

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
