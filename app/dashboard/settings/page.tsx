"use client";

import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { useDashboardStore } from "@/lib/store";
import { Copy, Key } from "lucide-react";
import { toast } from "sonner";

export default function SettingsPage() {
  const apiKey = useDashboardStore((state) => state.apiKey);

  const copyApiKey = () => {
    if (apiKey) {
      navigator.clipboard.writeText(apiKey);
      toast.success("API key copied to clipboard");
    }
  };

  return (
    <div className="space-y-6">
      {/* Header */}
      <div>
        <h1 className="text-3xl font-bold text-white">Settings</h1>
        <p className="text-slate-400 mt-1">
          Manage your account and API credentials
        </p>
      </div>

      {/* API Key */}
      <Card className="bg-slate-900 border-slate-800">
        <CardHeader>
          <CardTitle className="text-white flex items-center gap-2">
            <Key className="w-5 h-5" />
            API Key
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="space-y-2">
            <Label>Your API Key</Label>
            <div className="flex gap-2">
              <Input
                type="password"
                value={apiKey || ""}
                readOnly
                className="bg-slate-800 border-slate-700 font-mono text-sm"
              />
              <Button
                onClick={copyApiKey}
                className="bg-slate-800 hover:bg-slate-700"
              >
                <Copy className="w-4 h-4" />
              </Button>
            </div>
            <p className="text-xs text-slate-400">
              Use this key to authenticate API requests to RateGuard
            </p>
          </div>

          <div className="bg-yellow-500/10 border border-yellow-500/20 rounded-lg p-4">
            <p className="text-yellow-400 text-sm">
              <strong>Important:</strong> Keep your API key secure. Do not share
              it publicly or commit it to version control.
            </p>
          </div>
        </CardContent>
      </Card>

      {/* Account Info */}
      <Card className="bg-slate-900 border-slate-800">
        <CardHeader>
          <CardTitle className="text-white">Account Information</CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div className="space-y-2">
              <Label>Plan</Label>
              <div>
                <Badge className="bg-blue-500/10 text-blue-500 border-blue-500/20">
                  Free
                </Badge>
              </div>
            </div>
            <div className="space-y-2">
              <Label>Status</Label>
              <div>
                <Badge className="bg-green-500/10 text-green-500 border-green-500/20">
                  Active
                </Badge>
              </div>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* API Endpoint Configuration */}
      <Card className="bg-slate-900 border-slate-800">
        <CardHeader>
          <CardTitle className="text-white">API Configuration</CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="space-y-2">
            <Label>RateGuard API Endpoint</Label>
            <Input
              value={process.env.NEXT_PUBLIC_API_URL || "http://localhost:8008"}
              readOnly
              className="bg-slate-800 border-slate-700 font-mono text-sm"
            />
            <p className="text-xs text-slate-400">
              This is the endpoint where RateGuard is running
            </p>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
