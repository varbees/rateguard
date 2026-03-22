"use client";

import * as React from "react";
import { Badge } from "@/components/ui/badge";
import { Lock, LockOpen } from "lucide-react";
import { cn } from "@/lib/utils";

interface EndpointHeaderProps {
  method: string;
  path: string;
  title: string;
  description: string;
  authentication: boolean;
  authType?: string;
}

const METHOD_COLORS: Record<string, string> = {
  GET: "bg-blue-500 text-white hover:bg-blue-600",
  POST: "bg-green-500 text-white hover:bg-green-600",
  PUT: "bg-orange-500 text-white hover:bg-orange-600",
  DELETE: "bg-red-500 text-white hover:bg-red-600",
  PATCH: "bg-purple-500 text-white hover:bg-purple-600",
  ANY: "bg-gray-500 text-white hover:bg-gray-600",
};

export function EndpointHeader({
  method,
  path,
  title,
  description,
  authentication,
  authType,
}: EndpointHeaderProps) {
  return (
    <div className="space-y-4">
      {/* Method and Path */}
      <div className="flex items-center gap-3 flex-wrap">
        <Badge
          className={cn(
            "px-3 py-1 font-mono font-semibold text-sm",
            METHOD_COLORS[method] || METHOD_COLORS.GET
          )}
        >
          {method}
        </Badge>
        <code className="text-lg font-mono bg-muted px-4 py-2 rounded-md border flex-1 min-w-0">
          {path}
        </code>
      </div>

      {/* Title and Description */}
      <div>
        <h3 className="text-2xl font-bold mb-2">{title}</h3>
        <p className="text-muted-foreground leading-relaxed">{description}</p>
      </div>

      {/* Authentication Badge */}
      <div className="flex items-center gap-2">
        {authentication ? (
          <>
            <div className="flex items-center gap-2 px-3 py-1.5 rounded-md bg-amber-50 dark:bg-amber-950/30 border border-amber-200 dark:border-amber-900/50">
              <Lock className="size-4 text-amber-600 dark:text-amber-400" />
              <span className="text-sm font-medium text-amber-900 dark:text-amber-100">
                Authentication Required
              </span>
            </div>
            {authType && (
              <Badge variant="outline" className="text-xs">
                {authType}
              </Badge>
            )}
          </>
        ) : (
          <div className="flex items-center gap-2 px-3 py-1.5 rounded-md bg-green-50 dark:bg-green-950/30 border border-green-200 dark:border-green-900/50">
            <LockOpen className="size-4 text-green-600 dark:text-green-400" />
            <span className="text-sm font-medium text-green-900 dark:text-green-100">
              No Authentication Required
            </span>
          </div>
        )}
      </div>
    </div>
  );
}
