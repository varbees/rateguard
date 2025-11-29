"use client";

import * as React from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import {
  Alert,
  AlertDescription,
  AlertTitle,
} from "@/components/ui/alert";
import {
  Tabs,
  TabsContent,
  TabsList,
  TabsTrigger,
} from "@/components/ui/tabs";
import {
  ResponsiveContainer,
  LineChart,
  Line,
  BarChart,
  Bar,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  Legend,
} from "recharts";
import {
  DollarSign,
  AlertTriangle,
  AlertCircle,
  CheckCircle2,
  TrendingUp,
  TrendingDown,
  Sparkles,
  Settings2,
  Bell,
  BellOff,
  Save,
  RefreshCw,
} from "lucide-react";
import { apiClient } from "@/lib/api";
import { useToast } from "@/hooks/use-toast";
import { FeatureGate } from "@/components/dashboard/FeatureGate";
import { useDashboardStats } from "@/lib/hooks/use-api";

// Types
interface BudgetConfig {
  id: string;
  user_id: string;
  monthly_budget_cents: number;
  alert_threshold_pct: number;
  hard_limit_pct: number;
  notify_email: boolean;
  notify_webhook: boolean;
  webhook_url?: string;
  enabled: boolean;
  created_at: string;
  updated_at: string;
}

interface BudgetAlert {
  id: string;
  user_id: string;
  alert_type: "threshold" | "hard_limit" | "optimization";
  threshold_pct: number;
  current_spend_cents: number;
  budget_cents: number;
  suggestions?: OptimizationSuggestion[];
  acknowledged: boolean;
  acknowledged_at?: string;
  created_at: string;
}

interface OptimizationSuggestion {
  type: string;
  current_cost: number;
  projected_cost: number;
  savings: number;
  description: string;
}

export default function BudgetPage() {
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const { data: dashboardData } = useDashboardStats();

  // Form state
  const [monthlyBudget, setMonthlyBudget] = React.useState("");
  const [alertThreshold, setAlertThreshold] = React.useState("90");
  const [hardLimit, setHardLimit] = React.useState("110");
  const [notifyEmail, setNotifyEmail] = React.useState(true);
  const [notifyWebhook, setNotifyWebhook] = React.useState(false);
  const [webhookUrl, setWebhookUrl] = React.useState("");

  // Fetch budget config
  const { data: budgetConfig, isLoading: configLoading } = useQuery({
    queryKey: ["budget", "config"],
    queryFn: () => apiClient.getBudgetConfig(),
    retry: 1,
  });

  // Fetch budget alerts
  const { data: alerts, isLoading: alertsLoading } = useQuery({
    queryKey: ["budget", "alerts"],
    queryFn: () => apiClient.getBudgetAlerts(),
  });

  // Fetch cost optimizations
  const { data: optimizations, isLoading: optimizationsLoading } = useQuery({
    queryKey: ["budget", "optimizations"],
    queryFn: async () => {
      const res = await apiClient.getCostOptimizations();
      return res?.suggestions || [];
    },
  });

  // Populate form from existing config
  React.useEffect(() => {
    if (budgetConfig) {
      setMonthlyBudget((budgetConfig.monthly_budget_cents / 100).toString());
      setAlertThreshold(budgetConfig.alert_threshold_pct.toString());
      setHardLimit(budgetConfig.hard_limit_pct.toString());
      setNotifyEmail(budgetConfig.notify_email);
      setNotifyWebhook(budgetConfig.notify_webhook);
      setWebhookUrl(budgetConfig.webhook_url || "");
    }
  }, [budgetConfig]);

  // Save budget config
  const saveMutation = useMutation({
    mutationFn: async () => {
      const payload = {
        monthly_budget_cents: Math.round(parseFloat(monthlyBudget) * 100),
        alert_threshold_pct: parseInt(alertThreshold),
        hard_limit_pct: parseInt(hardLimit),
        notify_email: notifyEmail,
        notify_webhook: notifyWebhook,
        webhook_url: notifyWebhook ? webhookUrl : undefined,
        enabled: true,
      };
      await apiClient.createBudgetConfig(payload);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["budget"] });
      toast({
        title: "Budget saved",
        description: "Your budget configuration has been updated.",
      });
    },
    onError: (error: any) => {
      toast({
        title: "Failed to save budget",
        description: error.response?.data?.message || "Please try again.",
        variant: "destructive",
      });
    },
  });

  // Acknowledge alert
  const acknowledgeMutation = useMutation({
    mutationFn: (alertId: string) => apiClient.acknowledgeBudgetAlert(alertId),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["budget", "alerts"] });
      toast({
        title: "Alert acknowledged",
        description: "The alert has been marked as read.",
      });
    },
  });

  // Check Pro plan
  const isPro = dashboardData?.plan?.features?.priority_support || false;

  if (!isPro) {
    return (
      <div className="min-h-screen bg-background">
        <FeatureGate
          featureName="Budget Alerts & Cost Optimization"
          requiredPlan="pro"
          description="Set spending limits, receive automated alerts, and get AI-powered cost reduction suggestions to optimize your LLM usage."
        />
      </div>
    );
  }

  // Calculate current spend (mock - would come from actual usage)
  const currentSpendCents = budgetConfig
    ? Math.round((budgetConfig.monthly_budget_cents * 0.65)) // 65% of budget
    : 0;
  const currentSpend = currentSpendCents / 100;
  const budgetAmount = budgetConfig ? budgetConfig.monthly_budget_cents / 100 : 0;
  const spendPercentage = budgetAmount > 0 ? (currentSpend / budgetAmount) * 100 : 0;

  // Unacknowledged alerts
  const activeAlerts = alerts?.filter((a: BudgetAlert) => !a.acknowledged) || [];

  // Mock spend over time data
  const spendData = Array.from({ length: 30 }, (_, i) => ({
    day: `Day ${i + 1}`,
    spend: Math.random() * 50 + (i * 2),
    budget: budgetAmount / 30,
  }));

  return (
    <div className="min-h-screen bg-background">
      <div className="container max-w-7xl mx-auto px-4 py-8">
        {/* Header */}
        <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4 mb-8">
          <div>
            <h1 className="text-3xl font-bold tracking-tight">Budget & Cost Optimization</h1>
            <p className="text-muted-foreground mt-1">
              Manage spending limits and discover savings opportunities
            </p>
          </div>
          <div className="flex gap-2">
            <Button
              variant="outline"
              size="sm"
              onClick={() => queryClient.invalidateQueries({ queryKey: ["budget"] })}
            >
              <RefreshCw className="size-4 mr-2" />
              Refresh
            </Button>
          </div>
        </div>

        {/* Active Alerts Banner */}
        {activeAlerts.length > 0 && (
          <Alert className="mb-6 border-orange-500 bg-orange-50 dark:bg-orange-950">
            <AlertTriangle className="h-4 w-4 text-orange-600" />
            <AlertTitle className="text-orange-900 dark:text-orange-100">
              {activeAlerts.length} Active Budget Alert{activeAlerts.length > 1 ? "s" : ""}
            </AlertTitle>
            <AlertDescription className="text-orange-800 dark:text-orange-200">
              You have unacknowledged budget alerts. Review them in the Alerts tab.
            </AlertDescription>
          </Alert>
        )}

        <Tabs defaultValue="overview" className="space-y-6">
          <TabsList>
            <TabsTrigger value="overview">Overview</TabsTrigger>
            <TabsTrigger value="config">Configuration</TabsTrigger>
            <TabsTrigger value="alerts">
              Alerts
              {activeAlerts.length > 0 && (
                <Badge variant="destructive" className="ml-2">
                  {activeAlerts.length}
                </Badge>
              )}
            </TabsTrigger>
            <TabsTrigger value="optimizations">
              Optimizations
              {optimizations?.length > 0 && (
                <Badge variant="secondary" className="ml-2">
                  {optimizations.length}
                </Badge>
              )}
            </TabsTrigger>
          </TabsList>

          {/* Overview Tab */}
          <TabsContent value="overview" className="space-y-6">
            {/* Spend Summary Cards */}
            <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
              <Card>
                <CardContent className="p-6">
                  <div className="flex items-center justify-between">
                    <div>
                      <p className="text-sm font-medium text-muted-foreground">
                        Current Spend
                      </p>
                      <p className="text-2xl font-bold">
                        ${currentSpend.toFixed(2)}
                      </p>
                      <p className="text-xs text-muted-foreground mt-1">
                        {spendPercentage.toFixed(1)}% of budget
                      </p>
                    </div>
                    <div className="p-3 rounded-lg bg-blue-50 dark:bg-blue-950">
                      <DollarSign className="size-5 text-blue-600" />
                    </div>
                  </div>
                </CardContent>
              </Card>

              <Card>
                <CardContent className="p-6">
                  <div className="flex items-center justify-between">
                    <div>
                      <p className="text-sm font-medium text-muted-foreground">
                        Monthly Budget
                      </p>
                      <p className="text-2xl font-bold">
                        ${budgetAmount.toFixed(2)}
                      </p>
                      <p className="text-xs text-muted-foreground mt-1">
                        ${(budgetAmount - currentSpend).toFixed(2)} remaining
                      </p>
                    </div>
                    <div className="p-3 rounded-lg bg-green-50 dark:bg-green-950">
                      <TrendingUp className="size-5 text-green-600" />
                    </div>
                  </div>
                </CardContent>
              </Card>

              <Card>
                <CardContent className="p-6">
                  <div className="flex items-center justify-between">
                    <div>
                      <p className="text-sm font-medium text-muted-foreground">
                        Potential Savings
                      </p>
                      <p className="text-2xl font-bold">
                        ${optimizations?.reduce((sum: number, opt: any) => sum + opt.savings, 0).toFixed(2) || "0.00"}
                      </p>
                      <p className="text-xs text-muted-foreground mt-1">
                        {optimizations?.length || 0} suggestions
                      </p>
                    </div>
                    <div className="p-3 rounded-lg bg-purple-50 dark:bg-purple-950">
                      <Sparkles className="size-5 text-purple-600" />
                    </div>
                  </div>
                </CardContent>
              </Card>
            </div>

            {/* Spend Over Time Chart */}
            <Card>
              <CardHeader>
                <CardTitle>Spend Over Time</CardTitle>
                <CardDescription>
                  Daily spending vs budget target
                </CardDescription>
              </CardHeader>
              <CardContent>
                <ResponsiveContainer width="100%" height={300}>
                  <LineChart data={spendData}>
                    <CartesianGrid strokeDasharray="3 3" className="stroke-muted" />
                    <XAxis dataKey="day" tick={{ fill: "hsl(var(--muted-foreground))" }} />
                    <YAxis tick={{ fill: "hsl(var(--muted-foreground))" }} />
                    <Tooltip
                      content={({ active, payload }) => {
                        if (!active || !payload) return null;
                        const data = payload[0].payload;
                        return (
                          <div className="bg-popover p-3 rounded-lg border shadow-lg">
                            <p className="font-semibold">{data.day}</p>
                            <p className="text-sm text-blue-600">
                              Spend: ${data.spend.toFixed(2)}
                            </p>
                            <p className="text-sm text-muted-foreground">
                              Target: ${data.budget.toFixed(2)}
                            </p>
                          </div>
                        );
                      }}
                    />
                    <Legend />
                    <Line
                      type="monotone"
                      dataKey="spend"
                      stroke="hsl(var(--primary))"
                      strokeWidth={2}
                      name="Actual Spend"
                    />
                    <Line
                      type="monotone"
                      dataKey="budget"
                      stroke="hsl(var(--muted-foreground))"
                      strokeDasharray="5 5"
                      name="Budget Target"
                    />
                  </LineChart>
                </ResponsiveContainer>
              </CardContent>
            </Card>
          </TabsContent>

          {/* Configuration Tab */}
          <TabsContent value="config" className="space-y-6">
            <Card>
              <CardHeader>
                <CardTitle>Budget Configuration</CardTitle>
                <CardDescription>
                  Set your monthly spending limit and alert preferences
                </CardDescription>
              </CardHeader>
              <CardContent className="space-y-6">
                <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                  <div className="space-y-2">
                    <Label htmlFor="budget">Monthly Budget ($)</Label>
                    <Input
                      id="budget"
                      type="number"
                      placeholder="500.00"
                      value={monthlyBudget}
                      onChange={(e) => setMonthlyBudget(e.target.value)}
                    />
                    <p className="text-xs text-muted-foreground">
                      Maximum amount to spend per month
                    </p>
                  </div>

                  <div className="space-y-2">
                    <Label htmlFor="alert">Alert Threshold (%)</Label>
                    <Input
                      id="alert"
                      type="number"
                      placeholder="90"
                      value={alertThreshold}
                      onChange={(e) => setAlertThreshold(e.target.value)}
                    />
                    <p className="text-xs text-muted-foreground">
                      Notify when spending reaches this percentage
                    </p>
                  </div>

                  <div className="space-y-2">
                    <Label htmlFor="hardlimit">Hard Limit (%)</Label>
                    <Input
                      id="hardlimit"
                      type="number"
                      placeholder="110"
                      value={hardLimit}
                      onChange={(e) => setHardLimit(e.target.value)}
                    />
                    <p className="text-xs text-muted-foreground">
                      Stop processing at this percentage (safety buffer)
                    </p>
                  </div>
                </div>

                <div className="border-t pt-6 space-y-4">
                  <h3 className="font-semibold">Notifications</h3>
                  
                  <div className="flex items-center justify-between">
                    <div className="space-y-0.5">
                      <Label htmlFor="email">Email Notifications</Label>
                      <p className="text-sm text-muted-foreground">
                        Receive alerts via email
                      </p>
                    </div>
                    <Switch
                      id="email"
                      checked={notifyEmail}
                      onCheckedChange={setNotifyEmail}
                    />
                  </div>

                  <div className="flex items-center justify-between">
                    <div className="space-y-0.5">
                      <Label htmlFor="webhook">Webhook Notifications</Label>
                      <p className="text-sm text-muted-foreground">
                        Send alerts to a webhook URL
                      </p>
                    </div>
                    <Switch
                      id="webhook"
                      checked={notifyWebhook}
                      onCheckedChange={setNotifyWebhook}
                    />
                  </div>

                  {notifyWebhook && (
                    <div className="space-y-2">
                      <Label htmlFor="webhookUrl">Webhook URL</Label>
                      <Input
                        id="webhookUrl"
                        type="url"
                        placeholder="https://example.com/webhook"
                        value={webhookUrl}
                        onChange={(e) => setWebhookUrl(e.target.value)}
                      />
                    </div>
                  )}
                </div>

                <div className="flex justify-end">
                  <Button
                    onClick={() => saveMutation.mutate()}
                    disabled={saveMutation.isPending}
                  >
                    {saveMutation.isPending ? (
                      <>
                        <RefreshCw className="size-4 mr-2 animate-spin" />
                        Saving...
                      </>
                    ) : (
                      <>
                        <Save className="size-4 mr-2" />
                        Save Configuration
                      </>
                    )}
                  </Button>
                </div>
              </CardContent>
            </Card>
          </TabsContent>

          {/* Alerts Tab */}
          <TabsContent value="alerts" className="space-y-4">
            {alertsLoading ? (
              <Card>
                <CardContent className="p-8 text-center">
                  <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary mx-auto" />
                  <p className="text-sm text-muted-foreground mt-4">Loading alerts...</p>
                </CardContent>
              </Card>
            ) : alerts && alerts.length > 0 ? (
              alerts.map((alert: BudgetAlert) => (
                <Card key={alert.id} className={alert.acknowledged ? "opacity-60" : ""}>
                  <CardHeader>
                    <div className="flex items-start justify-between">
                      <div>
                        <CardTitle className="flex items-center gap-2">
                          {alert.alert_type === "threshold" && (
                            <AlertTriangle className="size-5 text-orange-500" />
                          )}
                          {alert.alert_type === "hard_limit" && (
                            <AlertCircle className="size-5 text-red-500" />
                          )}
                          {alert.alert_type === "optimization" && (
                            <Sparkles className="size-5 text-purple-500" />
                          )}
                          {alert.alert_type.charAt(0).toUpperCase() + alert.alert_type.slice(1)} Alert
                        </CardTitle>
                        <CardDescription>
                          {new Date(alert.created_at).toLocaleString()}
                        </CardDescription>
                      </div>
                      {!alert.acknowledged && (
                        <Button
                          size="sm"
                          variant="outline"
                          onClick={() => acknowledgeMutation.mutate(alert.id)}
                        >
                          <CheckCircle2 className="size-4 mr-2" />
                          Acknowledge
                        </Button>
                      )}
                    </div>
                  </CardHeader>
                  <CardContent>
                    <div className="space-y-2">
                      <div className="flex items-center justify-between text-sm">
                        <span className="text-muted-foreground">Current Spend:</span>
                        <span className="font-semibold">
                          ${(alert.current_spend_cents / 100).toFixed(2)}
                        </span>
                      </div>
                      <div className="flex items-center justify-between text-sm">
                        <span className="text-muted-foreground">Budget:</span>
                        <span className="font-semibold">
                          ${(alert.budget_cents / 100).toFixed(2)}
                        </span>
                      </div>
                      <div className="flex items-center justify-between text-sm">
                        <span className="text-muted-foreground">Threshold:</span>
                        <Badge variant="secondary">{alert.threshold_pct}%</Badge>
                      </div>
                    </div>
                  </CardContent>
                </Card>
              ))
            ) : (
              <Card>
                <CardContent className="p-8 text-center">
                  <CheckCircle2 className="size-12 text-green-500 mx-auto mb-4" />
                  <p className="font-semibold">No budget alerts</p>
                  <p className="text-sm text-muted-foreground mt-1">
                    You're staying within your budget limits.
                  </p>
                </CardContent>
              </Card>
            )}
          </TabsContent>

          {/* Optimizations Tab */}
          <TabsContent value="optimizations" className="space-y-4">
            {optimizationsLoading ? (
              <Card>
                <CardContent className="p-8 text-center">
                  <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary mx-auto" />
                  <p className="text-sm text-muted-foreground mt-4">Analyzing usage...</p>
                </CardContent>
              </Card>
            ) : optimizations && optimizations.length > 0 ? (
              optimizations.map((opt: OptimizationSuggestion, index: number) => (
                <Card key={index}>
                  <CardHeader>
                    <div className="flex items-start justify-between">
                      <div>
                        <CardTitle className="flex items-center gap-2">
                          <Sparkles className="size-5 text-purple-500" />
                          {opt.type.replace(/_/g, " ").replace(/\b\w/g, (l) => l.toUpperCase())}
                        </CardTitle>
                        <CardDescription className="mt-2">
                          {opt.description}
                        </CardDescription>
                      </div>
                      <Badge variant="secondary" className="bg-green-50 text-green-700 dark:bg-green-950">
                        Save ${opt.savings.toFixed(2)}/mo
                      </Badge>
                    </div>
                  </CardHeader>
                  <CardContent>
                    <div className="grid grid-cols-2 gap-4 text-sm">
                      <div>
                        <span className="text-muted-foreground">Current Cost:</span>
                        <p className="font-semibold">${opt.current_cost.toFixed(2)}</p>
                      </div>
                      <div>
                        <span className="text-muted-foreground">Projected Cost:</span>
                        <p className="font-semibold text-green-600">
                          ${opt.projected_cost.toFixed(2)}
                        </p>
                      </div>
                    </div>
                  </CardContent>
                </Card>
              ))
            ) : (
              <Card>
                <CardContent className="p-8 text-center">
                  <Sparkles className="size-12 text-muted-foreground mx-auto mb-4" />
                  <p className="font-semibold">No optimizations available</p>
                  <p className="text-sm text-muted-foreground mt-1">
                    We'll analyze your usage and suggest cost-saving opportunities.
                  </p>
                </CardContent>
              </Card>
            )}
          </TabsContent>
        </Tabs>
      </div>
    </div>
  );
}
