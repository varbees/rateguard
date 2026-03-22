'use client';

import { useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import {
  Key,
  Plus,
  Copy,
  Check,
  Trash2,
  RefreshCw,
  Clock,
} from 'lucide-react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from '@/components/ui/dialog';
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from '@/components/ui/alert-dialog';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { apiClient, type APIKey as APIKeyRecord, type CreateAPIKeyResponse } from '@/lib/api';
import { toast } from 'sonner';

interface APIKeysManagementProps {
  apiId?: string;
  onRegenerate?: (keyId: string) => Promise<void>;
}

function formatDate(dateString: string) {
  const date = new Date(dateString);
  if (Number.isNaN(date.getTime())) {
    return 'Unknown';
  }

  const now = new Date();
  const diff = now.getTime() - date.getTime();

  if (diff < 3600000) return `${Math.floor(diff / 60000)}m ago`;
  if (diff < 86400000) return `${Math.floor(diff / 3600000)}h ago`;
  if (diff < 2592000000) return `${Math.floor(diff / 86400000)}d ago`;
  return date.toLocaleDateString();
}

export function APIKeysManagement({ apiId, onRegenerate }: APIKeysManagementProps) {
  const queryClient = useQueryClient();
  const [newKeyName, setNewKeyName] = useState('');
  const [generateDialogOpen, setGenerateDialogOpen] = useState(false);
  const [createdKey, setCreatedKey] = useState<CreateAPIKeyResponse | null>(null);
  const [copied, setCopied] = useState(false);

  const {
    data: apiKeysResponse,
    isLoading,
    error,
  } = useQuery({
    queryKey: ['api-keys'],
    queryFn: () => apiClient.listAPIKeys(),
    staleTime: 30_000,
    refetchOnWindowFocus: false,
  });

  const createMutation = useMutation({
    mutationFn: (keyName: string) => apiClient.createAPIKey(keyName),
    onSuccess: (data) => {
      setCreatedKey(data);
      setGenerateDialogOpen(false);
      setNewKeyName('');
      queryClient.invalidateQueries({ queryKey: ['api-keys'] });
      toast.success('API key generated successfully');
    },
    onError: () => {
      toast.error('Failed to generate API key');
    },
  });

  const revokeMutation = useMutation({
    mutationFn: (keyId: string) => apiClient.revokeAPIKey(keyId),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['api-keys'] });
      toast.success('API key revoked');
    },
    onError: () => {
      toast.error('Failed to revoke API key');
    },
  });

  const apiKeys = apiKeysResponse?.api_keys ?? [];

  const handleGenerate = async () => {
    const trimmedName = newKeyName.trim();
    if (trimmedName.length < 3) {
      toast.error('Key name must be at least 3 characters');
      return;
    }

    createMutation.mutate(trimmedName);
  };

  const handleCopyCreatedKey = async () => {
    if (!createdKey?.api_key) return;

    try {
      await navigator.clipboard.writeText(createdKey.api_key);
      setCopied(true);
      toast.success('API key copied to clipboard');
      window.setTimeout(() => setCopied(false), 2000);
    } catch {
      toast.error('Failed to copy key');
    }
  };

  const handleRegenerate = async (keyId: string) => {
    if (!onRegenerate) return;

    try {
      await onRegenerate(keyId);
      toast.success('API key regenerated');
    } catch {
      toast.error('Failed to regenerate API key');
    }
  };

  return (
    <>
      <Card>
        <CardHeader>
          <div className="flex items-center justify-between gap-4">
            <div>
              <CardTitle className="flex items-center gap-2">
                <Key className="h-5 w-5" />
                API Keys
              </CardTitle>
              <CardDescription>
                {apiId
                  ? 'Workspace API keys that can be used with this API.'
                  : 'Manage workspace authentication keys and rotate credentials without downtime.'}
              </CardDescription>
            </div>
            <Dialog open={generateDialogOpen} onOpenChange={setGenerateDialogOpen}>
              <DialogTrigger asChild>
                <Button className="gap-2">
                  <Plus className="h-4 w-4" />
                  Generate Key
                </Button>
              </DialogTrigger>
              <DialogContent>
                <DialogHeader>
                  <DialogTitle>Generate New API Key</DialogTitle>
                  <DialogDescription>
                    Create a new authentication key. The full value will only be shown once.
                  </DialogDescription>
                </DialogHeader>
                <div className="space-y-4 py-4">
                  <div className="space-y-2">
                    <Label htmlFor="keyName">Key Name</Label>
                    <Input
                      id="keyName"
                      placeholder="e.g. Production Server"
                      value={newKeyName}
                      onChange={(e) => setNewKeyName(e.target.value)}
                      onKeyDown={(e) => e.key === 'Enter' && handleGenerate()}
                    />
                    <p className="text-xs text-muted-foreground">
                      Use a descriptive label so you can identify the key later.
                    </p>
                  </div>
                </div>
                <DialogFooter>
                  <Button
                    variant="outline"
                    onClick={() => setGenerateDialogOpen(false)}
                  >
                    Cancel
                  </Button>
                  <Button
                    onClick={handleGenerate}
                    disabled={createMutation.isPending || newKeyName.trim().length < 3}
                  >
                    {createMutation.isPending ? 'Generating...' : 'Generate Key'}
                  </Button>
                </DialogFooter>
              </DialogContent>
            </Dialog>
          </div>
        </CardHeader>
        <CardContent>
          {error ? (
            <div className="rounded-lg border border-destructive/20 bg-destructive/5 p-4 text-sm text-destructive">
              Failed to load API keys. Try refreshing the page.
            </div>
          ) : isLoading ? (
            <div className="text-center py-8 text-muted-foreground">
              Loading API keys...
            </div>
          ) : apiKeys.length > 0 ? (
            <div className="space-y-3">
              {apiKeys.map((key: APIKeyRecord) => (
                <div key={key.id} className="p-4 border rounded-lg space-y-3">
                  <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
                    <div className="space-y-1">
                      <div className="flex items-center gap-2">
                        <span className="font-semibold">{key.key_name}</span>
                        {key.is_active ? (
                          <Badge className="bg-green-500/10 text-green-600 border-green-500/20 hover:bg-green-500/20">
                            Active
                          </Badge>
                        ) : (
                          <Badge variant="secondary">Revoked</Badge>
                        )}
                      </div>
                      <div className="flex flex-wrap items-center gap-2 text-xs text-muted-foreground">
                        <code className="font-mono rounded border border-border bg-muted px-2 py-1">
                          {key.masked_key}
                        </code>
                        <span>Created {formatDate(key.created_at)}</span>
                        {key.last_used_at && (
                          <span className="flex items-center gap-1">
                            <Clock className="h-3 w-3" />
                            Last used {formatDate(key.last_used_at)}
                          </span>
                        )}
                        {key.revoked_at && (
                          <span className="text-destructive">
                            Revoked {formatDate(key.revoked_at)}
                          </span>
                        )}
                      </div>
                    </div>

                    <div className="flex items-center gap-2">
                      {onRegenerate && key.is_active && (
                        <AlertDialog>
                          <AlertDialogTrigger asChild>
                            <Button variant="ghost" size="sm" className="gap-2">
                              <RefreshCw className="h-4 w-4" />
                              Rotate
                            </Button>
                          </AlertDialogTrigger>
                          <AlertDialogContent>
                            <AlertDialogHeader>
                              <AlertDialogTitle>Rotate API Key?</AlertDialogTitle>
                              <AlertDialogDescription>
                                This will create a replacement key through the provided handler and invalidate the old one.
                              </AlertDialogDescription>
                            </AlertDialogHeader>
                            <AlertDialogFooter>
                              <AlertDialogCancel>Cancel</AlertDialogCancel>
                              <AlertDialogAction onClick={() => handleRegenerate(key.id)}>
                                Rotate
                              </AlertDialogAction>
                            </AlertDialogFooter>
                          </AlertDialogContent>
                        </AlertDialog>
                      )}

                      {key.is_active && (
                        <AlertDialog>
                          <AlertDialogTrigger asChild>
                            <Button
                              variant="ghost"
                              size="sm"
                              className="gap-2 text-destructive hover:text-destructive"
                            >
                              <Trash2 className="h-4 w-4" />
                              Revoke
                            </Button>
                          </AlertDialogTrigger>
                          <AlertDialogContent>
                            <AlertDialogHeader>
                              <AlertDialogTitle>Revoke API Key?</AlertDialogTitle>
                              <AlertDialogDescription>
                                This action cannot be undone. The key will be permanently revoked and any applications using it will lose access.
                              </AlertDialogDescription>
                            </AlertDialogHeader>
                            <AlertDialogFooter>
                              <AlertDialogCancel>Cancel</AlertDialogCancel>
                              <AlertDialogAction
                                onClick={() => revokeMutation.mutate(key.id)}
                                className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
                              >
                                Revoke
                              </AlertDialogAction>
                            </AlertDialogFooter>
                          </AlertDialogContent>
                        </AlertDialog>
                      )}
                    </div>
                  </div>
                </div>
              ))}
            </div>
          ) : (
            <div className="text-center py-8 text-muted-foreground">
              <Key className="h-12 w-12 mx-auto mb-2 opacity-50" />
              <p>No API keys yet</p>
              <p className="text-xs mt-1">Generate your first key to get started</p>
            </div>
          )}
        </CardContent>
      </Card>

      <Dialog open={!!createdKey} onOpenChange={(open) => !open && setCreatedKey(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <Check className="h-5 w-5 text-green-600" />
              API Key Generated
            </DialogTitle>
            <DialogDescription>
              Save this key securely. You will not be able to see it again.
            </DialogDescription>
          </DialogHeader>
          {createdKey && (
            <div className="space-y-4">
              <div className="space-y-2">
                <Label>Key Name</Label>
                <Input value={createdKey.key_name} readOnly className="font-semibold bg-accent" />
              </div>

              <div className="space-y-2">
                <Label>API Key</Label>
                <div className="flex gap-2">
                  <Input
                    value={createdKey.api_key}
                    readOnly
                    className="font-mono text-xs bg-accent"
                  />
                  <Button onClick={handleCopyCreatedKey} className="flex-shrink-0">
                    <Copy className="w-4 h-4 mr-2" />
                    {copied ? 'Copied' : 'Copy'}
                  </Button>
                </div>
              </div>
            </div>
          )}
          <DialogFooter>
            <Button onClick={() => setCreatedKey(null)}>
              I&apos;ve Saved the Key
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}
