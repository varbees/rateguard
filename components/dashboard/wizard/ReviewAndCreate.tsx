
'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { CheckCircle2, AlertCircle, Copy, ArrowRight } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { CreateAPIState } from './types';
import { useCreateAPI } from '@/lib/hooks/use-api';
import { toast } from 'sonner';
import confetti from 'canvas-confetti';
import Link from 'next/link';

interface ReviewAndCreateProps {
  state: CreateAPIState;
  onBack: () => void;
  goToStep: (step: number) => void;
}

export function ReviewAndCreate({ state, onBack, goToStep }: ReviewAndCreateProps) {
  const router = useRouter();
  const { mutateAsync: createAPI } = useCreateAPI();
  const [creating, setCreating] = useState(false);
  const [createError, setCreateError] = useState<string | null>(null);
  const [successData, setSuccessData] = useState<any | null>(null);
  const [showSuccessModal, setShowSuccessModal] = useState(false);

  const handleCreate = async () => {
    setCreating(true);
    setCreateError(null);

    try {
      // Prepare data for API
      const apiData = {
        name: state.name,
        target_url: state.target_url,
        rate_limit_per_second: state.rate_limit_per_second,
        burst_size: state.burst_size,
        rate_limit_per_hour: state.rate_limit_per_hour || 0,
        rate_limit_per_day: state.rate_limit_per_day || 0,
        rate_limit_per_month: state.rate_limit_per_month || 0,
        allowed_origins: state.allowed_origins.filter(o => o.trim() !== ''),
        custom_headers: state.custom_headers,
        auth_type: state.auth_type,
        auth_credentials: state.api_key ? { api_key: state.api_key } : undefined,
        enabled: true,
        provider: state.provider,
        timeout_seconds: 30,
        retry_attempts: 3,
      };

      const newAPI = await createAPI(apiData);
      
      setSuccessData(newAPI);
      setShowSuccessModal(true);
      confetti({
        particleCount: 100,
        spread: 70,
        origin: { y: 0.6 }
      });
      
    } catch (err: any) {
      console.error('Failed to create API:', err);
      setCreateError(err.message || 'Failed to create API. Please try again.');
    } finally {
      setCreating(false);
    }
  };

  const copyToClipboard = (text: string) => {
    navigator.clipboard.writeText(text);
    toast.success('Copied to clipboard');
  };

  return (
    <div className="space-y-6 max-w-2xl mx-auto animate-in fade-in slide-in-from-bottom-4 duration-500">
      <div className="text-center mb-8">
        <h2 className="text-2xl font-bold mb-2">Review Configuration</h2>
        <p className="text-muted-foreground">
          Review your settings before creating the API proxy.
        </p>
      </div>

      <Card>
        <CardContent className="pt-6 space-y-6">
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-6">
            <div>
              <p className="text-sm text-muted-foreground mb-1">Project Name</p>
              <p className="font-medium">{state.name}</p>
            </div>
            <div>
              <p className="text-sm text-muted-foreground mb-1">Provider</p>
              <p className="font-medium capitalize">{state.provider}</p>
            </div>
            <div className="sm:col-span-2">
              <p className="text-sm text-muted-foreground mb-1">Target URL</p>
              <p className="font-mono text-sm bg-muted p-2 rounded break-all">{state.target_url}</p>
            </div>
            <div>
              <p className="text-sm text-muted-foreground mb-1">Rate Limit</p>
              <p className="font-medium">{state.rate_limit_per_second} req/s</p>
            </div>
            <div>
              <p className="text-sm text-muted-foreground mb-1">Burst Size</p>
              <p className="font-medium">{state.burst_size} requests</p>
            </div>
            {state.allowed_origins.length > 0 && (
              <div className="sm:col-span-2">
                <p className="text-sm text-muted-foreground mb-1">Allowed Origins</p>
                <div className="flex flex-wrap gap-2">
                  {state.allowed_origins.map((origin, i) => (
                    <span key={i} className="text-xs bg-muted px-2 py-1 rounded border">
                      {origin}
                    </span>
                  ))}
                </div>
              </div>
            )}
          </div>

          <div className="flex gap-2 pt-4 border-t">
            <Button variant="outline" size="sm" onClick={() => goToStep(1)}>
              Edit Provider
            </Button>
            <Button variant="outline" size="sm" onClick={() => goToStep(2)}>
              Edit Config
            </Button>
            <Button variant="outline" size="sm" onClick={() => goToStep(3)}>
              Edit Limits
            </Button>
          </div>
        </CardContent>
      </Card>

      {createError && (
        <Alert variant="destructive">
          <AlertCircle className="h-4 w-4" />
          <AlertTitle>Creation Failed</AlertTitle>
          <AlertDescription>{createError}</AlertDescription>
        </Alert>
      )}

      <div className="flex justify-between pt-4">
        <Button variant="ghost" onClick={onBack} disabled={creating}>
          Back
        </Button>
        <Button size="lg" onClick={handleCreate} disabled={creating} className="gap-2">
          {creating ? (
            <>
              <div className="w-4 h-4 border-2 border-current border-t-transparent rounded-full animate-spin" />
              Creating...
            </>
          ) : (
            <>
              Create API Proxy
              <ArrowRight className="w-4 h-4" />
            </>
          )}
        </Button>
      </div>

      {/* Success Modal */}
      <Dialog open={showSuccessModal} onOpenChange={setShowSuccessModal}>
        <DialogContent className="sm:max-w-xl">
          <DialogHeader>
            <div className="flex items-center gap-3">
              <div className="w-12 h-12 rounded-full bg-green-100 dark:bg-green-900/20 flex items-center justify-center">
                <CheckCircle2 className="w-6 h-6 text-green-600" />
              </div>
              <div>
                <DialogTitle className="text-2xl">API Proxy Created!</DialogTitle>
                <p className="text-muted-foreground">
                  {successData?.name} is ready to use
                </p>
              </div>
            </div>
          </DialogHeader>

          <div className="space-y-4 py-4">
            <div>
              <Label>Your Proxy URL</Label>
              <div className="flex gap-2 mt-1">
                <Input
                  readOnly
                  value={successData?.proxy_url || 'https://api.rateguard.io/proxy/...'}
                  className="font-mono text-sm"
                />
                <Button
                  size="icon"
                  variant="outline"
                  onClick={() => copyToClipboard(successData?.proxy_url)}
                >
                  <Copy className="h-4 w-4" />
                </Button>
              </div>
              <p className="text-xs text-muted-foreground mt-1">
                Use this URL instead of the original API endpoint
              </p>
            </div>

            <div className="p-4 bg-muted rounded-lg">
              <p className="font-medium mb-2 text-sm">Quick Start:</p>
              <pre className="text-xs overflow-x-auto p-2 bg-black/5 dark:bg-white/5 rounded">
{`curl ${successData?.proxy_url || 'URL'}/chat/completions \\
  -H "Authorization: Bearer YOUR_KEY" \\
  -H "Content-Type: application/json" \\
  -d '{"model": "gpt-4", "messages": [...]}'`}
              </pre>
            </div>
          </div>

          <DialogFooter>
            <Button variant="outline" onClick={() => router.push('/dashboard/apis')}>
              Close
            </Button>
            <Button asChild>
              <Link href={`/dashboard/apis/${successData?.id}`}>
                View Dashboard
              </Link>
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
