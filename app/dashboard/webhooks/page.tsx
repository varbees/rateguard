"use client";

import { useState } from "react";
import { WebhookStats, WebhookWorkerMetrics } from "./components/WebhookStats";
import { WebhookEventLog } from "./components/WebhookEventLog";
import { CreateTestWebhook } from "./components/CreateTestWebhook";
import { DeliveryStatusBadge } from "./components/DeliveryStatusBadge";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Separator } from "@/components/ui/separator";
import { Filter, X, Webhook } from "lucide-react";

export default function WebhooksPage() {
  const [statusFilter, setStatusFilter] = useState<string>("");
  const [sourceFilter, setSourceFilter] = useState<string>("");
  const [showFilters, setShowFilters] = useState(false);

  const hasActiveFilters = statusFilter || sourceFilter;

  const clearFilters = () => {
    setStatusFilter("");
    setSourceFilter("");
  };

  return (
    <div className="flex flex-col gap-6 p-4 md:p-6 lg:p-8">
      {/* Header */}
      <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h1 className="text-3xl font-bold tracking-tight flex items-center gap-2">
            <Webhook className="h-8 w-8 text-primary" />
            Webhooks
          </h1>
          <p className="text-muted-foreground mt-1">
            Monitor and manage webhook event deliveries
          </p>
        </div>
        <div className="flex items-center gap-2">
          <Button
            variant="outline"
            size="sm"
            onClick={() => setShowFilters(!showFilters)}
            className="sm:hidden"
          >
            <Filter className="h-4 w-4 mr-2" />
            Filters
            {hasActiveFilters && (
              <span className="ml-2 flex h-2 w-2 rounded-full bg-primary" />
            )}
          </Button>
          <CreateTestWebhook />
        </div>
      </div>

      {/* Stats Overview */}
      <WebhookStats />

      {/* Worker Metrics */}
      <WebhookWorkerMetrics />

      <Separator />

      {/* Filters Section */}
      <div className={showFilters ? "block" : "hidden sm:block"}>
        <Card className="p-4">
          <div className="flex items-center justify-between mb-4">
            <div className="flex items-center gap-2">
              <Filter className="h-4 w-4 text-muted-foreground" />
              <h3 className="font-semibold">Filters</h3>
            </div>
            {hasActiveFilters && (
              <Button
                variant="ghost"
                size="sm"
                onClick={clearFilters}
                className="h-8"
              >
                <X className="h-4 w-4 mr-1" />
                Clear
              </Button>
            )}
          </div>

          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
            {/* Status Filter */}
            <div className="space-y-2">
              <Label htmlFor="status-filter">Status</Label>
              <Select value={statusFilter || "all"} onValueChange={(value) => setStatusFilter(value === "all" ? "" : value)}>
                <SelectTrigger id="status-filter">
                  <SelectValue placeholder="All statuses" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">All statuses</SelectItem>
                  <SelectItem value="pending">Pending</SelectItem>
                  <SelectItem value="processing">Processing</SelectItem>
                  <SelectItem value="delivered">Delivered</SelectItem>
                  <SelectItem value="failed">Failed</SelectItem>
                  <SelectItem value="dead_letter">Dead Letter</SelectItem>
                </SelectContent>
              </Select>
            </div>

            {/* Source Filter */}
            <div className="space-y-2">
              <Label htmlFor="source-filter">Source</Label>
              <Input
                id="source-filter"
                placeholder="e.g., stripe, github"
                value={sourceFilter}
                onChange={(e) => setSourceFilter(e.target.value)}
                className="h-10"
              />
            </div>

            {/* Status Legend */}
            <div className="space-y-2 sm:col-span-2">
              <Label>Status Legend</Label>
              <div className="flex flex-wrap gap-2">
                <DeliveryStatusBadge status="pending" />
                <DeliveryStatusBadge status="processing" />
                <DeliveryStatusBadge status="delivered" />
                <DeliveryStatusBadge status="failed" />
                <DeliveryStatusBadge status="dead_letter" />
              </div>
            </div>
          </div>
        </Card>
      </div>

      {/* Event Log */}
      <div>
        <div className="flex items-center justify-between mb-4">
          <h2 className="text-xl font-semibold">Event Log</h2>
          {hasActiveFilters && (
            <p className="text-sm text-muted-foreground">
              Filtered results
            </p>
          )}
        </div>
        <WebhookEventLog
          statusFilter={statusFilter || undefined}
          sourceFilter={sourceFilter || undefined}
        />
      </div>
    </div>
  );
}
