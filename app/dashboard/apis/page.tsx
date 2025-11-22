"use client";

import { useState, useEffect } from "react";
import { useSearchParams } from "next/navigation";
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
import { Plus, Trash2, Edit, Power, ExternalLink } from "lucide-react";
import { toast } from "sonner";
import APIConfigModal from "@/components/dashboard/APIConfigModal";
import APIProxyInfo from "@/components/dashboard/APIProxyInfo";

export default function APIsPage() {
  const searchParams = useSearchParams();
  const shouldAutoOpen = searchParams.get("modal") === "open";

  const [isModalOpen, setIsModalOpen] = useState(shouldAutoOpen);
  const [editingAPI, setEditingAPI] = useState<APIConfig | undefined>();
  const [selectedAPI, setSelectedAPI] = useState<APIConfig | null>(null);
  const queryClient = useQueryClient();

  // Clean up URL parameter after initial mount if modal was auto-opened
  useEffect(() => {
    if (shouldAutoOpen) {
      window.history.replaceState({}, "", "/dashboard/apis");
    }
  }, [shouldAutoOpen]);

  const { data: apis, isLoading } = useQuery({
    queryKey: ["apis"],
    queryFn: apiConfigAPI.list,
  });

  const deleteMutation = useMutation({
    mutationFn: apiConfigAPI.delete,
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["apis"] });
      toast.success("API configuration deleted");
    },
    onError: (error: Error) => {
      toast.error(`Failed to delete API: ${error.message}`);
    },
  });

  const handleEdit = (api: APIConfig) => {
    setEditingAPI(api);
    setIsModalOpen(true);
  };

  const handleDelete = (id: string) => {
    if (confirm("Are you sure you want to delete this API configuration?")) {
      deleteMutation.mutate(id);
    }
  };

  const handleCloseModal = () => {
    setIsModalOpen(false);
    setEditingAPI(undefined);
  };

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-bold text-white">API Configurations</h1>
          <p className="text-slate-400 mt-1">
            Manage your API endpoints and rate limits
          </p>
        </div>
        <Button
          onClick={() => setIsModalOpen(true)}
          className="bg-blue-500 hover:bg-blue-600"
        >
          <Plus className="w-4 h-4 mr-2" />
          Add API
        </Button>
      </div>

      {/* APIs Table */}
      <Card className="bg-slate-900 border-slate-800">
        <CardHeader>
          <CardTitle className="text-white">Your APIs</CardTitle>
        </CardHeader>
        <CardContent>
          {isLoading ? (
            <p className="text-slate-400">Loading...</p>
          ) : apis && apis.length > 0 ? (
            <Table>
              <TableHeader>
                <TableRow className="border-slate-800">
                  <TableHead className="text-slate-300">Name</TableHead>
                  <TableHead className="text-slate-300">Target URL</TableHead>
                  <TableHead className="text-slate-300">Rate Limit</TableHead>
                  <TableHead className="text-slate-300">Status</TableHead>
                  <TableHead className="text-slate-300">Actions</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {apis.map((api) => (
                  <TableRow key={api.id} className="border-slate-800">
                    <TableCell className="font-medium text-white">
                      {api.name}
                    </TableCell>
                    <TableCell className="text-slate-400 max-w-xs truncate">
                      {api.target_url}
                    </TableCell>
                    <TableCell className="text-slate-300">
                      <div className="flex flex-col gap-1">
                        <span className="font-medium">
                          {api.rate_limit_per_second} req/s
                        </span>
                        <span className="text-xs text-slate-500">
                          Burst: {api.burst_size}
                        </span>
                        {(api.rate_limit_per_hour > 0 ||
                          api.rate_limit_per_day > 0 ||
                          api.rate_limit_per_month > 0) && (
                          <div className="text-xs text-blue-400 mt-1">
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
                            ? "bg-green-500/10 text-green-500 border-green-500/20"
                            : "bg-slate-500/10 text-slate-500 border-slate-500/20"
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
                          onClick={() => setSelectedAPI(api)}
                          className="text-green-400 hover:text-green-300 hover:bg-green-500/10"
                          title="View proxy endpoint"
                        >
                          <ExternalLink className="w-4 h-4" />
                        </Button>
                        <Button
                          variant="ghost"
                          size="sm"
                          onClick={() => handleEdit(api)}
                          className="text-blue-400 hover:text-blue-300 hover:bg-blue-500/10"
                        >
                          <Edit className="w-4 h-4" />
                        </Button>
                        <Button
                          variant="ghost"
                          size="sm"
                          onClick={() => handleDelete(api.id)}
                          className="text-red-400 hover:text-red-300 hover:bg-red-500/10"
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
              <p className="text-slate-400 mb-4">No APIs configured yet</p>
              <Button
                onClick={() => setIsModalOpen(true)}
                className="bg-blue-500 hover:bg-blue-600"
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

      {/* API Config Modal */}
      <APIConfigModal
        isOpen={isModalOpen}
        onClose={handleCloseModal}
        api={editingAPI}
      />
    </div>
  );
}
