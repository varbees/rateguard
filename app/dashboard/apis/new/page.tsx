"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { apiConfigAPI } from "@/lib/api";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Switch } from "@/components/ui/switch";
import { ArrowLeft, Plus, Loader2 } from "lucide-react";
import { toast } from "sonner";
import Link from "next/link";

export default function NewAPIPage() {
  const router = useRouter();
  const queryClient = useQueryClient();

  const [formData, setFormData] = useState({
    name: "",
    target_url: "",
    rate_limit_per_second: 10,
    burst_size: 20,
    timeout_seconds: 30,
    retry_attempts: 1,
    auth_type: "none",
    auth_credentials: "",
    enabled: true,
    custom_headers: {} as Record<string, string>,
  });

  const [customHeader, setCustomHeader] = useState({ key: "", value: "" });

  const createMutation = useMutation({
    mutationFn: apiConfigAPI.create,
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["apis"] });
      toast.success("API configuration created successfully!");
      router.push("/dashboard/apis");
    },
    onError: (error: Error) => {
      toast.error(`Failed to create API: ${error.message}`);
    },
  });

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();

    if (!formData.name || !formData.target_url) {
      toast.error("Please fill in all required fields");
      return;
    }

    createMutation.mutate(formData);
  };

  const addCustomHeader = () => {
    if (customHeader.key && customHeader.value) {
      setFormData((prev) => ({
        ...prev,
        custom_headers: {
          ...prev.custom_headers,
          [customHeader.key]: customHeader.value,
        },
      }));
      setCustomHeader({ key: "", value: "" });
    }
  };

  const removeCustomHeader = (key: string) => {
    setFormData((prev) => {
      const newHeaders = { ...prev.custom_headers };
      delete newHeaders[key];
      return { ...prev, custom_headers: newHeaders };
    });
  };

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center gap-4">
        <Link href="/dashboard/apis">
          <Button
            variant="ghost"
            size="sm"
            className="text-slate-400 hover:text-white"
          >
            <ArrowLeft className="w-4 h-4 mr-2" />
            Back to APIs
          </Button>
        </Link>
        <div>
          <h1 className="text-3xl font-bold text-white">Add New API</h1>
          <p className="text-slate-400 mt-1">
            Configure a new API endpoint for rate limiting and proxying
          </p>
        </div>
      </div>

      <form onSubmit={handleSubmit} className="space-y-6">
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
          {/* Basic Configuration */}
          <Card className="bg-slate-900 border-slate-800">
            <CardHeader>
              <CardTitle className="text-white">Basic Configuration</CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="space-y-2">
                <Label htmlFor="name" className="text-slate-300">
                  API Name *
                </Label>
                <Input
                  id="name"
                  value={formData.name}
                  onChange={(e) =>
                    setFormData((prev) => ({ ...prev, name: e.target.value }))
                  }
                  placeholder="e.g., stripe_prod, github_api"
                  className="bg-slate-800 border-slate-700 text-white"
                  required
                />
                <p className="text-xs text-slate-400">
                  Used in proxy URL: /proxy/{formData.name || "api_name"}
                </p>
              </div>

              <div className="space-y-2">
                <Label htmlFor="target_url" className="text-slate-300">
                  Target URL *
                </Label>
                <Input
                  id="target_url"
                  value={formData.target_url}
                  onChange={(e) =>
                    setFormData((prev) => ({
                      ...prev,
                      target_url: e.target.value,
                    }))
                  }
                  placeholder="https://api.example.com"
                  className="bg-slate-800 border-slate-700 text-white"
                  required
                />
                <p className="text-xs text-slate-400">
                  The base URL of the API you want to proxy
                </p>
              </div>

              <div className="flex items-center justify-between">
                <div className="space-y-1">
                  <Label className="text-slate-300">Enable API</Label>
                  <p className="text-xs text-slate-400">
                    API can be enabled/disabled after creation
                  </p>
                </div>
                <Switch
                  checked={formData.enabled}
                  onCheckedChange={(checked) =>
                    setFormData((prev) => ({ ...prev, enabled: checked }))
                  }
                />
              </div>
            </CardContent>
          </Card>

          {/* Rate Limiting */}
          <Card className="bg-slate-900 border-slate-800">
            <CardHeader>
              <CardTitle className="text-white">Rate Limiting</CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="space-y-2">
                <Label htmlFor="rate_limit" className="text-slate-300">
                  Rate Limit (requests/second)
                </Label>
                <Input
                  id="rate_limit"
                  type="number"
                  value={formData.rate_limit_per_second}
                  onChange={(e) =>
                    setFormData((prev) => ({
                      ...prev,
                      rate_limit_per_second: parseInt(e.target.value) || 10,
                    }))
                  }
                  className="bg-slate-800 border-slate-700 text-white"
                  min="1"
                />
              </div>

              <div className="space-y-2">
                <Label htmlFor="burst_size" className="text-slate-300">
                  Burst Size
                </Label>
                <Input
                  id="burst_size"
                  type="number"
                  value={formData.burst_size}
                  onChange={(e) =>
                    setFormData((prev) => ({
                      ...prev,
                      burst_size: parseInt(e.target.value) || 20,
                    }))
                  }
                  className="bg-slate-800 border-slate-700 text-white"
                  min="1"
                />
                <p className="text-xs text-slate-400">
                  Maximum requests allowed in a burst
                </p>
              </div>

              <div className="space-y-2">
                <Label htmlFor="timeout" className="text-slate-300">
                  Timeout (seconds)
                </Label>
                <Input
                  id="timeout"
                  type="number"
                  value={formData.timeout_seconds}
                  onChange={(e) =>
                    setFormData((prev) => ({
                      ...prev,
                      timeout_seconds: parseInt(e.target.value) || 30,
                    }))
                  }
                  className="bg-slate-800 border-slate-700 text-white"
                  min="1"
                />
              </div>

              <div className="space-y-2">
                <Label htmlFor="retry" className="text-slate-300">
                  Retry Attempts
                </Label>
                <Input
                  id="retry"
                  type="number"
                  value={formData.retry_attempts}
                  onChange={(e) =>
                    setFormData((prev) => ({
                      ...prev,
                      retry_attempts: parseInt(e.target.value) || 1,
                    }))
                  }
                  className="bg-slate-800 border-slate-700 text-white"
                  min="0"
                  max="5"
                />
              </div>
            </CardContent>
          </Card>

          {/* Authentication */}
          <Card className="bg-slate-900 border-slate-800">
            <CardHeader>
              <CardTitle className="text-white">Authentication</CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="space-y-2">
                <Label className="text-slate-300">Authentication Type</Label>
                <Select
                  value={formData.auth_type}
                  onValueChange={(value) =>
                    setFormData((prev) => ({ ...prev, auth_type: value }))
                  }
                >
                  <SelectTrigger className="bg-slate-800 border-slate-700 text-white">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent className="bg-slate-800 border-slate-700">
                    <SelectItem value="none">None</SelectItem>
                    <SelectItem value="bearer">Bearer Token</SelectItem>
                    <SelectItem value="api_key">API Key</SelectItem>
                    <SelectItem value="basic">Basic Auth</SelectItem>
                  </SelectContent>
                </Select>
              </div>

              {formData.auth_type !== "none" && (
                <div className="space-y-2">
                  <Label htmlFor="auth_credentials" className="text-slate-300">
                    Credentials
                  </Label>
                  <Input
                    id="auth_credentials"
                    type="password"
                    value={formData.auth_credentials}
                    onChange={(e) =>
                      setFormData((prev) => ({
                        ...prev,
                        auth_credentials: e.target.value,
                      }))
                    }
                    placeholder="Enter your API key or token"
                    className="bg-slate-800 border-slate-700 text-white"
                  />
                  <p className="text-xs text-slate-400">
                    This will be securely stored and used for API requests
                  </p>
                </div>
              )}
            </CardContent>
          </Card>

          {/* Custom Headers */}
          <Card className="bg-slate-900 border-slate-800">
            <CardHeader>
              <CardTitle className="text-white">Custom Headers</CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="flex gap-2">
                <Input
                  placeholder="Header name"
                  value={customHeader.key}
                  onChange={(e) =>
                    setCustomHeader((prev) => ({
                      ...prev,
                      key: e.target.value,
                    }))
                  }
                  className="bg-slate-800 border-slate-700 text-white"
                />
                <Input
                  placeholder="Header value"
                  value={customHeader.value}
                  onChange={(e) =>
                    setCustomHeader((prev) => ({
                      ...prev,
                      value: e.target.value,
                    }))
                  }
                  className="bg-slate-800 border-slate-700 text-white"
                />
                <Button
                  type="button"
                  onClick={addCustomHeader}
                  variant="outline"
                  className="border-slate-700 text-slate-300 hover:bg-slate-800"
                >
                  <Plus className="w-4 h-4" />
                </Button>
              </div>

              {Object.entries(formData.custom_headers).length > 0 && (
                <div className="space-y-2">
                  <Label className="text-slate-300">Added Headers</Label>
                  {Object.entries(formData.custom_headers).map(
                    ([key, value]) => (
                      <div
                        key={key}
                        className="flex items-center justify-between p-2 bg-slate-800 rounded"
                      >
                        <span className="text-slate-300 font-mono text-sm">
                          {key}: {value}
                        </span>
                        <Button
                          type="button"
                          onClick={() => removeCustomHeader(key)}
                          variant="ghost"
                          size="sm"
                          className="text-red-400 hover:text-red-300"
                        >
                          Remove
                        </Button>
                      </div>
                    )
                  )}
                </div>
              )}
            </CardContent>
          </Card>
        </div>

        {/* Submit Button */}
        <div className="flex justify-end gap-4">
          <Link href="/dashboard/apis">
            <Button
              variant="outline"
              className="border-slate-700 text-slate-300 hover:bg-slate-800"
            >
              Cancel
            </Button>
          </Link>
          <Button
            type="submit"
            disabled={createMutation.isPending}
            className="bg-blue-500 hover:bg-blue-600"
          >
            {createMutation.isPending ? (
              <>
                <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                Creating...
              </>
            ) : (
              <>
                <Plus className="w-4 h-4 mr-2" />
                Create API
              </>
            )}
          </Button>
        </div>
      </form>
    </div>
  );
}
