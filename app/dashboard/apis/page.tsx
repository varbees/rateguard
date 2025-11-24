"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { apiConfigAPI, APIConfig } from "@/lib/api";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import { Plus, Trash2, Edit, Power, ExternalLink, Eye } from "lucide-react";
import { toasts, handleApiError } from "@/lib/toast";
import APIProxyInfo from "@/components/dashboard/APIProxyInfo";

export default function APIsPage() {
  const router = useRouter();
  const [selectedAPI, setSelectedAPI] = useState<APIConfig | null>(null);
  const queryClient = useQueryClient();

  const { data: apis, isLoading } = useQuery({
    queryKey: ["apis"],
    queryFn: apiConfigAPI.list,
  });

  const deleteMutation = useMutation({
    mutationFn: apiConfigAPI.delete,
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["apis"] });
      toasts.api.deleted("API");
    },
    onError: (error: Error) => {
      handleApiError(error, "Failed to delete API");
    },
  });

  const handleViewDetails = (api: APIConfig) => {
    router.push(`/dashboard/apis/${api.id}`);
  };

  const handleEdit = (api: APIConfig) => {
    router.push(`/dashboard/apis/${api.id}/edit`);
  };

  const handleDelete = (id: string) => {
    if (confirm("Are you sure you want to delete this API configuration?")) {
      deleteMutation.mutate(id);
    }
  };

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-bold text-foreground">
            API Configurations
          </h1>
          <p className="text-muted-foreground mt-1">
            Manage your API endpoints and rate limits
          </p>
        </div>
        <Button
          onClick={() => router.push("/dashboard/apis/new")}
          className="bg-primary hover:bg-primary/90 text-primary-foreground"
        >
          <Plus className="w-4 h-4 mr-2" />
          Add API
        </Button>
      </div>

      {/* APIs Table */}
      <Card className="bg-card border-border">
        <CardHeader>
          <CardTitle className="text-card-foreground">Your APIs</CardTitle>
        </CardHeader>
        <CardContent>
          {isLoading ? (
            <p className="text-muted-foreground">Loading...</p>
          ) : apis && apis.length > 0 ? (
            <Table>
              <TableHeader>
                <TableRow className="border-border">
                  <TableHead className="text-muted-foreground">Name</TableHead>
                  <TableHead className="text-muted-foreground">
                    Target URL
                  </TableHead>
                  <TableHead className="text-muted-foreground">
                    Rate Limit
                  </TableHead>
                  <TableHead className="text-muted-foreground">
                    Status
                  </TableHead>
                  <TableHead className="text-muted-foreground">
                    Actions
                  </TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {apis.map((api) => (
                  <TableRow
                    key={api.id}
                    className="border-border hover:bg-muted/50 transition-colors"
                  >
                    <TableCell className="font-medium text-foreground">
                      <button
                        onClick={() => handleViewDetails(api)}
                        className="hover:text-primary hover:underline text-left"
                      >
                        {api.name}
                      </button>
                    </TableCell>
                    <TableCell className="text-muted-foreground max-w-xs truncate">
                      {api.target_url}
                    </TableCell>
                    <TableCell className="text-foreground">
                      <div className="flex flex-col gap-1">
                        <span className="font-medium">
                          {api.rate_limit_per_second} req/s
                        </span>
                        <span className="text-xs text-muted-foreground">
                          Burst: {api.burst_size}
                        </span>
                        {(api.rate_limit_per_hour > 0 ||
                          api.rate_limit_per_day > 0 ||
                          api.rate_limit_per_month > 0) && (
                          <div className="text-xs text-primary mt-1">
                            {api.rate_limit_per_hour > 0 && (
                              <div>
                                Hour: {api.rate_limit_per_hour.toLocaleString()}
                              </div>
                            )}
                            {api.rate_limit_per_day > 0 && (
                              <div>
                                Day: {api.rate_limit_per_day.toLocaleString()}
                              </div>
                            )}
                            {api.rate_limit_per_month > 0 && (
                              <div>
                                Month:{" "}
                                {api.rate_limit_per_month.toLocaleString()}
                              </div>
                            )}
                          </div>
                        )}
                      </div>
                    </TableCell>
                    <TableCell>
                      <Badge
                        variant={api.enabled ? "default" : "secondary"}
                        className={
                          api.enabled
                            ? "bg-primary/10 text-primary border-primary/20"
                            : "bg-muted text-muted-foreground border-border"
                        }
                      >
                        <Power className="w-3 h-3 mr-1" />
                        {api.enabled ? "Active" : "Inactive"}
                      </Badge>
                    </TableCell>
                    <TableCell>
                      <div className="flex gap-2">
                        <Button
                          variant="ghost"
                          size="sm"
                          onClick={() => handleViewDetails(api)}
                          className="text-blue-600 hover:text-blue-700 hover:bg-blue-50 dark:text-blue-400 dark:hover:bg-blue-950"
                          title="View API details and usage"
                          aria-label={`View details for ${api.name}`}
                        >
                          <Eye className="w-4 h-4" />
                        </Button>
                        <Button
                          variant="ghost"
                          size="sm"
                          onClick={() => setSelectedAPI(api)}
                          className="text-primary hover:text-primary/80 hover:bg-primary/10"
                          title="View proxy endpoint"
                          aria-label={`View proxy endpoint for ${api.name}`}
                        >
                          <ExternalLink className="w-4 h-4" />
                        </Button>
                        <Button
                          variant="ghost"
                          size="sm"
                          onClick={() => handleEdit(api)}
                          className="text-primary hover:text-primary/80 hover:bg-primary/10"
                          aria-label={`Edit ${api.name}`}
                        >
                          <Edit className="w-4 h-4" />
                        </Button>
                        <Button
                          variant="ghost"
                          size="sm"
                          onClick={() => handleDelete(api.id)}
                          className="text-destructive hover:text-destructive/80 hover:bg-destructive/10"
                          aria-label={`Delete ${api.name}`}
                        >
                          <Trash2 className="w-4 h-4" />
                        </Button>
                      </div>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          ) : (
            <div className="text-center py-12">
              <p className="text-muted-foreground mb-4">
                No APIs configured yet
              </p>
              <Button
                onClick={() => router.push("/dashboard/apis/new")}
                className="bg-primary hover:bg-primary/90 text-primary-foreground"
              >
                <Plus className="w-4 h-4 mr-2" />
                Add Your First API
              </Button>
            </div>
          )}
        </CardContent>
      </Card>

      {/* Proxy Info for Selected API */}
      {selectedAPI && (
        <APIProxyInfo
          apiName={selectedAPI.name}
          targetUrl={selectedAPI.target_url}
        />
      )}
    </div>
  );
}
