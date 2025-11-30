"use client";

import { useState, useMemo } from "react";
import { useRouter } from "next/navigation";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { apiConfigAPI, APIConfig } from "@/lib/api";
import { Button } from "@/components/ui/button";
import { Plus, Lock } from "lucide-react";
import { toasts, handleApiError } from "@/lib/toast";
import { useUser } from "@/lib/hooks/use-user";
import {
  APIListWithStatus,
  SearchAndFilterBar,
  BulkActionsToolbar,
  EmptyStateView,
  LimitReachedState,
  PlanStatusBanner,
  SkeletonAPITable,
} from "@/components/dashboard";
import { FilterState } from "@/components/dashboard/SearchAndFilterBar";
import { toast } from "@/lib/toast";

export default function APIsPage() {
  const router = useRouter();
  const queryClient = useQueryClient();
  const { user, hasAccess } = useUser();

  // State
  const [searchQuery, setSearchQuery] = useState("");
  const [selectedAPIs, setSelectedAPIs] = useState<Set<string>>(new Set());
  const [filters, setFilters] = useState<FilterState>({
    status: { active: false, paused: false },
    health: { healthy: false, degraded: false, down: false },
  });

  // Data Fetching
  const { data: apis, isLoading, error } = useQuery({
    queryKey: ["apis"],
    queryFn: apiConfigAPI.list,
  });

  // Mutations
  const deleteMutation = useMutation({
    mutationFn: apiConfigAPI.delete,
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["apis"] });
      toasts.api.deleted("API");
      setSelectedAPIs(new Set()); // Clear selection
    },
    onError: (error: Error) => {
      handleApiError(error, "Failed to delete API");
    },
  });

  const toggleMutation = useMutation({
    mutationFn: async ({ id, enabled }: { id: string; enabled: boolean }) => {
      return apiConfigAPI.update(id, { enabled });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["apis"] });
      toast.success("API status updated");
    },
    onError: (error: Error) => {
      handleApiError(error, "Failed to update API status");
    },
  });

  // Derived State
  const canCreate = useMemo(() => {
    if (!user || !apis) return false;
    // Check plan limits
    const limit = user.planLimits.maxApis;
    return apis.length < limit;
  }, [user, apis]);

  const filteredAPIs = useMemo(() => {
    if (!apis) return [];
    
    return apis.filter((api) => {
      // Search
      const matchesSearch = 
        api.name.toLowerCase().includes(searchQuery.toLowerCase()) ||
        api.target_url.toLowerCase().includes(searchQuery.toLowerCase());
      
      if (!matchesSearch) return false;

      // Status Filter
      if (filters.status.active && !api.enabled) return false;
      if (filters.status.paused && api.enabled) return false;

      // Note: Health filtering would require joining with status data
      // which is handled inside APIListWithStatus for display.
      // For strict filtering, we'd need to lift that state up or 
      // pass the filter down to the list component.
      // For now, we'll implement basic status filtering here.

      return true;
    });
  }, [apis, searchQuery, filters]);

  // Handlers
  const handleCreate = () => {
    if (canCreate) {
      router.push("/dashboard/apis/new");
    }
  };

  const handleDelete = (id: string) => {
    if (confirm("Are you sure you want to delete this API configuration?")) {
      deleteMutation.mutate(id);
    }
  };

  const handleToggleStatus = (api: APIConfig) => {
    toggleMutation.mutate({ id: api.id, enabled: !api.enabled });
  };

  const handleBulkDelete = () => {
    if (confirm(`Are you sure you want to delete ${selectedAPIs.size} APIs?`)) {
      // In a real app, we'd have a bulk delete endpoint
      // For now, we'll just delete them one by one (not ideal but works)
      selectedAPIs.forEach(id => deleteMutation.mutate(id));
    }
  };

  const handleBulkPause = () => {
    selectedAPIs.forEach(id => toggleMutation.mutate({ id, enabled: false }));
  };

  const handleBulkActivate = () => {
    selectedAPIs.forEach(id => toggleMutation.mutate({ id, enabled: true }));
  };

  // Render
  if (isLoading) {
    return (
      <div className="space-y-6">
        <div className="flex justify-between items-center">
          <div className="h-8 w-48 bg-muted animate-pulse rounded" />
          <div className="h-10 w-32 bg-muted animate-pulse rounded" />
        </div>
        <SkeletonAPITable />
      </div>
    );
  }

  if (error) {
    return (
      <div className="py-12 text-center">
        <h3 className="font-semibold mb-2">Failed to load APIs</h3>
        <p className="text-muted-foreground mb-4">
          {error instanceof Error ? error.message : "Unknown error"}
        </p>
        <Button onClick={() => queryClient.invalidateQueries({ queryKey: ["apis"] })}>
          Retry
        </Button>
      </div>
    );
  }

  // Empty State (First time user)
  if (!apis || apis.length === 0) {
    return <EmptyStateView />;
  }

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h1 className="text-3xl font-bold text-foreground flex items-center gap-3">
            Your API Proxies
            <span className="text-sm font-normal text-muted-foreground bg-muted px-2 py-1 rounded-full">
              {apis.length} / {user?.planLimits.maxApis === Infinity ? '∞' : user?.planLimits.maxApis}
            </span>
          </h1>
          <p className="text-muted-foreground mt-1">
            Monitor and manage your protected API endpoints
          </p>
        </div>
        <Button
          onClick={handleCreate}
          disabled={!canCreate}
          className={!canCreate ? "opacity-80" : ""}
        >
          {canCreate ? (
            <><Plus className="w-4 h-4 mr-2" /> Create API</>
          ) : (
            <><Lock className="w-4 h-4 mr-2" /> Limit Reached</>
          )}
        </Button>
      </div>

      {/* Plan Status Banner */}
      {user && <PlanStatusBanner />}

      {/* Limit Reached State (if at limit and trying to view list) */}
      {!canCreate && apis.length > 0 && (
        // Optional: We could show a banner here instead of a full state
        // or just rely on the disabled button + PlanStatusBanner
        null
      )}

      {/* Search & Filter */}
      <SearchAndFilterBar
        searchQuery={searchQuery}
        onSearchChange={setSearchQuery}
        filters={filters}
        onFilterChange={setFilters}
        totalResults={filteredAPIs.length}
      />

      {/* Bulk Actions (Pro+) */}
      {hasAccess('pro') && (
        <BulkActionsToolbar
          selectedCount={selectedAPIs.size}
          onBulkDelete={handleBulkDelete}
          onBulkPause={handleBulkPause}
          onBulkActivate={handleBulkActivate}
          onClearSelection={() => setSelectedAPIs(new Set())}
        />
      )}

      {/* Main List */}
      <APIListWithStatus
        apis={filteredAPIs}
        loading={isLoading}
        onSelectAPI={(id: string) => {
          const newSelected = new Set(selectedAPIs);
          if (newSelected.has(id)) {
            newSelected.delete(id);
          } else {
            newSelected.add(id);
          }
          setSelectedAPIs(newSelected);
        }}
        onToggleSelection={(id: string) => {
          const newSelected = new Set(selectedAPIs);
          if (newSelected.has(id)) {
            newSelected.delete(id);
          } else {
            newSelected.add(id);
          }
          setSelectedAPIs(newSelected);
        }}
        selectedIds={selectedAPIs}
        canBulkAction={hasAccess('pro')}
        onDelete={(api) => handleDelete(api.id)}
        onToggleStatus={handleToggleStatus}
        onEdit={(api) => router.push(`/dashboard/apis/${api.id}/edit`)}
        onAdd={handleCreate}
      />
    </div>
  );
}
