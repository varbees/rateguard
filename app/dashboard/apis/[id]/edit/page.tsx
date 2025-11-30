'use client';

import { useState, useEffect } from 'react';
import { useParams, useRouter } from 'next/navigation';
import { ArrowLeft, Save, Loader2, CheckCircle2, AlertTriangle, Lock, Unlock, Info } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Slider } from '@/components/ui/slider';
import { Switch } from '@/components/ui/switch';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { Checkbox } from '@/components/ui/checkbox';
import { Badge } from '@/components/ui/badge';
import {
  Breadcrumb,
  BreadcrumbItem,
  BreadcrumbLink,
  BreadcrumbList,
  BreadcrumbPage,
  BreadcrumbSeparator,
} from '@/components/ui/breadcrumb';
import { useAPIConfig, useUpdateAPI } from '@/lib/hooks/use-api';
import { useUser } from '@/lib/hooks/use-user';
import { toast } from 'sonner';
import { cn } from '@/lib/utils';

export default function EditAPIPage() {
  const params = useParams();
  const router = useRouter();
  const apiId = params.id as string;
  const { data: api, isLoading } = useAPIConfig(apiId);
  const updateMutation = useUpdateAPI();
  const { hasAccess } = useUser();

  // Form state
  const [name, setName] = useState('');
  const [targetUrl, setTargetUrl] = useState('');
  const [apiKey, setApiKey] = useState('');
  const [overrideUrl, setOverrideUrl] = useState(false);
  const [description, setDescription] = useState('');
  
  // Rate limits
  const [perSecond, setPerSecond] = useState(10);
  const [burst, setBurst] = useState(20);
  const [perHour, setPerHour] = useState(0);
  const [perDay, setPerDay] = useState(0);
  const [perMonth, setPerMonth] = useState(0);
  
  // Advanced
  const [timeoutSeconds, setTimeoutSeconds] = useState(30);
  const [retryAttempts, setRetryAttempts] = useState(3);
  const [enabled, setEnabled] = useState(true);
  const [corsOrigins, setCorsOrigins] = useState<string[]>([]);
  const [customHeaders, setCustomHeaders] = useState<Record<string, string>>({});
  
  // UI state
  const [activeTab, setActiveTab] = useState('basic');
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [hasChanges, setHasChanges] = useState(false);

  // Load API data
  useEffect(() => {
    if (api) {
      setName(api.name);
      setTargetUrl(api.target_url);
      setDescription(api.custom_headers?.description || '');
      setPerSecond(api.rate_limit_per_second);
      setBurst(api.burst_size);
      setPerHour(api.rate_limit_per_hour || 0);
      setPerDay(api.rate_limit_per_day || 0);
      setPerMonth(api.rate_limit_per_month || 0);
      setTimeoutSeconds(api.timeout_seconds);
      setRetryAttempts(api.retry_attempts);
      setEnabled(api.enabled);
      setCorsOrigins(api.allowed_origins || []);
      const { description: _, ...headers } = api.custom_headers || {};
      setCustomHeaders(headers);
      
      // Check if URL was overridden
      if (api.provider && api.provider !== 'custom') {
        setOverrideUrl(true);
      }
    }
  }, [api]);

  // Track changes
  useEffect(() => {
    if (!api) return;
    
    const changed = 
      name !== api.name ||
      targetUrl !== api.target_url ||
      description !== (api.custom_headers?.description || '') ||
      perSecond !== api.rate_limit_per_second ||
      burst !== api.burst_size ||
      perHour !== (api.rate_limit_per_hour || 0) ||
      perDay !== (api.rate_limit_per_day || 0) ||
      perMonth !== (api.rate_limit_per_month || 0) ||
      timeoutSeconds !== api.timeout_seconds ||
      retryAttempts !== api.retry_attempts ||
      enabled !== api.enabled;
    
    setHasChanges(changed);
  }, [api, name, targetUrl, description, perSecond, burst, perHour, perDay, perMonth, timeoutSeconds, retryAttempts, enabled]);

  const validate = () => {
    const newErrors: Record<string, string> = {};

    if (name.length < 3) {
      newErrors.name = 'Name must be at least 3 characters';
    }

    if (!targetUrl.startsWith('http')) {
      newErrors.targetUrl = 'Must be a valid HTTP/HTTPS URL';
    }

    if (apiKey && apiKey.length < 10) {
      newErrors.apiKey = 'API key seems too short';
    }

    setErrors(newErrors);
    return Object.keys(newErrors).length === 0;
  };

  const handleSave = async () => {
    if (!validate()) {
      toast.error('Please fix validation errors');
      return;
    }

    try {
      await updateMutation.mutateAsync({
        id: apiId,
        data: {
          name,
          target_url: targetUrl,
          ...(apiKey ? { api_key: apiKey } : {}),
          rate_limit_per_second: perSecond,
          burst_size: burst,
          rate_limit_per_hour: perHour,
          rate_limit_per_day: perDay,
          rate_limit_per_month: perMonth,
          timeout_seconds: timeoutSeconds,
          retry_attempts: retryAttempts,
          enabled,
          allowed_origins: corsOrigins,
          custom_headers: {
            ...customHeaders,
            ...(description ? { description } : {}),
          },
        },
      });

      toast.success('API configuration updated');
      router.push(`/dashboard/apis/${apiId}`);
    } catch (error) {
      toast.error('Failed to update API');
    }
  };

  const isUrlEditable = api?.provider === 'custom' || overrideUrl;

  if (isLoading) {
    return (
      <div className="flex items-center justify-center min-h-screen">
        <div className="text-center space-y-4">
          <Loader2 className="w-8 h-8 animate-spin mx-auto text-primary" />
          <p className="text-muted-foreground">Loading API configuration...</p>
        </div>
      </div>
    );
  }

  if (!api) {
    return (
      <div className="flex items-center justify-center min-h-screen">
        <div className="text-center space-y-4">
          <AlertTriangle className="w-12 h-12 mx-auto text-destructive" />
          <h2 className="text-2xl font-bold">API Not Found</h2>
          <p className="text-muted-foreground">This API configuration doesn't exist.</p>
          <Button onClick={() => router.push('/dashboard/apis')}>Back to APIs</Button>
        </div>
      </div>
    );
  }

  return (
    <div className="container mx-auto p-6 max-w-5xl space-y-6">
      {/* Breadcrumb */}
      <Breadcrumb>
        <BreadcrumbList>
          <BreadcrumbItem>
            <BreadcrumbLink href="/dashboard">Dashboard</BreadcrumbLink>
          </BreadcrumbItem>
          <BreadcrumbSeparator />
          <BreadcrumbItem>
            <BreadcrumbLink href="/dashboard/apis">APIs</BreadcrumbLink>
          </BreadcrumbItem>
          <BreadcrumbSeparator />
          <BreadcrumbItem>
            <BreadcrumbPage>Edit {api.name}</BreadcrumbPage>
          </BreadcrumbItem>
        </BreadcrumbList>
      </Breadcrumb>

      {/* Header */}
      <div className="flex items-center justify-between">
        <div className="space-y-1">
          <div className="flex items-center gap-3">
            <Button
              variant="ghost"
              size="sm"
              onClick={() => router.push(`/dashboard/apis/${apiId}`)}
              className="gap-2"
            >
              <ArrowLeft className="h-4 w-4" />
              Back
            </Button>
            <h1 className="text-3xl font-bold">Edit Configuration</h1>
          </div>
          <p className="text-muted-foreground">
            Update settings for {api.name}
          </p>
        </div>
        <div className="flex items-center gap-2">
          {hasChanges && (
            <Badge variant="outline" className="gap-1">
              <div className="w-2 h-2 bg-orange-500 rounded-full animate-pulse" />
              Unsaved changes
            </Badge>
          )}
          <Button
            onClick={handleSave}
            disabled={updateMutation.isPending || !hasChanges}
            className="gap-2"
          >
            {updateMutation.isPending ? (
              <>
                <Loader2 className="h-4 w-4 animate-spin" />
                Saving...
              </>
            ) : (
              <>
                <Save className="h-4 w-4" />
                Save Changes
              </>
            )}
          </Button>
        </div>
      </div>

      {/* Tabs */}
      <Tabs value={activeTab} onValueChange={setActiveTab} className="space-y-6">
        <TabsList className="grid w-full grid-cols-4">
          <TabsTrigger value="basic" className="gap-2">
            <CheckCircle2 className="h-4 w-4" />
            Basic
          </TabsTrigger>
          <TabsTrigger value="limits" className="gap-2">
            Rate Limits
          </TabsTrigger>
          <TabsTrigger value="advanced" className="gap-2">
            Advanced
          </TabsTrigger>
          <TabsTrigger value="cors" className="gap-2">
            CORS & Headers
          </TabsTrigger>
        </TabsList>

        {/* Basic Tab */}
        <TabsContent value="basic" className="space-y-6">
          <Card>
            <CardHeader>
              <CardTitle>Basic Information</CardTitle>
              <CardDescription>
                Core configuration for your API proxy
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="space-y-2">
                <Label htmlFor="name">Project Name <span className="text-red-500">*</span></Label>
                <Input
                  id="name"
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  placeholder="My Production API"
                  className={cn(errors.name && "border-red-500")}
                />
                {errors.name && (
                  <p className="text-xs text-red-500">{errors.name}</p>
                )}
              </div>

              <div className="space-y-2">
                <div className="flex items-center justify-between">
                  <Label htmlFor="targetUrl">Target URL <span className="text-red-500">*</span></Label>
                  {api.provider && api.provider !== 'custom' && (
                    <div className="flex items-center gap-2">
                      <Checkbox
                        id="override-url"
                        checked={overrideUrl}
                        onCheckedChange={(checked) => setOverrideUrl(checked as boolean)}
                      />
                      <Label
                        htmlFor="override-url"
                        className="text-xs font-normal cursor-pointer text-muted-foreground flex items-center gap-1"
                      >
                        {overrideUrl ? <Unlock className="w-3 h-3" /> : <Lock className="w-3 h-3" />}
                        Override default URL
                      </Label>
                    </div>
                  )}
                </div>
                <Input
                  id="targetUrl"
                  value={targetUrl}
                  onChange={(e) => setTargetUrl(e.target.value)}
                  placeholder="https://api.example.com/v1"
                  readOnly={!isUrlEditable}
                  className={cn(
                    errors.targetUrl && "border-red-500",
                    !isUrlEditable && "bg-muted cursor-not-allowed"
                  )}
                />
                {errors.targetUrl && (
                  <p className="text-xs text-red-500">{errors.targetUrl}</p>
                )}
                {overrideUrl && (
                  <Alert>
                    <AlertTriangle className="h-4 w-4" />
                    <AlertDescription className="text-xs">
                      Custom URL override is enabled. Make sure the endpoint is correct.
                    </AlertDescription>
                  </Alert>
                )}
              </div>

              <div className="space-y-2">
                <Label htmlFor="apiKey">Update API Key (Optional)</Label>
                <Input
                  id="apiKey"
                  type="password"
                  value={apiKey}
                  onChange={(e) => setApiKey(e.target.value)}
                  placeholder="Leave blank to keep existing key"
                  className={cn(errors.apiKey && "border-red-500")}
                />
                <Alert>
                  <Lock className="h-4 w-4" />
                  <AlertDescription className="text-xs">
                    Only enter a new key if you want to update it. Your existing key is encrypted and secure.
                  </AlertDescription>
                </Alert>
              </div>

              <div className="space-y-2">
                <Label htmlFor="description">Description (Optional)</Label>
                <Textarea
                  id="description"
                  value={description}
                  onChange={(e) => setDescription(e.target.value)}
                  placeholder="Brief description of this API"
                  rows={3}
                />
              </div>
            </CardContent>
          </Card>
        </TabsContent>

        {/* Rate Limits Tab */}
        <TabsContent value="limits" className="space-y-6">
          <Card>
            <CardHeader>
              <CardTitle>Rate Limit Configuration</CardTitle>
              <CardDescription>
                Control request throughput and burst handling
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-6">
              <div className="space-y-3">
                <div className="flex items-center justify-between">
                  <Label>Requests per Second</Label>
                  <span className="text-sm font-semibold text-primary">{perSecond}</span>
                </div>
                <Slider
                  value={[perSecond]}
                  onValueChange={([v]) => setPerSecond(v)}
                  min={1}
                  max={hasAccess('pro') ? 1000 : 100}
                  step={1}
                />
              </div>

              <div className="space-y-3">
                <div className="flex items-center justify-between">
                  <Label>Burst Size</Label>
                  <span className="text-sm font-semibold text-primary">{burst}</span>
                </div>
                <Slider
                  value={[burst]}
                  onValueChange={([v]) => setBurst(v)}
                  min={perSecond}
                  max={hasAccess('pro') ? 2000 : 200}
                  step={1}
                />
              </div>

              {hasAccess('pro') && (
                <>
                  <div className="space-y-3">
                    <div className="flex items-center justify-between">
                      <Label>Per Hour (0 = unlimited)</Label>
                      <span className="text-sm font-semibold text-primary">{perHour}</span>
                    </div>
                    <Slider
                      value={[perHour]}
                      onValueChange={([v]) => setPerHour(v)}
                      min={0}
                      max={100000}
                      step={100}
                    />
                  </div>

                  <div className="space-y-3">
                    <div className="flex items-center justify-between">
                      <Label>Per Day (0 = unlimited)</Label>
                      <span className="text-sm font-semibold text-primary">{perDay}</span>
                    </div>
                    <Slider
                      value={[perDay]}
                      onValueChange={([v]) => setPerDay(v)}
                      min={0}
                      max={1000000}
                      step={1000}
                    />
                  </div>

                  <div className="space-y-3">
                    <div className="flex items-center justify-between">
                      <Label>Per Month (0 = unlimited)</Label>
                      <span className="text-sm font-semibold text-primary">{perMonth}</span>
                    </div>
                    <Slider
                      value={[perMonth]}
                      onValueChange={([v]) => setPerMonth(v)}
                      min={0}
                      max={10000000}
                      step={10000}
                    />
                  </div>
                </>
              )}
            </CardContent>
          </Card>
        </TabsContent>

        {/* Advanced Tab */}
        <TabsContent value="advanced" className="space-y-6">
          <Card>
            <CardHeader>
              <CardTitle>Advanced Settings</CardTitle>
              <CardDescription>
                Timeout, retries, and API status
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-6">
              <div className="flex items-center justify-between p-4 border rounded-lg">
                <div className="space-y-0.5">
                  <Label htmlFor="enabled" className="text-base font-medium cursor-pointer">
                    API Status
                  </Label>
                  <p className="text-sm text-muted-foreground">
                    {enabled ? 'API is currently enabled' : 'API is currently disabled'}
                  </p>
                </div>
                <Switch
                  id="enabled"
                  checked={enabled}
                  onCheckedChange={setEnabled}
                />
              </div>

              <div className="space-y-3">
                <div className="flex items-center justify-between">
                  <Label>Timeout (seconds)</Label>
                  <span className="text-sm font-semibold text-primary">{timeoutSeconds}s</span>
                </div>
                <Slider
                  value={[timeoutSeconds]}
                  onValueChange={([v]) => setTimeoutSeconds(v)}
                  min={5}
                  max={300}
                  step={5}
                />
              </div>

              <div className="space-y-3">
                <div className="flex items-center justify-between">
                  <Label>Retry Attempts</Label>
                  <span className="text-sm font-semibold text-primary">{retryAttempts}</span>
                </div>
                <Slider
                  value={[retryAttempts]}
                  onValueChange={([v]) => setRetryAttempts(v)}
                  min={0}
                  max={10}
                  step={1}
                />
              </div>
            </CardContent>
          </Card>
        </TabsContent>

        {/* CORS Tab */}
        <TabsContent value="cors" className="space-y-6">
          <Card>
            <CardHeader>
              <CardTitle>CORS & Custom Headers</CardTitle>
              <CardDescription>
                Configure cross-origin policies and request headers
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              <Alert>
                <Info className="h-4 w-4" />
                <AlertDescription className="text-xs">
                  CORS and custom headers features coming soon. These settings are preserved from your current configuration.
                </AlertDescription>
              </Alert>
              
              {corsOrigins.length > 0 && (
                <div className="space-y-2">
                  <Label>Current CORS Origins</Label>
                  <div className="space-y-1">
                    {corsOrigins.map((origin, i) => (
                      <div key={i} className="text-sm font-mono bg-muted p-2 rounded">
                        {origin}
                      </div>
                    ))}
                  </div>
                </div>
              )}
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>
    </div>
  );
}
