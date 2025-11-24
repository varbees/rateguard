"use client";

import * as React from "react";
import { useQuery } from "@tanstack/react-query";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  LineChart,
  Line,
  BarChart,
  Bar,
  PieChart,
  Pie,
  Cell,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
} from "recharts";
import {
  TrendingUp,
  TrendingDown,
  Activity,
  CheckCircle2,
  Clock,
  AlertCircle,
  DollarSign,
  HardDrive,
  Download,
  RefreshCw,
  ArrowUpDown,
  HelpCircle,
  Copy,
} from "lucide-react";
import {
  Tooltip as UITooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import { analyticsAPI, type AnalyticsData } from "@/lib/api";

type DateRange = "today" | "7d" | "30d" | "custom";
type SortField = "path" | "requests" | "avgResponseTime" | "errorRate";
type SortOrder = "asc" | "desc";

export default function AnalyticsPage() {
  const [dateRange, setDateRange] = React.useState<DateRange>("30d");
  const [selectedMetric, setSelectedMetric] = React.useState<string | null>(
    null
  );
  const [sortField, setSortField] = React.useState<SortField>("requests");
  const [sortOrder, setSortOrder] = React.useState<SortOrder>("desc");

  // Fetch analytics data
  const { data, isLoading, error, refetch } = useQuery({
    queryKey: ["analytics", dateRange],
    queryFn: () => analyticsAPI.get({ dateRange }),
    refetchInterval: 60000, // Refresh every minute
  });

  const handleRefresh = () => {
    refetch();
  };

  const handleExportCSV = () => {
    if (!data) return;

    const csv = [
      ["Endpoint", "Method", "Requests", "Avg Response (ms)", "Error Rate (%)"],
      ...data.topEndpoints.map((e) => [
        e.path,
        e.method,
        e.requests,
        e.avgResponseTime,
        e.errorRate,
      ]),
    ]
      .map((row) => row.join(","))
      .join("\n");

    const blob = new Blob([csv], { type: "text/csv" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `analytics-${dateRange}-${
      new Date().toISOString().split("T")[0]
    }.csv`;
    a.click();
    URL.revokeObjectURL(url);
  };

  const sortedEndpoints = React.useMemo(() => {
    if (!data) return [];
    return [...data.topEndpoints].sort((a, b) => {
      const aVal = a[sortField];
      const bVal = b[sortField];
      const multiplier = sortOrder === "asc" ? 1 : -1;
      return (aVal > bVal ? 1 : -1) * multiplier;
    });
  }, [data, sortField, sortOrder]);

  const handleSort = (field: SortField) => {
    if (sortField === field) {
      setSortOrder(sortOrder === "asc" ? "desc" : "asc");
    } else {
      setSortField(field);
      setSortOrder("desc");
    }
  };

  if (isLoading) {
    return (
      <div className="min-h-screen bg-background flex items-center justify-center">
        <div className="text-center">
          <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-primary mx-auto mb-4"></div>
          <p className="text-muted-foreground">Loading analytics...</p>
        </div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="min-h-screen bg-background flex items-center justify-center">
        <Card className="max-w-md">
          <CardHeader>
            <CardTitle className="text-destructive">Error</CardTitle>
          </CardHeader>
          <CardContent>
            <p className="text-muted-foreground">
              {error instanceof Error
                ? error.message
                : "Failed to load analytics"}
            </p>
            <Button onClick={handleRefresh} className="mt-4">
              Retry
            </Button>
          </CardContent>
        </Card>
      </div>
    );
  }

  if (!data) return null;

  return (
    <div className="min-h-screen bg-background">
      <div className="container max-w-7xl mx-auto px-4 py-8">
        {/* Header with Date Range Picker */}
        <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4 mb-8">
          <div>
            <h1 className="text-3xl font-bold tracking-tight">Analytics</h1>
            <p className="text-muted-foreground mt-1">
              Actionable insights for data-driven decisions
            </p>
          </div>
          <div className="flex gap-2 flex-wrap">
            <div className="flex gap-1 bg-muted/50 p-1 rounded-lg">
              {(["today", "7d", "30d"] as DateRange[]).map((range) => (
                <Button
                  key={range}
                  variant={dateRange === range ? "default" : "ghost"}
                  size="sm"
                  onClick={() => setDateRange(range)}
                  className="h-8 px-3"
                >
                  {range === "today"
                    ? "Today"
                    : range === "7d"
                    ? "Last 7d"
                    : "Last 30d"}
                </Button>
              ))}
            </div>
            <Button
              variant="outline"
              size="sm"
              onClick={handleRefresh}
              className="h-8 gap-2"
            >
              <RefreshCw className="size-4" />
              Refresh
            </Button>
            <Button size="sm" onClick={handleExportCSV} className="h-8 gap-2">
              <Download className="size-4" />
              Export CSV
            </Button>
          </div>
        </div>

        <div className="space-y-8">
          {/* Row 1: Six Key Metrics */}
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
            <MetricCard
              title="Total Requests"
              value={data.metrics.totalRequests.toLocaleString()}
              trend={data.metrics.trends.requests}
              icon={<Activity className="size-5" />}
              color="blue"
              tooltip="Total API requests in selected period"
              summary="Traffic is healthy ✅"
              onClick={() => setSelectedMetric("requests")}
            />
            <MetricCard
              title="Success Rate"
              value={`${data.metrics.successRate.toFixed(1)}%`}
              trend={data.metrics.trends.successRate}
              icon={<CheckCircle2 className="size-5" />}
              color={data.metrics.successRate >= 95 ? "green" : "yellow"}
              tooltip="Percentage of successful requests (2xx status)"
              summary="Great! 🎉 Most requests succeeding"
              onClick={() => setSelectedMetric("successRate")}
            />
            <MetricCard
              title="Avg Response Time"
              value={`${data.metrics.avgResponseTime.toFixed(0)}ms`}
              trend={data.metrics.trends.avgResponseTime}
              icon={<Clock className="size-5" />}
              color={data.metrics.avgResponseTime < 200 ? "green" : "yellow"}
              tooltip="Mean response time across all endpoints"
              summary="Fast ⚡ APIs performing well"
              onClick={() => setSelectedMetric("responseTime")}
            />
            <MetricCard
              title="Error Count"
              value={data.metrics.errorCount.toLocaleString()}
              trend={data.metrics.trends.errorCount}
              icon={<AlertCircle className="size-5" />}
              color={data.metrics.errorCount > 2000 ? "red" : "yellow"}
              tooltip="Total 4xx + 5xx errors"
              summary="Monitor 👀 Some errors detected"
              onClick={() => setSelectedMetric("errors")}
            />
            <MetricCard
              title="Bandwidth Used"
              value={`${data.metrics.bandwidthGB.toFixed(1)} GB`}
              trend={data.metrics.trends.bandwidth}
              icon={<HardDrive className="size-5" />}
              color="purple"
              tooltip="Total data transferred"
              summary={`$0.004/GB = $${(
                data.metrics.bandwidthGB * 0.004
              ).toFixed(2)}`}
              onClick={() => setSelectedMetric("bandwidth")}
            />
            <MetricCard
              title="Estimated Cost"
              value={`$${data.metrics.estimatedCost.toFixed(2)}`}
              trend={data.metrics.trends.cost}
              icon={<DollarSign className="size-5" />}
              color="orange"
              tooltip="Based on current usage tier"
              summary="💰 Within budget"
              onClick={() => setSelectedMetric("cost")}
            />
          </div>

          {/* Row 2: Three Charts */}
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
            {/* Chart 1: Requests Over Time */}
            <Card className="lg:col-span-2">
              <CardHeader>
                <CardTitle>Requests Over Time</CardTitle>
                <CardDescription>
                  Track traffic patterns • Hover for details
                </CardDescription>
              </CardHeader>
              <CardContent>
                <ResponsiveContainer width="100%" height={300}>
                  <LineChart data={data.requestsOverTime}>
                    <CartesianGrid
                      strokeDasharray="3 3"
                      className="stroke-muted"
                    />
                    <XAxis
                      dataKey="date"
                      tick={{ fill: "hsl(var(--muted-foreground))" }}
                    />
                    <YAxis tick={{ fill: "hsl(var(--muted-foreground))" }} />
                    <Tooltip
                      content={({ active, payload }) => {
                        if (!active || !payload) return null;
                        const dataPoint = payload[0].payload;
                        return (
                          <div className="bg-popover p-3 rounded-lg border shadow-lg">
                            <p className="font-semibold">{dataPoint.date}</p>
                            <p className="text-sm">
                              {dataPoint.requests.toLocaleString()} requests
                            </p>
                            <p className="text-sm text-green-600">
                              {dataPoint.successRate.toFixed(1)}% success
                            </p>
                          </div>
                        );
                      }}
                    />
                    <Line
                      type="monotone"
                      dataKey="requests"
                      stroke="hsl(var(--primary))"
                      strokeWidth={2}
                      dot={{ fill: "hsl(var(--primary))" }}
                    />
                  </LineChart>
                </ResponsiveContainer>
              </CardContent>
            </Card>

            {/* Chart 2: Requests Per API */}
            <Card>
              <CardHeader>
                <CardTitle>Requests Per API</CardTitle>
                <CardDescription>Top 5 APIs by request volume</CardDescription>
              </CardHeader>
              <CardContent>
                <ResponsiveContainer width="100%" height={300}>
                  <BarChart data={data.requestsPerAPI.slice(0, 5)}>
                    <CartesianGrid
                      strokeDasharray="3 3"
                      className="stroke-muted"
                    />
                    <XAxis
                      dataKey="apiName"
                      tick={{
                        fill: "hsl(var(--muted-foreground))",
                        fontSize: 12,
                      }}
                      angle={-45}
                      textAnchor="end"
                      height={80}
                    />
                    <YAxis tick={{ fill: "hsl(var(--muted-foreground))" }} />
                    <Tooltip
                      content={({ active, payload }) => {
                        if (!active || !payload) return null;
                        const dataPoint = payload[0].payload;
                        return (
                          <div className="bg-popover p-3 rounded-lg border shadow-lg">
                            <p className="font-semibold">{dataPoint.apiName}</p>
                            <p className="text-sm">
                              {dataPoint.requests.toLocaleString()} requests
                            </p>
                            <p className="text-sm text-muted-foreground">
                              {dataPoint.percentage.toFixed(1)}% of total
                            </p>
                          </div>
                        );
                      }}
                    />
                    <Bar dataKey="requests" radius={[8, 8, 0, 0]}>
                      {data.requestsPerAPI.slice(0, 5).map((_, index) => (
                        <Cell
                          key={index}
                          fill={`hsl(var(--chart-${(index % 5) + 1}))`}
                        />
                      ))}
                    </Bar>
                  </BarChart>
                </ResponsiveContainer>
              </CardContent>
            </Card>

            {/* Chart 3: Status Code Distribution */}
            <Card>
              <CardHeader>
                <CardTitle>Status Code Distribution</CardTitle>
                <CardDescription>Success vs error rates</CardDescription>
              </CardHeader>
              <CardContent>
                <ResponsiveContainer width="100%" height={300}>
                  <PieChart>
                    <Pie
                      data={data.statusCodes as any}
                      dataKey="value"
                      nameKey="name"
                      cx="50%"
                      cy="50%"
                      outerRadius={100}
                      label={(entry) =>
                        `${entry.name}: ${entry.value.toFixed(1)}%`
                      }
                    >
                      <Cell fill="#10b981" />
                      <Cell fill="#f59e0b" />
                      <Cell fill="#ef4444" />
                    </Pie>
                    <Tooltip
                      content={({ active, payload }) => {
                        if (!active || !payload) return null;
                        const dataPoint = payload[0].payload;
                        return (
                          <div className="bg-popover p-3 rounded-lg border shadow-lg">
                            <p className="font-semibold">{dataPoint.name}</p>
                            <p className="text-sm">
                              {dataPoint.count.toLocaleString()} requests
                            </p>
                            <p className="text-sm text-muted-foreground">
                              {dataPoint.value.toFixed(1)}%
                            </p>
                          </div>
                        );
                      }}
                    />
                  </PieChart>
                </ResponsiveContainer>
              </CardContent>
            </Card>
          </div>

          {/* Row 3: Top Endpoints Table */}
          <Card>
            <CardHeader>
              <CardTitle>Top Endpoints</CardTitle>
              <CardDescription>
                Most requested endpoints • Click column headers to sort
              </CardDescription>
            </CardHeader>
            <CardContent>
              <div className="rounded-lg border">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead
                        className="cursor-pointer hover:bg-muted/50"
                        onClick={() => handleSort("path")}
                      >
                        <div className="flex items-center gap-2">
                          Endpoint
                          <ArrowUpDown className="size-4" />
                        </div>
                      </TableHead>
                      <TableHead
                        className="cursor-pointer hover:bg-muted/50"
                        onClick={() => handleSort("requests")}
                      >
                        <div className="flex items-center gap-2">
                          Requests
                          <ArrowUpDown className="size-4" />
                        </div>
                      </TableHead>
                      <TableHead
                        className="cursor-pointer hover:bg-muted/50"
                        onClick={() => handleSort("avgResponseTime")}
                      >
                        <div className="flex items-center gap-2">
                          Avg Response
                          <ArrowUpDown className="size-4" />
                        </div>
                      </TableHead>
                      <TableHead
                        className="cursor-pointer hover:bg-muted/50"
                        onClick={() => handleSort("errorRate")}
                      >
                        <div className="flex items-center gap-2">
                          Error Rate
                          <ArrowUpDown className="size-4" />
                        </div>
                      </TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {sortedEndpoints.map((endpoint, index) => (
                      <TableRow
                        key={`${endpoint.path}-${index}`}
                        className="cursor-pointer hover:bg-muted/50"
                      >
                        <TableCell className="font-mono text-sm">
                          <div>
                            <Badge
                              variant="outline"
                              className="mr-2 font-normal"
                            >
                              {endpoint.method}
                            </Badge>
                            {endpoint.path}
                          </div>
                        </TableCell>
                        <TableCell>
                          {endpoint.requests.toLocaleString()}
                        </TableCell>
                        <TableCell>
                          {endpoint.avgResponseTime.toFixed(0)}ms
                        </TableCell>
                        <TableCell>
                          <Badge
                            variant={
                              endpoint.errorRate > 5
                                ? "destructive"
                                : endpoint.errorRate > 2
                                ? "secondary"
                                : "default"
                            }
                          >
                            {endpoint.errorRate.toFixed(1)}%
                          </Badge>
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </div>
            </CardContent>
          </Card>
        </div>
      </div>

      {/* Raw Data Modal */}
      {selectedMetric && (
        <RawDataModal
          metric={selectedMetric}
          data={data}
          onClose={() => setSelectedMetric(null)}
        />
      )}
    </div>
  );
}

// MetricCard Component
interface MetricCardProps {
  title: string;
  value: string;
  trend: { change: number; direction: "up" | "down" };
  icon: React.ReactNode;
  color: "blue" | "green" | "yellow" | "red" | "purple" | "orange";
  tooltip: string;
  summary: string;
  onClick: () => void;
}

function MetricCard({
  title,
  value,
  trend,
  icon,
  color,
  tooltip,
  summary,
  onClick,
}: MetricCardProps) {
  const colorClasses = {
    blue: "text-blue-600 bg-blue-50 dark:bg-blue-950",
    green: "text-green-600 bg-green-50 dark:bg-green-950",
    yellow: "text-yellow-600 bg-yellow-50 dark:bg-yellow-950",
    red: "text-red-600 bg-red-50 dark:bg-red-950",
    purple: "text-purple-600 bg-purple-50 dark:bg-purple-950",
    orange: "text-orange-600 bg-orange-50 dark:bg-orange-950",
  };

  return (
    <Card
      className="cursor-pointer hover:shadow-lg transition-shadow"
      onClick={onClick}
    >
      <CardContent className="p-6">
        <div className="flex items-start justify-between">
          <div className="flex-1">
            <div className="flex items-center gap-2 mb-2">
              <p className="text-sm font-medium text-muted-foreground">
                {title}
              </p>
              <TooltipProvider>
                <UITooltip>
                  <TooltipTrigger asChild>
                    <HelpCircle className="size-3.5 text-muted-foreground" />
                  </TooltipTrigger>
                  <TooltipContent className="max-w-xs">
                    <p className="text-xs">{tooltip}</p>
                  </TooltipContent>
                </UITooltip>
              </TooltipProvider>
            </div>
            <p className="text-2xl font-bold mb-1">{value}</p>
            <div className="flex items-center gap-2">
              <div
                className={`flex items-center gap-1 text-xs ${
                  trend.direction === "up" ? "text-green-600" : "text-red-600"
                }`}
              >
                {trend.direction === "up" ? (
                  <TrendingUp className="size-3" />
                ) : (
                  <TrendingDown className="size-3" />
                )}
                {trend.change}%
              </div>
              <p className="text-xs text-muted-foreground">{summary}</p>
            </div>
          </div>
          <div className={`p-3 rounded-lg ${colorClasses[color]}`}>{icon}</div>
        </div>
      </CardContent>
    </Card>
  );
}

// Raw Data Modal Component
interface RawDataModalProps {
  metric: string;
  data: AnalyticsData;
  onClose: () => void;
}

function RawDataModal({ metric, data, onClose }: RawDataModalProps) {
  const rawData = JSON.stringify(data.metrics, null, 2);

  const handleCopy = () => {
    navigator.clipboard.writeText(rawData);
  };

  return (
    <Dialog open={true} onOpenChange={onClose}>
      <DialogContent className="max-w-2xl max-h-[80vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>Raw Data - {metric}</DialogTitle>
          <DialogDescription>JSON response • Developer view</DialogDescription>
        </DialogHeader>
        <pre className="bg-muted p-4 rounded-lg overflow-x-auto text-xs">
          {rawData}
        </pre>
        <div className="flex justify-end gap-2">
          <Button variant="outline" onClick={handleCopy} className="gap-2">
            <Copy className="size-4" />
            Copy JSON
          </Button>
          <Button onClick={onClose}>Close</Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}
