"use client";

import { useEffect, useState } from "react";
import { useWebSocket } from "@/lib/websocket/context";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Activity, Database, Server } from "lucide-react";
import { cn } from "@/lib/utils";

interface SystemHealth {
  database: "healthy" | "unhealthy";
  redis: "healthy" | "unhealthy";
  status: "healthy" | "degraded" | "unhealthy";
  timestamp: number;
}

export function SystemHealthIndicator() {
  const { subscribe, isConnected } = useWebSocket();
  const [health, setHealth] = useState<SystemHealth | null>(null);

  useEffect(() => {
    const unsubscribe = subscribe("system.health", (event) => {
      setHealth(event.data as SystemHealth);
    });
    return unsubscribe;
  }, [subscribe]);

  if (!health && !isConnected) {
    return (
      <Card>
        <CardHeader className="pb-2">
          <CardTitle className="text-sm font-medium flex items-center gap-2">
            <Activity className="w-4 h-4" />
            System Health
          </CardTitle>
        </CardHeader>
        <CardContent>
          <div className="text-sm text-slate-500">
            Waiting for status...
          </div>
        </CardContent>
      </Card>
    );
  }

  return (
    <Card>
      <CardHeader className="pb-2">
        <CardTitle className="text-sm font-medium flex items-center gap-2">
          <Activity className="w-4 h-4" />
          System Health
        </CardTitle>
      </CardHeader>
      <CardContent>
        <div className="space-y-2">
          <div className="flex items-center justify-between text-sm">
            <div className="flex items-center gap-2">
              <Database className="w-4 h-4 text-slate-400" />
              <span>Database</span>
            </div>
            <span className={cn(
              "px-2 py-0.5 rounded-full text-xs font-medium",
              health?.database === "healthy" 
                ? "bg-emerald-500/10 text-emerald-500" 
                : "bg-rose-500/10 text-rose-500"
            )}>
              {health?.database || "Unknown"}
            </span>
          </div>
          <div className="flex items-center justify-between text-sm">
            <div className="flex items-center gap-2">
              <Server className="w-4 h-4 text-slate-400" />
              <span>Redis</span>
            </div>
            <span className={cn(
              "px-2 py-0.5 rounded-full text-xs font-medium",
              health?.redis === "healthy" 
                ? "bg-emerald-500/10 text-emerald-500" 
                : "bg-rose-500/10 text-rose-500"
            )}>
              {health?.redis || "Unknown"}
            </span>
          </div>
        </div>
      </CardContent>
    </Card>
  );
}
