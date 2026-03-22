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
import { Copy, Eye, EyeOff, Key, RefreshCw, Trash2 } from "lucide-react";
import { cn } from "@/lib/utils";

interface ApiKeyDemoProps {
  className?: string;
}

interface ApiKeyData {
  id: string;
  key: string;
  name: string;
  prefix: string;
  environment: "test" | "live";
  created: string;
  lastUsed?: string;
}

export function ApiKeyDemo({ className }: ApiKeyDemoProps) {
  const [keys, setKeys] = React.useState<ApiKeyData[]>([
    {
      id: "1",
      key: "rg_test_4f7a8b2c9d1e3f6a8b2c9d1e3f6a8b2c",
      name: "Development Key",
      prefix: "rg_test_",
      environment: "test",
      created: "2024-01-10",
      lastUsed: "2024-01-20",
    },
    {
      id: "2",
      key: "rg_live_9e8d7c6b5a4f3e2d1c0b9a8f7e6d5c4b",
      name: "Production Key",
      prefix: "rg_live_",
      environment: "live",
      created: "2024-01-05",
      lastUsed: "2 minutes ago",
    },
  ]);

  const [visibleKeys, setVisibleKeys] = React.useState<Set<string>>(new Set());
  const [copiedKey, setCopiedKey] = React.useState<string | null>(null);

  const toggleKeyVisibility = (id: string) => {
    setVisibleKeys((prev) => {
      const newSet = new Set(prev);
      if (newSet.has(id)) {
        newSet.delete(id);
      } else {
        newSet.add(id);
      }
      return newSet;
    });
  };

  const copyKey = async (key: string) => {
    await navigator.clipboard.writeText(key);
    setCopiedKey(key);
    setTimeout(() => setCopiedKey(null), 2000);
  };

  const maskKey = (key: string, visible: boolean) => {
    if (visible) return key;
    const prefix = key.substring(0, 8);
    return `${prefix}${"•".repeat(32)}`;
  };

  const generateKey = () => {
    const randomKey = `rg_test_${Math.random()
      .toString(36)
      .substring(2, 15)}${Math.random().toString(36).substring(2, 15)}`;
    const newKey: ApiKeyData = {
      id: Date.now().toString(),
      key: randomKey,
      name: `New Key ${keys.length + 1}`,
      prefix: "rg_test_",
      environment: "test",
      created: new Date().toLocaleDateString(),
    };
    setKeys([newKey, ...keys]);
  };

  const deleteKey = (id: string) => {
    setKeys(keys.filter((k) => k.id !== id));
  };

  return (
    <div className={cn("my-8", className)}>
      <Card className="border-2">
        <CardHeader>
          <div className="flex items-center justify-between">
            <div>
              <CardTitle className="flex items-center gap-2">
                <Key className="size-5" />
                API Keys Management
              </CardTitle>
              <CardDescription className="mt-1.5">
                Generate and manage your RateGuard API keys
              </CardDescription>
            </div>
            <Button onClick={generateKey} size="sm" className="gap-2">
              <RefreshCw className="size-4" />
              Generate Key
            </Button>
          </div>
        </CardHeader>
        <CardContent className="space-y-4">
          {keys.map((keyData) => (
            <div
              key={keyData.id}
              className={cn(
                "flex items-center justify-between p-4 rounded-lg border",
                "bg-muted/30 dark:bg-muted/10 hover:bg-muted/50 transition-colors"
              )}
            >
              <div className="flex-1 space-y-2">
                <div className="flex items-center gap-2">
                  <p className="font-medium text-sm">{keyData.name}</p>
                  <Badge
                    variant={
                      keyData.environment === "live" ? "default" : "secondary"
                    }
                    className="text-xs"
                  >
                    {keyData.environment}
                  </Badge>
                </div>

                <div className="flex items-center gap-2">
                  <code
                    className={cn(
                      "text-xs font-mono px-2 py-1 rounded",
                      "bg-background border select-all",
                      visibleKeys.has(keyData.id)
                        ? "text-foreground"
                        : "text-muted-foreground"
                    )}
                  >
                    {maskKey(keyData.key, visibleKeys.has(keyData.id))}
                  </code>
                </div>

                <div className="flex items-center gap-4 text-xs text-muted-foreground">
                  <span>Created: {keyData.created}</span>
                  {keyData.lastUsed && (
                    <span>Last used: {keyData.lastUsed}</span>
                  )}
                </div>
              </div>

              <div className="flex items-center gap-1 ml-4">
                <Button
                  size="icon-sm"
                  variant="ghost"
                  onClick={() => toggleKeyVisibility(keyData.id)}
                  className="text-muted-foreground hover:text-foreground"
                >
                  {visibleKeys.has(keyData.id) ? (
                    <EyeOff className="size-4" />
                  ) : (
                    <Eye className="size-4" />
                  )}
                </Button>

                <Button
                  size="icon-sm"
                  variant="ghost"
                  onClick={() => copyKey(keyData.key)}
                  className="text-muted-foreground hover:text-foreground"
                >
                  <Copy
                    className={cn(
                      "size-4",
                      copiedKey === keyData.key && "text-green-500"
                    )}
                  />
                </Button>

                <Button
                  size="icon-sm"
                  variant="ghost"
                  onClick={() => deleteKey(keyData.id)}
                  className="text-muted-foreground hover:text-destructive"
                >
                  <Trash2 className="size-4" />
                </Button>
              </div>
            </div>
          ))}

          {keys.length === 0 && (
            <div className="text-center py-12 text-muted-foreground">
              <Key className="size-12 mx-auto mb-4 opacity-20" />
              <p className="text-sm">
                No API keys yet. Generate your first key to get started.
              </p>
            </div>
          )}
        </CardContent>
      </Card>

      <div className="mt-6 p-4 rounded-lg border bg-muted/30 dark:bg-muted/10">
        <h4 className="font-semibold text-sm mb-2">Key Format</h4>
        <div className="space-y-2 text-sm text-muted-foreground">
          <div className="flex items-center gap-2 font-mono">
            <span className="text-blue-600 dark:text-blue-400">rg_</span>
            <span className="text-yellow-600 dark:text-yellow-400">[env]</span>
            <span className="text-foreground">_</span>
            <span className="text-green-600 dark:text-green-400">
              [random_string]
            </span>
          </div>
          <ul className="space-y-1 list-disc list-inside ml-2">
            <li>
              <code className="text-xs">rg_test_</code> - Test/Development
              environment
            </li>
            <li>
              <code className="text-xs">rg_live_</code> - Production environment
            </li>
          </ul>
        </div>
      </div>
    </div>
  );
}
