"use client";

import { useState } from "react";
import { APIConfig, apiConfigAPI } from "@/lib/api";
import { useQueryClient } from "@tanstack/react-query";
import { Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { toast } from "sonner";

interface APIConfigModalProps {
  isOpen: boolean;
  onClose: () => void;
  api?: APIConfig;
}

export default function APIConfigModal({
  isOpen,
  onClose,
  api,
}: APIConfigModalProps) {
  const queryClient = useQueryClient();

  const [formData, setFormData] = useState({
    name: api?.name || "",
    target_url: api?.target_url || "",
    rate_limit_per_second: api?.rate_limit_per_second || 10,
    burst_size: api?.burst_size || 20,
    timeout_seconds: api?.timeout_seconds || 30,
    retry_attempts: api?.retry_attempts || 1,
    enabled: api?.enabled ?? true,
  });

  const [loading, setLoading] = useState(false);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);

    try {
      if (api) {
        await apiConfigAPI.update(api.id, formData);
        toast.success("API configuration updated");
      } else {
        await apiConfigAPI.create(formData);
        toast.success("API configuration created");
      }
      queryClient.invalidateQueries({ queryKey: ["apis"] });
      queryClient.invalidateQueries({ queryKey: ["dashboard-stats"] });
      onClose();
    } catch (err) {
      const error = err as Error;
      toast.error(error.message || "Failed to save API configuration");
    } finally {
      setLoading(false);
    }
  };

  return (
    <Dialog open={isOpen} onOpenChange={onClose}>
      <DialogContent className="bg-slate-900 border-slate-800 text-white">
        <DialogHeader>
          <DialogTitle>
            {api ? "Edit API Configuration" : "Add New API"}
          </DialogTitle>
        </DialogHeader>

        <form onSubmit={handleSubmit} className="space-y-4">
          <div className="space-y-2">
            <Label htmlFor="name">API Name *</Label>
            <Input
              id="name"
              value={formData.name}
              onChange={(e) =>
                setFormData({ ...formData, name: e.target.value })
              }
              placeholder="e.g., JSONPlaceholder"
              className="bg-slate-800 border-slate-700"
              required
            />
          </div>

          <div className="space-y-2">
            <Label htmlFor="target_url">Target URL *</Label>
            <Input
              id="target_url"
              type="url"
              value={formData.target_url}
              onChange={(e) =>
                setFormData({ ...formData, target_url: e.target.value })
              }
              placeholder="https://api.example.com"
              className="bg-slate-800 border-slate-700"
              required
            />
          </div>

          <div className="grid grid-cols-2 gap-4">
            <div className="space-y-2">
              <Label htmlFor="rate_limit">Rate Limit (req/s)</Label>
              <Input
                id="rate_limit"
                type="number"
                value={formData.rate_limit_per_second}
                onChange={(e) =>
                  setFormData({
                    ...formData,
                    rate_limit_per_second: parseInt(e.target.value),
                  })
                }
                className="bg-slate-800 border-slate-700"
              />
            </div>

            <div className="space-y-2">
              <Label htmlFor="burst_size">Burst Size</Label>
              <Input
                id="burst_size"
                type="number"
                value={formData.burst_size}
                onChange={(e) =>
                  setFormData({
                    ...formData,
                    burst_size: parseInt(e.target.value),
                  })
                }
                className="bg-slate-800 border-slate-700"
              />
            </div>
          </div>

          <div className="grid grid-cols-2 gap-4">
            <div className="space-y-2">
              <Label htmlFor="timeout">Timeout (seconds)</Label>
              <Input
                id="timeout"
                type="number"
                value={formData.timeout_seconds}
                onChange={(e) =>
                  setFormData({
                    ...formData,
                    timeout_seconds: parseInt(e.target.value),
                  })
                }
                className="bg-slate-800 border-slate-700"
              />
            </div>

            <div className="space-y-2">
              <Label htmlFor="retry">Retry Attempts</Label>
              <Input
                id="retry"
                type="number"
                value={formData.retry_attempts}
                onChange={(e) =>
                  setFormData({
                    ...formData,
                    retry_attempts: parseInt(e.target.value),
                  })
                }
                className="bg-slate-800 border-slate-700"
              />
            </div>
          </div>

          <div className="flex items-center space-x-2">
            <input
              type="checkbox"
              id="enabled"
              checked={formData.enabled}
              onChange={(e) =>
                setFormData({ ...formData, enabled: e.target.checked })
              }
              className="w-4 h-4 rounded border-slate-700 bg-slate-800"
            />
            <Label htmlFor="enabled" className="cursor-pointer">
              Enable API
            </Label>
          </div>

          <div className="flex gap-3 pt-4">
            <Button
              type="button"
              variant="outline"
              onClick={onClose}
              className="flex-1 border-slate-700 hover:bg-slate-800"
              disabled={loading}
            >
              Cancel
            </Button>
            <Button
              type="submit"
              className="flex-1 bg-blue-500 hover:bg-blue-600"
              disabled={loading}
            >
              {loading ? (
                <>
                  <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                  Saving...
                </>
              ) : api ? (
                "Update API"
              ) : (
                "Create API"
              )}
            </Button>
          </div>
        </form>
      </DialogContent>
    </Dialog>
  );
}
