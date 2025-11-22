"use client";

import { useState, useEffect } from "react";
import { APIConfig, apiConfigAPI } from "@/lib/api";
import { useQueryClient } from "@tanstack/react-query";
import { Loader2, Plus, X, Info } from "lucide-react";
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
import { slugify } from "@/lib/utils-slug";

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
    rate_limit_per_hour: api?.rate_limit_per_hour || 0,
    rate_limit_per_day: api?.rate_limit_per_day || 0,
    rate_limit_per_month: api?.rate_limit_per_month || 0,
    allowed_origins: api?.allowed_origins || [],
    timeout_seconds: api?.timeout_seconds || 30,
    retry_attempts: api?.retry_attempts || 1,
    enabled: api?.enabled ?? true,
  });

  const [loading, setLoading] = useState(false);
  const [slugPreview, setSlugPreview] = useState("");
  const [newOrigin, setNewOrigin] = useState("");

  // Update slug preview when name changes
  useEffect(() => {
    const slug = slugify(formData.name);
    setSlugPreview(slug);
  }, [formData.name]);

  const handleAddOrigin = () => {
    const trimmed = newOrigin.trim();
    if (trimmed && !formData.allowed_origins.includes(trimmed)) {
      setFormData({
        ...formData,
        allowed_origins: [...formData.allowed_origins, trimmed],
      });
      setNewOrigin("");
    }
  };

  const handleRemoveOrigin = (origin: string) => {
    setFormData({
      ...formData,
      allowed_origins: formData.allowed_origins.filter((o) => o !== origin),
    });
  };

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

        <form
          onSubmit={handleSubmit}
          className="space-y-6 max-h-[80vh] overflow-y-auto pr-2"
        >
          {/* API Name with Slug Preview */}
          <div className="space-y-2">
            <Label htmlFor="name">API Name *</Label>
            <Input
              id="name"
              value={formData.name}
              onChange={(e) =>
                setFormData({ ...formData, name: e.target.value })
              }
              placeholder="e.g., My GitHub API"
              className="bg-slate-800 border-slate-700"
              required
            />
            {slugPreview && (
              <div className="flex items-center gap-2 text-sm">
                <Info className="w-4 h-4 text-blue-400" />
                <span className="text-slate-400">Slug preview:</span>
                <code className="px-2 py-1 bg-slate-800 border border-slate-700 rounded text-blue-400">
                  {slugPreview}
                </code>
              </div>
            )}
            <p className="text-xs text-slate-500">
              Will be converted to URL-safe slug automatically
            </p>
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

          {/* Rate Limits Section */}
          <div className="space-y-3">
            <div className="flex items-center gap-2">
              <h3 className="text-sm font-semibold text-slate-200">
                Rate Limits
              </h3>
              <span className="text-xs text-slate-500">(0 = unlimited)</span>
            </div>

            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label htmlFor="rate_limit">Per Second</Label>
                <Input
                  id="rate_limit"
                  type="number"
                  min="0"
                  value={formData.rate_limit_per_second}
                  onChange={(e) =>
                    setFormData({
                      ...formData,
                      rate_limit_per_second: parseInt(e.target.value) || 0,
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
                  min="0"
                  value={formData.burst_size}
                  onChange={(e) =>
                    setFormData({
                      ...formData,
                      burst_size: parseInt(e.target.value) || 0,
                    })
                  }
                  className="bg-slate-800 border-slate-700"
                />
              </div>
            </div>

            <div className="grid grid-cols-3 gap-4">
              <div className="space-y-2">
                <Label htmlFor="rate_limit_hour">Per Hour</Label>
                <Input
                  id="rate_limit_hour"
                  type="number"
                  min="0"
                  value={formData.rate_limit_per_hour}
                  onChange={(e) =>
                    setFormData({
                      ...formData,
                      rate_limit_per_hour: parseInt(e.target.value) || 0,
                    })
                  }
                  placeholder="0 = unlimited"
                  className="bg-slate-800 border-slate-700"
                />
              </div>

              <div className="space-y-2">
                <Label htmlFor="rate_limit_day">Per Day</Label>
                <Input
                  id="rate_limit_day"
                  type="number"
                  min="0"
                  value={formData.rate_limit_per_day}
                  onChange={(e) =>
                    setFormData({
                      ...formData,
                      rate_limit_per_day: parseInt(e.target.value) || 0,
                    })
                  }
                  placeholder="0 = unlimited"
                  className="bg-slate-800 border-slate-700"
                />
              </div>

              <div className="space-y-2">
                <Label htmlFor="rate_limit_month">Per Month</Label>
                <Input
                  id="rate_limit_month"
                  type="number"
                  min="0"
                  value={formData.rate_limit_per_month}
                  onChange={(e) =>
                    setFormData({
                      ...formData,
                      rate_limit_per_month: parseInt(e.target.value) || 0,
                    })
                  }
                  placeholder="0 = unlimited"
                  className="bg-slate-800 border-slate-700"
                />
              </div>
            </div>
          </div>

          {/* CORS Allowed Origins */}
          <div className="space-y-3">
            <div className="flex items-center gap-2">
              <h3 className="text-sm font-semibold text-slate-200">
                CORS Allowed Origins
              </h3>
              <span className="text-xs text-slate-500">(whitelist)</span>
            </div>

            <div className="flex gap-2">
              <Input
                value={newOrigin}
                onChange={(e) => setNewOrigin(e.target.value)}
                onKeyPress={(e) => {
                  if (e.key === "Enter") {
                    e.preventDefault();
                    handleAddOrigin();
                  }
                }}
                placeholder="https://example.com"
                className="flex-1 bg-slate-800 border-slate-700"
              />
              <Button
                type="button"
                onClick={handleAddOrigin}
                size="sm"
                className="bg-blue-500 hover:bg-blue-600"
              >
                <Plus className="w-4 h-4" />
              </Button>
            </div>

            {formData.allowed_origins.length > 0 && (
              <div className="space-y-2">
                {formData.allowed_origins.map((origin) => (
                  <div
                    key={origin}
                    className="flex items-center justify-between bg-slate-800 border border-slate-700 rounded px-3 py-2"
                  >
                    <span className="text-sm text-slate-300">{origin}</span>
                    <button
                      type="button"
                      onClick={() => handleRemoveOrigin(origin)}
                      className="text-red-400 hover:text-red-300"
                    >
                      <X className="w-4 h-4" />
                    </button>
                  </div>
                ))}
              </div>
            )}
            <p className="text-xs text-slate-500">
              Empty list = deny all origins. Use * to allow all origins.
            </p>
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
