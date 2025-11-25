import { useState } from "react";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import type { QueueStats, APIQueue } from "@/lib/api";
import {
  BarChart,
  Bar,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip as RechartsTooltip,
  ResponsiveContainer,
  PieChart,
  Pie,
  Cell,
} from "recharts";

interface QueueAnalyticsProps {
  stats: QueueStats;
  className?: string;
}

export default function QueueAnalytics({
  stats,
  className,
}: QueueAnalyticsProps) {
  const [activeTab, setActiveTab] = useState("requests");

  // Format milliseconds to readable time
  const formatTime = (ms: number) => {
    if (ms < 1000) return `${ms}ms`;
    return `${(ms / 1000).toFixed(1)}s`;
  };

  // Prepare data for bar chart
  const prepareBarData = (apiQueues: APIQueue[]) => {
    return apiQueues.map((queue) => ({
      name: queue.api_name,
      requests: queue.queued_requests,
      waitTime: queue.avg_wait_time_ms / 1000, // Convert to seconds for better visualization
      rateHits: queue.rate_limit_hits_24h,
    }));
  };

  // Prepare data for pie chart
  const preparePieData = (apiQueues: APIQueue[]) => {
    // Filter only APIs with queued requests
    return apiQueues
      .filter((queue) => queue.queued_requests > 0)
      .map((queue) => ({
        name: queue.api_name,
        value: queue.queued_requests,
      }));
  };

  // Colors for pie chart
  const COLORS = [
    "#0088FE",
    "#00C49F",
    "#FFBB28",
    "#FF8042",
    "#8884D8",
    "#82ca9d",
  ];

  // Check if there are any queued requests
  const hasQueuedRequests = stats.queued_by_api.some(
    (api) => api.queued_requests > 0
  );

  return (
    <Card className={className}>
      <CardHeader>
        <CardTitle>Queue Analytics</CardTitle>
        <CardDescription>
          Performance metrics for your API queues
        </CardDescription>
      </CardHeader>
      <CardContent>
        <Tabs
          defaultValue="requests"
          value={activeTab}
          onValueChange={setActiveTab}
        >
          <TabsList className="grid w-full grid-cols-3">
            <TabsTrigger value="requests">Queued Requests</TabsTrigger>
            <TabsTrigger value="waitTime">Wait Times</TabsTrigger>
            <TabsTrigger value="distribution">Distribution</TabsTrigger>
          </TabsList>

          <TabsContent value="requests" className="py-4">
            <div className="h-[300px] w-full">
              {stats.queued_by_api.length > 0 ? (
                <ResponsiveContainer width="100%" height="100%">
                  <BarChart
                    data={prepareBarData(stats.queued_by_api)}
                    margin={{ top: 20, right: 30, left: 20, bottom: 50 }}
                  >
                    <CartesianGrid strokeDasharray="3 3" />
                    <XAxis
                      dataKey="name"
                      angle={-45}
                      textAnchor="end"
                      height={70}
                    />
                    <YAxis />
                    <RechartsTooltip
                      formatter={(value: number | string) =>
                        [`${value} requests`, "Queued"] as [string, string]
                      }
                    />
                    <Bar
                      dataKey="requests"
                      fill="#8884d8"
                      name="Queued Requests"
                    />
                  </BarChart>
                </ResponsiveContainer>
              ) : (
                <div className="flex h-full items-center justify-center">
                  <p className="text-muted-foreground">
                    No queue data available
                  </p>
                </div>
              )}
            </div>
          </TabsContent>

          <TabsContent value="waitTime" className="py-4">
            <div className="h-[300px] w-full">
              {stats.queued_by_api.length > 0 ? (
                <ResponsiveContainer width="100%" height="100%">
                  <BarChart
                    data={prepareBarData(stats.queued_by_api)}
                    margin={{ top: 20, right: 30, left: 20, bottom: 50 }}
                  >
                    <CartesianGrid strokeDasharray="3 3" />
                    <XAxis
                      dataKey="name"
                      angle={-45}
                      textAnchor="end"
                      height={70}
                    />
                    <YAxis />
                    <RechartsTooltip
                      formatter={(value: number) =>
                        [`${value.toFixed(2)}s`, "Average Wait Time"] as [
                          string,
                          string
                        ]
                      }
                    />
                    <Bar
                      dataKey="waitTime"
                      fill="#82ca9d"
                      name="Wait Time (s)"
                    />
                  </BarChart>
                </ResponsiveContainer>
              ) : (
                <div className="flex h-full items-center justify-center">
                  <p className="text-muted-foreground">
                    No wait time data available
                  </p>
                </div>
              )}
            </div>
          </TabsContent>

          <TabsContent value="distribution" className="py-4">
            <div className="h-[300px] w-full">
              {hasQueuedRequests ? (
                <ResponsiveContainer width="100%" height="100%">
                  <PieChart>
                    <Pie
                      data={preparePieData(stats.queued_by_api)}
                      cx="50%"
                      cy="50%"
                      labelLine={true}
                      label={({ name, percent }) =>
                        `${name}: ${((percent || 0) * 100).toFixed(0)}%`
                      }
                      outerRadius={80}
                      fill="#8884d8"
                      dataKey="value"
                    >
                      {preparePieData(stats.queued_by_api).map(
                        (entry, index) => (
                          <Cell
                            key={`cell-${index}`}
                            fill={COLORS[index % COLORS.length]}
                          />
                        )
                      )}
                    </Pie>
                    <RechartsTooltip
                      formatter={(value: number | string) =>
                        [`${value} requests`, "Queued"] as [string, string]
                      }
                    />
                  </PieChart>
                </ResponsiveContainer>
              ) : (
                <div className="flex h-full items-center justify-center">
                  <p className="text-muted-foreground">
                    No queued requests to display
                  </p>
                </div>
              )}
            </div>
          </TabsContent>
        </Tabs>

        <div className="mt-4 grid grid-cols-2 gap-4 sm:grid-cols-4">
          <Card>
            <CardHeader className="p-3">
              <CardTitle className="text-sm">Total Queued</CardTitle>
            </CardHeader>
            <CardContent className="p-3 pt-0">
              <p className="text-xl font-bold">{stats.total_queued_requests}</p>
            </CardContent>
          </Card>

          <Card>
            <CardHeader className="p-3">
              <CardTitle className="text-sm">Avg Wait</CardTitle>
            </CardHeader>
            <CardContent className="p-3 pt-0">
              <p className="text-xl font-bold">
                {formatTime(stats.avg_wait_time_ms)}
              </p>
            </CardContent>
          </Card>

          <Card>
            <CardHeader className="p-3">
              <CardTitle className="text-sm">Peak Queue</CardTitle>
            </CardHeader>
            <CardContent className="p-3 pt-0">
              <p className="text-xl font-bold">{stats.peak_queue_length}</p>
            </CardContent>
          </Card>

          <Card>
            <CardHeader className="p-3">
              <CardTitle className="text-sm">24h Queue Hits</CardTitle>
            </CardHeader>
            <CardContent className="p-3 pt-0">
              <p className="text-xl font-bold">
                {stats.total_requests_queued_24h}
              </p>
            </CardContent>
          </Card>
        </div>
      </CardContent>
    </Card>
  );
}
