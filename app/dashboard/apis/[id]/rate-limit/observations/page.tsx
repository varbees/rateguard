"use client";

import * as React from "react";
import { useParams, useRouter } from "next/navigation";
import { useQuery } from "@tanstack/react-query";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { apiClient } from "@/lib/api";
import {
  Breadcrumb,
  BreadcrumbItem,
  BreadcrumbLink,
  BreadcrumbList,
  BreadcrumbPage,
  BreadcrumbSeparator,
} from "@/components/ui/breadcrumb";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { ArrowLeft, Loader2, TrendingUp, AlertCircle } from "lucide-react";

interface RateLimitObservation {
  id: string;
  limit_per_window?: number;
  window_seconds?: number;
  source_header: string;
  observed_at: string;
  response_status: number;
}

export default function RateLimitObservationsPage() {
  const params = useParams();
  const router = useRouter();
  const apiId = params.id as string;

  const { data: observations, isLoading } = useQuery({
    queryKey: ["rate-limit-observations", apiId],
    queryFn: async () => {
      const response = await apiClient.getRateLimitObservations(apiId);
      return response as RateLimitObservation[];
    },
  });

  const { data: api } = useQuery({
    queryKey: ["api", apiId],
    queryFn: () => apiClient.getAPIConfig(apiId),
  });

  const formatDate = (dateString: string) => {
    return new Date(dateString).toLocaleString();
  };

  const formatWindow = (seconds?: number) => {
    if (!seconds) return "N/A";
    if (seconds === 1) return "1 second";
    if (seconds === 60) return "1 minute";
    if (seconds === 3600) return "1 hour";
    if (seconds === 86400) return "1 day";
    if (seconds < 60) return `${seconds} seconds`;
    if (seconds < 3600) return `${Math.floor(seconds / 60)} minutes`;
    if (seconds < 86400) return `${Math.floor(seconds / 3600)} hours`;
    return `${Math.floor(seconds / 86400)} days`;
  };

  return (
    <div className="container mx-auto p-6 space-y-6">
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
            <BreadcrumbLink href={`/dashboard/apis/${apiId}`}>
              {api?.name || "API"}
            </BreadcrumbLink>
          </BreadcrumbItem>
          <BreadcrumbSeparator />
          <BreadcrumbItem>
            <BreadcrumbPage>Rate Limit Observations</BreadcrumbPage>
          </BreadcrumbItem>
        </BreadcrumbList>
      </Breadcrumb>

      {/* Header */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-4">
          <Button variant="ghost" size="sm" onClick={() => router.back()}>
            <ArrowLeft className="h-4 w-4 mr-2" />
            Back
          </Button>
          <div>
            <h1 className="text-3xl font-bold">Rate Limit Observations</h1>
            <p className="text-muted-foreground mt-1">
              Historical rate limit data detected from API responses
            </p>
          </div>
        </div>
      </div>

      {/* Observations Table */}
      <Card className="p-6">
        {isLoading ? (
          <div className="flex items-center justify-center h-64">
            <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
          </div>
        ) : !observations || observations.length === 0 ? (
          <div className="flex flex-col items-center justify-center h-64 text-center">
            <TrendingUp className="h-12 w-12 text-muted-foreground mb-4" />
            <h3 className="text-lg font-semibold mb-2">No Observations Yet</h3>
            <p className="text-sm text-muted-foreground max-w-md">
              Rate limit observations will appear here when RateGuard detects
              429 responses with rate limit headers from your API.
            </p>
          </div>
        ) : (
          <div>
            <div className="flex items-center gap-2 mb-4">
              <AlertCircle className="h-5 w-5 text-blue-600" />
              <p className="text-sm text-muted-foreground">
                Showing {observations.length} most recent observation
                {observations.length !== 1 ? "s" : ""}
              </p>
            </div>

            <div className="rounded-md border overflow-x-auto">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Observed At</TableHead>
                    <TableHead>Status</TableHead>
                    <TableHead>Source Header</TableHead>
                    <TableHead>Limit</TableHead>
                    <TableHead>Window</TableHead>
                    <TableHead>Rate</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {observations.map((obs) => (
                    <TableRow key={obs.id}>
                      <TableCell className="font-mono text-xs">
                        {formatDate(obs.observed_at)}
                      </TableCell>
                      <TableCell>
                        <Badge
                          variant={
                            obs.response_status === 429
                              ? "destructive"
                              : "secondary"
                          }
                        >
                          {obs.response_status}
                        </Badge>
                      </TableCell>
                      <TableCell className="font-mono text-xs">
                        {obs.source_header}
                      </TableCell>
                      <TableCell className="font-semibold">
                        {obs.limit_per_window?.toLocaleString() || "N/A"}
                      </TableCell>
                      <TableCell>{formatWindow(obs.window_seconds)}</TableCell>
                      <TableCell className="text-sm text-muted-foreground">
                        {obs.limit_per_window && obs.window_seconds ? (
                          <>
                            {(
                              obs.limit_per_window / obs.window_seconds
                            ).toFixed(2)}{" "}
                            req/s
                          </>
                        ) : (
                          "N/A"
                        )}
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>
          </div>
        )}
      </Card>

      {/* Info Card */}
      <Card className="p-6 bg-blue-50 dark:bg-blue-950/20 border-blue-200">
        <div className="flex gap-3">
          <TrendingUp className="h-5 w-5 text-blue-600 mt-0.5 flex-shrink-0" />
          <div>
            <h3 className="font-semibold mb-2">
              How Rate Limit Discovery Works
            </h3>
            <div className="text-sm text-muted-foreground space-y-2">
              <p>
                RateGuard automatically observes rate limit information from
                HTTP headers when your API returns 429 (Too Many Requests)
                responses.
              </p>
              <p>
                Common headers parsed:{" "}
                <code className="px-1 py-0.5 bg-white dark:bg-gray-800 rounded">
                  X-RateLimit-Limit
                </code>
                ,{" "}
                <code className="px-1 py-0.5 bg-white dark:bg-gray-800 rounded">
                  X-RateLimit-Remaining
                </code>
                ,{" "}
                <code className="px-1 py-0.5 bg-white dark:bg-gray-800 rounded">
                  Retry-After
                </code>
              </p>
              <p>
                These observations are analyzed to provide intelligent rate
                limit suggestions based on your actual API usage patterns.
              </p>
            </div>
          </div>
        </div>
      </Card>
    </div>
  );
}
