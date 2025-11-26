"use client";

import * as React from "react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Label } from "@/components/ui/label";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Plus, X, Info } from "lucide-react";
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "@/components/ui/tooltip";

interface CustomHeadersSectionProps {
  customHeaders: Record<string, string>;
  onCustomHeadersChange: (headers: Record<string, string>) => void;
}

const COMMON_HEADERS = [
  { name: "Authorization", example: "Bearer token123" },
  { name: "X-API-Key", example: "your-api-key" },
  { name: "X-Custom-Header", example: "custom-value" },
  { name: "X-Tenant-ID", example: "tenant-123" },
  { name: "X-Request-ID", example: "uuid-here" },
];

export function CustomHeadersSection({
  customHeaders,
  onCustomHeadersChange,
}: CustomHeadersSectionProps) {
  const headers = Object.entries(customHeaders);

  const addHeader = () => {
    onCustomHeadersChange({ ...customHeaders, "": "" });
  };

  const updateHeader = (oldKey: string, newKey: string, value: string) => {
    const newHeaders = { ...customHeaders };
    if (oldKey !== newKey) {
      delete newHeaders[oldKey];
    }
    if (newKey.trim()) {
      newHeaders[newKey] = value;
    }
    onCustomHeadersChange(newHeaders);
  };

  const removeHeader = (key: string) => {
    const newHeaders = { ...customHeaders };
    delete newHeaders[key];
    onCustomHeadersChange(newHeaders);
  };

  const useCommonHeader = (name: string, example: string) => {
    onCustomHeadersChange({ ...customHeaders, [name]: example });
  };

  return (
    <Card>
      <CardHeader>
        <div className="flex items-center justify-between">
          <div>
            <CardTitle className="flex items-center gap-2">
              Custom Headers
              <TooltipProvider>
                <Tooltip>
                  <TooltipTrigger>
                    <Info className="w-4 h-4 text-muted-foreground" />
                  </TooltipTrigger>
                  <TooltipContent className="max-w-xs">
                    <p>
                      Headers that will be forwarded to the upstream API with every request.
                      Useful for API keys, authorization tokens, or custom tracking headers.
                    </p>
                  </TooltipContent>
                </Tooltip>
              </TooltipProvider>
            </CardTitle>
            <CardDescription>
              Add HTTP headers to forward to your upstream API
            </CardDescription>
          </div>
        </div>
      </CardHeader>
      <CardContent className="space-y-4">
        {/* Common Headers Quick Add */}
        {headers.length === 0 && (
          <div className="space-y-2">
            <Label className="text-sm text-muted-foreground">Quick Add Common Headers</Label>
            <div className="flex flex-wrap gap-2">
              {COMMON_HEADERS.map((header) => (
                <Button
                  key={header.name}
                  type="button"
                  variant="outline"
                  size="sm"
                  onClick={() => useCommonHeader(header.name, header.example)}
                  className="text-xs"
                >
                  <Plus className="w-3 h-3 mr-1" />
                  {header.name}
                </Button>
              ))}
            </div>
          </div>
        )}

        {/* Header List */}
        <div className="space-y-3">
          {headers.map(([key, value], index) => (
            <div key={index} className="flex gap-2 items-start">
              <div className="flex-1 grid grid-cols-2 gap-2">
                <div className="space-y-1">
                  <Label htmlFor={`header-key-${index}`} className="text-xs">
                    Header Name
                  </Label>
                  <Input
                    id={`header-key-${index}`}
                    placeholder="X-API-Key"
                    value={key}
                    onChange={(e) => updateHeader(key, e.target.value, value)}
                    className="font-mono text-sm"
                  />
                </div>
                <div className="space-y-1">
                  <Label htmlFor={`header-value-${index}`} className="text-xs">
                    Header Value
                  </Label>
                  <Input
                    id={`header-value-${index}`}
                    placeholder="your-api-key"
                    value={value}
                    onChange={(e) => updateHeader(key, key, e.target.value)}
                    className="font-mono text-sm"
                  />
                </div>
              </div>
              <Button
                type="button"
                variant="ghost"
                size="icon"
                onClick={() => removeHeader(key)}
                className="mt-6 shrink-0"
              >
                <X className="w-4 h-4" />
              </Button>
            </div>
          ))}
        </div>

        {/* Add Header Button */}
        <Button
          type="button"
          variant="outline"
          size="sm"
          onClick={addHeader}
          className="w-full"
        >
          <Plus className="w-4 h-4 mr-2" />
          Add Custom Header
        </Button>

        {headers.length > 0 && (
          <div className="text-xs text-muted-foreground bg-muted/50 p-3 rounded-lg">
            <strong>Note:</strong> These headers will be added to every request proxied through this API.
            Sensitive values like API keys are encrypted at rest.
          </div>
        )}
      </CardContent>
    </Card>
  );
}
