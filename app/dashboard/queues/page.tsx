"use client";

import { useState } from "react";
import type { QueuedRequest, QueueStats, QueueConfig } from "@/lib/api";
import {
  useQueueStats,
  useActiveQueues,
  useQueueConfig,
  useUpdateQueueConfig,
  useCancelQueuedRequest,
} from "@/lib/hooks/use-api";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Separator } from "@/components/ui/separator";
import { Switch } from "@/components/ui/switch";
import { Slider } from "@/components/ui/slider";
import { useToast } from "@/hooks/use-toast";
import { Skeleton } from "@/components/ui/skeleton";
import { Check, Clock, RefreshCw, Activity } from "lucide-react";
import QueueVisualizer from "@/components/queue/queue-visualizer";
import QueueAnalytics from "@/components/queue/queue-analytics";

export default function QueueDashboardPage() {
  const [activeTab, setActiveTab] = useState("overview");
  const { toast } = useToast();

  // Data Fetching Hooks
  const { 
    data: queueStats, 
    isLoading: statsLoading, 
    refetch: refetchStats 
  } = useQueueStats();

  const { 
    data: activeQueues = [], 
    isLoading: activeLoading, 
    refetch: refetchActive 
  } = useActiveQueues();

  const { 
    data: queueConfig, 
    isLoading: configLoading 
  } = useQueueConfig();

  // Mutation Hooks
  const updateConfigMutation = useUpdateQueueConfig();
  const cancelRequestMutation = useCancelQueuedRequest();

  // Local state for config editing
  const [localConfig, setLocalConfig] = useState<QueueConfig | null>(null);
  const [configChanged, setConfigChanged] = useState(false);

  // Initialize local config when data loads
  if (queueConfig && !localConfig && !configChanged) {
    setLocalConfig(queueConfig);
  }

  const loading = statsLoading || activeLoading || configLoading;

  const handleCancelRequest = (requestId: string) => {
    cancelRequestMutation.mutate(requestId, {
      onSuccess: () => {
        toast({
          title: "Request cancelled",
          description: `Request ${requestId.slice(0, 8)} has been removed from the queue`,
        });
      },
      onError: (error) => {
        console.error("Failed to cancel request:", error);
        toast({
          title: "Failed to cancel request",
          description: "The request could not be cancelled",
          variant: "destructive",
        });
      },
    });
  };

  const handleConfigChange = (newConfig: QueueConfig) => {
    setLocalConfig(newConfig);
    setConfigChanged(true);
  };

  const saveQueueConfig = () => {
    if (!localConfig) return;

    updateConfigMutation.mutate(localConfig, {
      onSuccess: () => {
        setConfigChanged(false);
        toast({
          title: "Configuration saved",
          description: "Queue settings have been updated",
        });
      },
      onError: (error) => {
        console.error("Failed to save queue config:", error);
        toast({
          title: "Failed to save configuration",
          description: "Please check your settings and try again",
          variant: "destructive",
        });
      },
    });
  };

  const formatTime = (ms: number) => {
    if (ms < 1000) return `${ms}ms`;
    return `${(ms / 1000).toFixed(1)}s`;
  };

  // Use local config for UI if editing, otherwise use fetched config
  const currentConfig = localConfig || queueConfig;

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-bold text-foreground">
            Queue Management
          </h1>
          <p className="text-muted-foreground mt-1">
            Monitor and manage API request queues
          </p>
        </div>
      </div>

      <Tabs
        defaultValue="overview"
        value={activeTab}
        onValueChange={setActiveTab}
        className="space-y-4"
      >
        <TabsList>
          <TabsTrigger value="overview">Overview</TabsTrigger>
          <TabsTrigger value="active">Active Queues</TabsTrigger>
          <TabsTrigger value="settings">Settings</TabsTrigger>
        </TabsList>

        {/* Overview Tab */}
        <TabsContent value="overview" className="space-y-4">
          <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-4">
            <Card>
              <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                <CardTitle className="text-sm font-medium">
                  Active Queues
                </CardTitle>
                <Activity className="h-4 w-4 text-muted-foreground" />
              </CardHeader>
              <CardContent>
                {statsLoading ? (
                  <Skeleton className="h-7 w-20" />
                ) : (
                  <div className="text-2xl font-bold">
                    {queueStats?.active_queues || 0}
                  </div>
                )}
                <p className="text-xs text-muted-foreground">
                  APIs with requests in queue
                </p>
              </CardContent>
            </Card>

            <Card>
              <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                <CardTitle className="text-sm font-medium">
                  Queued Requests
                </CardTitle>
                <Clock className="h-4 w-4 text-muted-foreground" />
              </CardHeader>
              <CardContent>
                {statsLoading ? (
                  <Skeleton className="h-7 w-20" />
                ) : (
                  <div className="text-2xl font-bold">
                    {queueStats?.total_queued_requests || 0}
                  </div>
                )}
                <p className="text-xs text-muted-foreground">
                  Total requests currently in queue
                </p>
              </CardContent>
            </Card>

            <Card>
              <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                <CardTitle className="text-sm font-medium">
                  Avg Wait Time
                </CardTitle>
                <Clock className="h-4 w-4 text-muted-foreground" />
              </CardHeader>
              <CardContent>
                {statsLoading ? (
                  <Skeleton className="h-7 w-20" />
                ) : (
                  <div className="text-2xl font-bold">
                    {formatTime(queueStats?.avg_wait_time_ms || 0)}
                  </div>
                )}
                <p className="text-xs text-muted-foreground">
                  Average time spent in queue
                </p>
              </CardContent>
            </Card>

            <Card>
              <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                <CardTitle className="text-sm font-medium">
                  Rate Limit Hits
                </CardTitle>
                <Activity className="h-4 w-4 text-muted-foreground" />
              </CardHeader>
              <CardContent>
                {statsLoading ? (
                  <Skeleton className="h-7 w-20" />
                ) : (
                  <div className="text-2xl font-bold">
                    {queueStats?.total_requests_queued_24h || 0}
                  </div>
                )}
                <p className="text-xs text-muted-foreground">
                  Requests queued in last 24h
                </p>
              </CardContent>
            </Card>
          </div>

          {statsLoading ? (
            <div className="space-y-4">
              <Skeleton className="h-64 w-full" />
              <Skeleton className="h-24 w-full" />
            </div>
          ) : queueStats ? (
            <QueueAnalytics stats={queueStats} className="overflow-hidden" />
          ) : (
            <Card>
              <CardContent className="py-6 text-center text-muted-foreground">
                No queue statistics available
              </CardContent>
            </Card>
          )}

          <Card>
            <CardHeader>
              <CardTitle>Queue Status by API</CardTitle>
              <CardDescription>
                Current status of queues across your APIs
              </CardDescription>
            </CardHeader>
            <CardContent>
              {statsLoading ? (
                <div className="space-y-2">
                  <Skeleton className="h-5 w-full" />
                  <Skeleton className="h-5 w-full" />
                  <Skeleton className="h-5 w-full" />
                </div>
              ) : queueStats?.queued_by_api &&
                queueStats.queued_by_api.length > 0 ? (
                <div className="space-y-4">
                  {queueStats.queued_by_api.map((apiQueue) => (
                    <div
                      key={apiQueue.api_name}
                      className="flex items-center justify-between"
                    >
                      <div>
                        <p className="font-medium">{apiQueue.api_name}</p>
                        <p className="text-sm text-muted-foreground">
                          Avg wait: {formatTime(apiQueue.avg_wait_time_ms)}
                        </p>
                      </div>
                      <div className="flex items-center space-x-4">
                        <div className="text-right">
                          <Badge
                            variant={
                              apiQueue.queued_requests > 0
                                ? "secondary"
                                : "outline"
                            }
                          >
                            {apiQueue.queued_requests} in queue
                          </Badge>
                        </div>
                        <div className="text-right">
                          <p className="text-sm">
                            {apiQueue.rate_limit_hits_24h} hits/24h
                          </p>
                        </div>
                      </div>
                    </div>
                  ))}
                </div>
              ) : (
                <div className="py-6 text-center text-muted-foreground">
                  No queue activity found
                </div>
              )}
            </CardContent>
          </Card>

          <div className="flex justify-end">
            <Button onClick={() => refetchStats()} variant="outline" size="sm">
              <RefreshCw className="mr-2 h-4 w-4" />
              Refresh
            </Button>
          </div>
        </TabsContent>

        {/* Active Queues Tab */}
        <TabsContent value="active" className="space-y-4">
          <div className="grid gap-4 lg:grid-cols-3">
            <Card className="lg:col-span-2">
              <CardHeader>
                <CardTitle>Queue Visualization</CardTitle>
                <CardDescription>
                  Visual representation of requests in queue
                </CardDescription>
              </CardHeader>
              <CardContent>
                {statsLoading || activeLoading ? (
                  <div className="space-y-8">
                    <Skeleton className="h-32 w-full" />
                    <Skeleton className="h-32 w-full" />
                  </div>
                ) : (
                  <QueueVisualizer
                    apiQueues={queueStats?.queued_by_api || []}
                    queuedRequests={activeQueues}
                    onCancelRequest={handleCancelRequest}
                  />
                )}
              </CardContent>
            </Card>

            <Card>
              <CardHeader>
                <CardTitle>Active Queued Requests</CardTitle>
                <CardDescription>
                  Detailed list of requests in queue
                </CardDescription>
              </CardHeader>
              <CardContent className="max-h-[500px] overflow-y-auto">
                {activeLoading ? (
                  <div className="space-y-2">
                    <Skeleton className="h-12 w-full" />
                    <Skeleton className="h-12 w-full" />
                    <Skeleton className="h-12 w-full" />
                  </div>
                ) : (activeQueues ?? []).length > 0 ? (
                  <div className="space-y-3">
                    {(activeQueues ?? []).map((request) => (
                      <div
                        key={request.request_id}
                        className="flex flex-col space-y-2 rounded-md border p-3"
                      >
                        <div className="flex justify-between items-center">
                          <p className="font-medium">
                            {request.method}{" "}
                            {request.path.length > 25
                              ? `${request.path.slice(0, 25)}...`
                              : request.path}
                          </p>
                          <Badge variant="outline">{request.target_api}</Badge>
                        </div>
                        <div className="flex justify-between items-center">
                          <div className="flex gap-2">
                            <Badge>#{request.position + 1}</Badge>
                            <Badge variant="secondary">
                              {formatTime(request.queued_for_ms)}
                            </Badge>
                          </div>
                          <Button
                            onClick={() =>
                              handleCancelRequest(request.request_id)
                            }
                            variant="outline"
                            size="sm"
                          >
                            Cancel
                          </Button>
                        </div>
                      </div>
                    ))}
                  </div>
                ) : (
                  <div className="py-6 text-center text-muted-foreground">
                    No requests in queue
                  </div>
                )}
              </CardContent>
            </Card>
          </div>

          <div className="flex justify-end">
            <Button onClick={() => refetchActive()} variant="outline" size="sm">
              <RefreshCw className="mr-2 h-4 w-4" />
              Refresh
            </Button>
          </div>
        </TabsContent>

        {/* Settings Tab */}
        <TabsContent value="settings" className="space-y-4">
          <Card>
            <CardHeader>
              <CardTitle>Queue Configuration</CardTitle>
              <CardDescription>
                Configure how requests are handled when rate limits are hit
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-6">
              {configLoading || !currentConfig ? (
                <div className="space-y-4">
                  <Skeleton className="h-10 w-full" />
                  <Skeleton className="h-10 w-full" />
                  <Skeleton className="h-10 w-full" />
                </div>
              ) : (
                <>
                  <div className="flex items-center justify-between">
                    <div className="space-y-0.5">
                      <h3 className="font-medium">Enable Queueing</h3>
                      <p className="text-sm text-muted-foreground">
                        Queue requests when rate limits are hit instead of
                        rejecting them
                      </p>
                    </div>
                    <Switch
                      checked={currentConfig.enabled}
                      onCheckedChange={(checked) => {
                        handleConfigChange({
                          ...currentConfig,
                          enabled: checked,
                        });
                      }}
                    />
                  </div>

                  <Separator />

                  <div className="space-y-2">
                    <h3 className="font-medium">Maximum Wait Time</h3>
                    <p className="text-sm text-muted-foreground">
                      How long a request can wait in queue before being rejected
                    </p>
                    <div className="flex items-center space-x-4">
                      <div className="flex-1">
                        <Slider
                          value={[currentConfig.max_wait_time_ms / 1000]}
                          min={1}
                          max={60}
                          step={1}
                          disabled={!currentConfig.enabled}
                          onValueChange={(value) => {
                            handleConfigChange({
                              ...currentConfig,
                              max_wait_time_ms: value[0] * 1000,
                            });
                          }}
                        />
                      </div>
                      <div className="w-20 text-center">
                        {currentConfig.max_wait_time_ms / 1000}s
                      </div>
                    </div>
                  </div>

                  <Separator />

                  <div className="space-y-2">
                    <h3 className="font-medium">Queuing Strategy</h3>
                    <p className="text-sm text-muted-foreground">
                      How to prioritize requests in the queue
                    </p>
                    <div className="flex space-x-2">
                      <Button
                        variant={
                          currentConfig.queueing_strategy === "fifo"
                            ? "default"
                            : "outline"
                        }
                        size="sm"
                        disabled={!currentConfig.enabled}
                        onClick={() => {
                          handleConfigChange({
                            ...currentConfig,
                            queueing_strategy: "fifo",
                          });
                        }}
                      >
                        First In, First Out
                      </Button>
                      <Button
                        variant={
                          currentConfig.queueing_strategy === "priority"
                            ? "default"
                            : "outline"
                        }
                        size="sm"
                        disabled={!currentConfig.enabled}
                        onClick={() => {
                          handleConfigChange({
                            ...currentConfig,
                            queueing_strategy: "priority",
                          });
                        }}
                      >
                        Priority-Based
                      </Button>
                    </div>
                  </div>

                  <div className="pt-4 flex justify-end space-x-2">
                    <Button
                      variant="default"
                      disabled={!configChanged || updateConfigMutation.isPending}
                      onClick={saveQueueConfig}
                    >
                      {updateConfigMutation.isPending ? (
                        <RefreshCw className="mr-2 h-4 w-4 animate-spin" />
                      ) : (
                        <Check className="mr-2 h-4 w-4" />
                      )}
                      Save Changes
                    </Button>
                  </div>
                </>
              )}
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>
    </div>
  );
}
