"use client";

import * as React from "react";
import { EmptyState } from "./EmptyState";
import { Plus, FileText, BarChart3, Zap } from "lucide-react";

/**
 * Pre-configured empty states for common scenarios
 */

interface NewUserDashboardProps {
  onAddAPI: () => void;
}

export function NewUserDashboard({ onAddAPI }: NewUserDashboardProps) {
  return (
    <EmptyState
      emoji="👋"
      title="Welcome to RateGuard!"
      description="Get started by adding your first API to protect. Configure rate limits and get your proxy URL in seconds."
      action={{
        label: "Add Your First API",
        onClick: onAddAPI,
        icon: Plus,
      }}
      secondaryAction={{
        label: "View Documentation",
        onClick: () => window.open("/docs", "_blank"),
      }}
    />
  );
}

interface NoAnalyticsDataProps {
  onViewDocs: () => void;
}

export function NoAnalyticsData({ onViewDocs }: NoAnalyticsDataProps) {
  return (
    <EmptyState
      emoji="📊"
      title="No Data Yet"
      description="Send your first request to see analytics here. Once you start making requests through your proxy, this dashboard will come alive with insights."
      action={{
        label: "View Integration Guide",
        onClick: onViewDocs,
        icon: FileText,
      }}
      compact
    />
  );
}

interface NoAPIsConfiguredProps {
  onAddAPI: () => void;
  onViewDocs?: () => void;
}

export function NoAPIsConfigured({
  onAddAPI,
  onViewDocs,
}: NoAPIsConfiguredProps) {
  return (
    <EmptyState
      emoji="🚀"
      title="Start by Adding an API"
      description="Configure rate limits and get your proxy URL in seconds. Protect your APIs with enterprise-grade rate limiting and analytics."
      action={{
        label: "Add API Configuration",
        onClick: onAddAPI,
        icon: Plus,
      }}
      secondaryAction={
        onViewDocs
          ? {
              label: "View Docs",
              onClick: onViewDocs,
            }
          : undefined
      }
    />
  );
}

interface NoRequestsYetProps {
  apiName?: string;
}

export function NoRequestsYet({ apiName }: NoRequestsYetProps) {
  return (
    <EmptyState
      icon={BarChart3}
      title={apiName ? `No Requests for ${apiName}` : "No Recent Activity"}
      description={
        apiName
          ? "This API hasn't received any requests yet. Start sending requests to see them tracked here in real-time."
          : "API requests will appear here as they come in. Start making requests to see them tracked in real-time."
      }
      compact
    />
  );
}

interface NoSearchResultsProps {
  query: string;
  onClear: () => void;
}

export function NoSearchResults({ query, onClear }: NoSearchResultsProps) {
  return (
    <EmptyState
      emoji="🔍"
      title="No Results Found"
      description={`We couldn't find anything matching "${query}". Try adjusting your search terms.`}
      action={{
        label: "Clear Search",
        onClick: onClear,
      }}
      compact
    />
  );
}

interface ConnectionErrorProps {
  onRetry: () => void;
  error?: string;
}

export function ConnectionError({ onRetry, error }: ConnectionErrorProps) {
  return (
    <EmptyState
      emoji="⚠️"
      title="Connection Error"
      description={
        error ||
        "We're having trouble connecting to the server. Please check your connection and try again."
      }
      action={{
        label: "Retry Connection",
        onClick: onRetry,
      }}
      compact
    />
  );
}

interface MaintenanceModeProps {
  estimatedTime?: string;
}

export function MaintenanceMode({ estimatedTime }: MaintenanceModeProps) {
  return (
    <EmptyState
      emoji="🔧"
      title="System Maintenance"
      description={
        estimatedTime
          ? `We're performing scheduled maintenance. Expected completion: ${estimatedTime}`
          : "We're performing scheduled maintenance. Please check back shortly."
      }
      compact
    />
  );
}

interface NoStreamingDataProps {
  onConfigure: () => void;
}

export function NoStreamingData({ onConfigure }: NoStreamingDataProps) {
  return (
    <EmptyState
      icon={Zap}
      title="No Streaming Requests Yet"
      description="Start using streaming endpoints to see real-time metrics, cost analysis, and performance data here."
      action={{
        label: "Configure Streaming",
        onClick: onConfigure,
        icon: Zap,
      }}
      compact
    />
  );
}
