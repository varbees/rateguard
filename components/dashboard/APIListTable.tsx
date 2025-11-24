"use client";

import * as React from "react";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import {
  MoreVertical,
  Plus,
  Play,
  Pause,
  Edit,
  BarChart3,
  Trash2,
  Server,
} from "lucide-react";
import { APIConfig } from "@/lib/api";

interface APIListTableProps {
  apis: APIConfig[];
  loading?: boolean;
  onAdd?: () => void;
  onEdit?: (api: APIConfig) => void;
  onViewStats?: (api: APIConfig) => void;
  onToggleStatus?: (api: APIConfig) => void;
  onDelete?: (api: APIConfig) => void;
}

function TableSkeleton() {
  return (
    <div className="space-y-3">
      {[1, 2, 3].map((i) => (
        <div key={i} className="flex items-center gap-4 p-4 border rounded-lg">
          <Skeleton className="h-10 w-10 rounded-full" />
          <div className="flex-1 space-y-2">
            <Skeleton className="h-4 w-32" />
            <Skeleton className="h-3 w-48" />
          </div>
          <Skeleton className="h-6 w-16" />
          <Skeleton className="h-6 w-20" />
          <Skeleton className="h-8 w-8" />
        </div>
      ))}
    </div>
  );
}

function EmptyAPIState({ onAdd }: { onAdd?: () => void }) {
  return (
    <div className="flex flex-col items-center justify-center py-16 text-center">
      <div className="p-4 rounded-full bg-primary/10 mb-4">
        <Server className="size-12 text-primary" />
      </div>
      <h3 className="text-xl font-semibold mb-2">Add Your First API</h3>
      <p className="text-muted-foreground max-w-md mb-6">
        Start protecting your APIs with enterprise-grade rate limiting,
        analytics, and security. It only takes a minute to set up.
      </p>
      <Button onClick={onAdd} size="lg" className="gap-2">
        <Plus className="size-4" />
        Add API Configuration
      </Button>
    </div>
  );
}

export function APIListTable({
  apis,
  loading = false,
  onAdd,
  onEdit,
  onViewStats,
  onToggleStatus,
  onDelete,
}: APIListTableProps) {
  if (loading) {
    return (
      <Card className="border-2">
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Server className="size-5 text-primary" />
            Your APIs
          </CardTitle>
          <CardDescription>
            Manage your API configurations and view their status
          </CardDescription>
        </CardHeader>
        <CardContent>
          <TableSkeleton />
        </CardContent>
      </Card>
    );
  }

  if (apis.length === 0) {
    return (
      <Card className="border-2">
        <CardContent className="p-0">
          <EmptyAPIState onAdd={onAdd} />
        </CardContent>
      </Card>
    );
  }

  return (
    <Card className="border-2">
      <CardHeader>
        <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
          <div>
            <CardTitle className="flex items-center gap-2">
              <Server className="size-5 text-primary" />
              Your APIs
            </CardTitle>
            <CardDescription className="mt-1.5">
              Manage and monitor all your protected API endpoints
            </CardDescription>
          </div>
          <Button onClick={onAdd} className="gap-2 w-full sm:w-auto">
            <Plus className="size-4" />
            Add API
          </Button>
        </div>
      </CardHeader>
      <CardContent>
        <div className="overflow-x-auto">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>API Name</TableHead>
                <TableHead className="hidden md:table-cell">
                  Target URL
                </TableHead>
                <TableHead>Status</TableHead>
                <TableHead className="hidden lg:table-cell">
                  Rate Limit
                </TableHead>
                <TableHead className="text-right">Actions</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {apis.map((api) => (
                <TableRow
                  key={api.id}
                  className="group hover:bg-muted/50 cursor-pointer"
                  onClick={() => onViewStats?.(api)}
                >
                  <TableCell>
                    <div>
                      <div className="font-medium hover:text-primary transition-colors">
                        {api.name}
                      </div>
                      <div className="text-xs text-muted-foreground md:hidden">
                        {api.target_url}
                      </div>
                    </div>
                  </TableCell>
                  <TableCell className="hidden md:table-cell">
                    <code className="text-xs bg-muted px-2 py-1 rounded">
                      {api.target_url}
                    </code>
                  </TableCell>
                  <TableCell>
                    {api.enabled ? (
                      <Badge
                        variant="default"
                        className="gap-1 bg-green-600 hover:bg-green-700"
                      >
                        <Play className="size-3" />
                        Active
                      </Badge>
                    ) : (
                      <Badge variant="secondary" className="gap-1">
                        <Pause className="size-3" />
                        Paused
                      </Badge>
                    )}
                  </TableCell>
                  <TableCell className="hidden lg:table-cell">
                    <div className="flex flex-col gap-1">
                      <span className="text-sm font-medium">
                        {api.rate_limit_per_second} req/s
                      </span>
                      <span className="text-xs text-muted-foreground">
                        Burst: {api.burst_size}
                      </span>
                    </div>
                  </TableCell>
                  <TableCell
                    className="text-right"
                    onClick={(e) => e.stopPropagation()}
                  >
                    <DropdownMenu>
                      <DropdownMenuTrigger asChild>
                        <Button
                          variant="ghost"
                          size="sm"
                          className="h-8 w-8 p-0 opacity-0 group-hover:opacity-100 transition-opacity"
                        >
                          <MoreVertical className="size-4" />
                        </Button>
                      </DropdownMenuTrigger>
                      <DropdownMenuContent align="end">
                        <DropdownMenuItem
                          onClick={(e) => {
                            e.stopPropagation();
                            onViewStats?.(api);
                          }}
                        >
                          <BarChart3 className="size-4 mr-2" />
                          View Statistics
                        </DropdownMenuItem>
                        <DropdownMenuItem
                          onClick={(e) => {
                            e.stopPropagation();
                            onEdit?.(api);
                          }}
                        >
                          <Edit className="size-4 mr-2" />
                          Edit Configuration
                        </DropdownMenuItem>
                        <DropdownMenuItem
                          onClick={(e) => {
                            e.stopPropagation();
                            onToggleStatus?.(api);
                          }}
                        >
                          {api.enabled ? (
                            <>
                              <Pause className="size-4 mr-2" />
                              Pause API
                            </>
                          ) : (
                            <>
                              <Play className="size-4 mr-2" />
                              Activate API
                            </>
                          )}
                        </DropdownMenuItem>
                        <DropdownMenuItem
                          onClick={(e) => {
                            e.stopPropagation();
                            onDelete?.(api);
                          }}
                          className="text-destructive focus:text-destructive"
                        >
                          <Trash2 className="size-4 mr-2" />
                          Delete API
                        </DropdownMenuItem>
                      </DropdownMenuContent>
                    </DropdownMenu>
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </div>
      </CardContent>
    </Card>
  );
}
