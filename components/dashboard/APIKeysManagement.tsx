'use client';

import { useState } from 'react';
import { Key, Plus, Copy, Check, Trash2, RefreshCw, Eye, EyeOff, Clock } from 'lucide-react';
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
import { toast } from 'sonner';

interface APIKey {
  id: string;
  name: string;
  key: string;
  prefix: string;
  createdAt: Date;
  lastUsed?: Date;
  expiresAt?: Date;
}

interface APIKeysManagementProps {
  apiId: string;
  keys?: APIKey[];
  onGenerate?: (name: string) => Promise<APIKey>;
  onRevoke?: (keyId: string) => Promise<void>;
  onRegenerate?: (keyId: string) => Promise<APIKey>;
}

export function APIKeysManagement({
  apiId,
  keys: initialKeys = [],
  onGenerate,
  onRevoke,
  onRegenerate,
}: APIKeysManagementProps) {
  const [keys, setKeys] = useState<APIKey[]>(initialKeys.length > 0 ? initialKeys : [
    {
      id: '1',
      name: 'Production Key',
      key: 'rg_sk_1234567890abcdef1234567890abcdef',
      prefix: 'rg_sk_1234...',
      createdAt: new Date(Date.now() - 86400000 * 30),
      lastUsed: new Date(Date.now() - 3600000),
    },
  ]);
  const [showKey, setShowKey] = useState<Record<string, boolean>>({});
  const [copied, setCopied] = useState<Record<string, boolean>>({});
  const [generatingKey, setGeneratingKey] = useState(false);
  const [newKeyName, setNewKeyName] = useState('');
  const [generateDialogOpen, setGenerateDialogOpen] = useState(false);
  const [newlyGenerated, setNewlyGenerated] = useState<APIKey | null>(null);

  const copyToClipboard = async (keyId: string, key: string) => {
    try {
      await navigator.clipboard.writeText(key);
      setCopied({ ...copied, [keyId]: true });
      toast.success('API key copied to clipboard');
      setTimeout(() => {
        setCopied({ ...copied, [keyId]: false });
      }, 2000);
    } catch {
      toast.error('Failed to copy key');
    }
  };

  const handleGenerate = async () => {
    if (!newKeyName || newKeyName.length < 3) {
      toast.error('Key name must be at least 3 characters');
      return;
    }

    setGeneratingKey(true);
    try {
      let newKey: APIKey;
      
      if (onGenerate) {
        newKey = await onGenerate(newKeyName);
      } else {
        // Mock generation
        await new Promise(resolve => setTimeout(resolve, 1000));
        newKey = {
          id: Math.random().toString(),
          name: newKeyName,
          key: `rg_sk_${Array.from({ length: 32 }, () => 
            '0123456789abcdef'[Math.floor(Math.random() * 16)]
          ).join('')}`,
          prefix: 'rg_sk_' + Math.random().toString(36).substring(2, 8) + '...',
          createdAt: new Date(),
        };
      }

      setKeys([...keys, newKey]);
      setNewlyGenerated(newKey);
      setNewKeyName('');
      setGenerateDialogOpen(false);
      toast.success('API key generated successfully');
    } catch {
      toast.error('Failed to generate API key');
    } finally {
      setGeneratingKey(false);
    }
  };

  const handleRevoke = async (keyId: string) => {
    try {
      if (onRevoke) {
        await onRevoke(keyId);
      } else {
        // Mock revocation
        await new Promise(resolve => setTimeout(resolve, 500));
      }
      
      setKeys(keys.filter(k => k.id !== keyId));
      toast.success('API key revoked');
    } catch {
      toast.error('Failed to revoke API key');
    }
  };

  const handleRegenerate = async (keyId: string) => {
    try {
      let regeneratedKey: APIKey;
      
      if (onRegenerate) {
        regeneratedKey = await onRegenerate(keyId);
      } else {
        // Mock regeneration
        await new Promise(resolve => setTimeout(resolve, 1000));
        const oldKey = keys.find(k => k.id === keyId)!;
        regeneratedKey = {
          ...oldKey,
          key: `rg_sk_${Array.from({ length: 32 }, () => 
            '0123456789abcdef'[Math.floor(Math.random() * 16)]
          ).join('')}`,
          prefix: 'rg_sk_' + Math.random().toString(36).substring(2, 8) + '...',
          createdAt: new Date(),
          lastUsed: undefined,
        };
      }

      setKeys(keys.map(k => k.id === keyId ? regeneratedKey : k));
      setNewlyGenerated(regeneratedKey);
      toast.success('API key regenerated');
    } catch {
      toast.error('Failed to regenerate API key');
    }
  };

  const formatDate = (date: Date) => {
    const now = new Date();
    const diff = now.getTime() - date.getTime();
    
    if (diff < 3600000) return `${Math.floor(diff / 60000)}m ago`;
    if (diff < 86400000) return `${Math.floor(diff / 3600000)}h ago`;
    if (diff < 2592000000) return `${Math.floor(diff / 86400000)}d ago`;
    return date.toLocaleDateString();
  };

  return (
    <>
      <Card>
        <CardHeader>
          <div className="flex items-center justify-between">
            <div>
              <CardTitle className="flex items-center gap-2">
                <Key className="h-5 w-5" />
                API Keys
              </CardTitle>
              <CardDescription>
                Manage authentication keys for this API
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
                    Create a new authentication key for this API. Keep it secure!
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
                      A descriptive name to identify this key
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
                    disabled={generatingKey || newKeyName.length < 3}
                  >
                    {generatingKey ? 'Generating...' : 'Generate Key'}
                  </Button>
                </DialogFooter>
              </DialogContent>
            </Dialog>
          </div>
        </CardHeader>
        <CardContent>
          <div className="space-y-3">
            {keys.length === 0 ? (
              <div className="text-center py-8 text-muted-foreground">
                <Key className="h-12 w-12 mx-auto mb-2 opacity-50" />
                <p>No API keys yet</p>
                <p className="text-xs mt-1">Generate your first key to get started</p>
              </div>
            ) : (
              keys.map((key) => (
                <div
                  key={key.id}
                  className="p-4 border rounded-lg space-y-3"
                >
                  {/* Key Header */}
                  <div className="flex items-start justify-between">
                    <div className="space-y-1">
                      <div className="flex items-center gap-2">
                        <span className="font-semibold">{key.name}</span>
                        {key.id === newlyGenerated?.id && (
                          <Badge className="bg-green-500">New</Badge>
                        )}
                      </div>
                      <div className="flex items-center gap-2 text-xs text-muted-foreground">
                        <span>Created {formatDate(key.createdAt)}</span>
                        {key.lastUsed && (
                          <>
                            <span>•</span>
                            <span className="flex items-center gap-1">
                              <Clock className="h-3 w-3" />
                              Last used {formatDate(key.lastUsed)}
                            </span>
                          </>
                        )}
                      </div>
                    </div>
                    <div className="flex items-center gap-1">
                      <AlertDialog>
                        <AlertDialogTrigger asChild>
                          <Button variant="ghost" size="sm" className="gap-2">
                            <RefreshCw className="h-4 w-4" />
                          </Button>
                        </AlertDialogTrigger>
                        <AlertDialogContent>
                          <AlertDialogHeader>
                            <AlertDialogTitle>Regenerate API Key?</AlertDialogTitle>
                            <AlertDialogDescription>
                              This will create a new key and invalidate the old one. Any applications using the old key will stop working until updated.
                            </AlertDialogDescription>
                          </AlertDialogHeader>
                          <AlertDialogFooter>
                            <AlertDialogCancel>Cancel</AlertDialogCancel>
                            <AlertDialogAction onClick={() => handleRegenerate(key.id)}>
                              Regenerate
                            </AlertDialogAction>
                          </AlertDialogFooter>
                        </AlertDialogContent>
                      </AlertDialog>

                      <AlertDialog>
                        <AlertDialogTrigger asChild>
                          <Button variant="ghost" size="sm" className="gap-2 text-destructive hover:text-destructive">
                            <Trash2 className="h-4 w-4" />
                          </Button>
                        </AlertDialogTrigger>
                        <AlertDialogContent>
                          <AlertDialogHeader>
                            <AlertDialogTitle>Revoke API Key?</AlertDialogTitle>
                            <AlertDialogDescription>
                              This action cannot be undone. The key will be permanently deleted and any applications using it will lose access.
                            </AlertDialogDescription>
                          </AlertDialogHeader>
                          <AlertDialogFooter>
                            <AlertDialogCancel>Cancel</AlertDialogCancel>
                            <AlertDialogAction
                              onClick={() => handleRevoke(key.id)}
                              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
                            >
                              Revoke
                            </AlertDialogAction>
                          </AlertDialogFooter>
                        </AlertDialogContent>
                      </AlertDialog>
                    </div>
                  </div>

                  {/* Key Display */}
                  <div className="flex items-center gap-2">
                    <div className="flex-1 font-mono text-sm bg-muted p-2 rounded">
                      {showKey[key.id] ? (
                        <span className="select-all">{key.key}</span>
                      ) : (
                        <span className="blur-sm select-none">{key.key}</span>
                      )}
                    </div>
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={() => setShowKey({ ...showKey, [key.id]: !showKey[key.id] })}
                    >
                      {showKey[key.id] ? (
                        <EyeOff className="h-4 w-4" />
                      ) : (
                        <Eye className="h-4 w-4" />
                      )}
                    </Button>
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={() => copyToClipboard(key.id, key.key)}
                      className="gap-2"
                    >
                      {copied[key.id] ? (
                        <>
                          <Check className="h-4 w-4 text-green-600" />
                          Copied
                        </>
                      ) : (
                        <>
                          <Copy className="h-4 w-4" />
                          Copy
                        </>
                      )}
                    </Button>
                  </div>
                </div>
              ))
            )}
          </div>
        </CardContent>
      </Card>

      {/* New Key Success Dialog */}
      <Dialog open={!!newlyGenerated} onOpenChange={() => setNewlyGenerated(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <Check className="h-5 w-5 text-green-600" />
              API Key Generated
            </DialogTitle>
            <DialogDescription>
              Save this key securely. You won't be able to see it again!
            </DialogDescription>
          </DialogHeader>
          {newlyGenerated && (
            <div className="space-y-4">
              <div className="p-4 bg-green-50 dark:bg-green-900/20 border border-green-200 dark:border-green-900/50 rounded-lg">
                <div className="space-y-2">
                  <Label>Your New API Key</Label>
                  <div className="flex items-center gap-2">
                    <code className="flex-1 p-2 bg-background border rounded text-xs font-mono break-all">
                      {newlyGenerated.key}
                    </code>
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={() => copyToClipboard(newlyGenerated.id, newlyGenerated.key)}
                    >
                      {copied[newlyGenerated.id] ? (
                        <Check className="h-4 w-4" />
                      ) : (
                        <Copy className="h-4 w-4" />
                      )}
                    </Button>
                  </div>
                </div>
              </div>
              <p className="text-sm text-muted-foreground">
                ⚠️ Make sure to copy and save this key now. For security reasons, we can&apos;t show it again after you close this dialog.
              </p>
            </div>
          )}
          <DialogFooter>
            <Button onClick={() => setNewlyGenerated(null)}>
              I&apos;ve Saved the Key
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}
