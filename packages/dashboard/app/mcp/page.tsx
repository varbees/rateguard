"use client";

import { useEffect, useState } from "react";
import { Play } from "lucide-react";
import { useRateGuard } from "@/lib/rateguard-context";
import type { MCPTool } from "@/lib/api";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Label } from "@/components/ui/label";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";

export default function MCPConsolePage() {
  const { client, reqKey } = useRateGuard();
  const [tools, setTools] = useState<MCPTool[] | null>(null);
  const [selected, setSelected] = useState<string | null>(null);
  const [args, setArgs] = useState<Record<string, string>>({});
  const [result, setResult] = useState<Record<string, unknown> | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [running, setRunning] = useState(false);

  useEffect(() => {
    client
      .getMCPTools()
      .then((t) => {
        setTools(t);
        setSelected(t[0]?.name ?? null);
      })
      .catch(() => setTools([]));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [client.baseUrl]);

  useEffect(() => {
    setArgs((prev) => {
      const tool = tools?.find((t) => t.name === selected);
      if (!tool) return prev;
      const next: Record<string, string> = {};
      for (const key of Object.keys(tool.input_schema.properties ?? {})) {
        if (key === "key") next[key] = reqKey;
      }
      return next;
    });
  }, [selected, tools, reqKey]);

  const tool = tools?.find((t) => t.name === selected);

  async function run() {
    if (!tool) return;
    setRunning(true);
    setError(null);
    setResult(null);
    try {
      const parsedArgs: Record<string, unknown> = {};
      for (const [key, value] of Object.entries(args)) {
        if (value === "") continue;
        const prop = tool.input_schema.properties?.[key];
        parsedArgs[key] = prop?.type === "integer" || prop?.type === "number" ? Number(value) : value;
      }
      const res = await client.callMCPTool(tool.name, parsedArgs);
      setResult(res);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Call failed");
    } finally {
      setRunning(false);
    }
  }

  if (!tools) {
    return <Skeleton className="h-96 rounded-xl" />;
  }

  return (
    <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
      <Card>
        <CardHeader>
          <CardTitle>Try a tool</CardTitle>
          <CardDescription>
            Calls the exact handler behind RateGuard&apos;s MCP tools — the same ones an agent
            queries pre-flight via stdio.
          </CardDescription>
        </CardHeader>
        <CardContent className="flex flex-col gap-4">
          <div className="flex flex-col gap-1.5">
            <Label>Tool</Label>
            <Select value={selected ?? undefined} onValueChange={setSelected}>
              <SelectTrigger className="w-full">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {tools.map((t) => (
                  <SelectItem key={t.name} value={t.name}>
                    {t.name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            {tool && <p className="text-xs text-muted-foreground">{tool.description}</p>}
          </div>

          {tool && Object.keys(tool.input_schema.properties ?? {}).length > 0 && (
            <div className="flex flex-col gap-3">
              {Object.entries(tool.input_schema.properties ?? {}).map(([key, prop]) => (
                <div key={key} className="flex flex-col gap-1.5">
                  <Label htmlFor={key}>
                    {key}
                    {tool.input_schema.required?.includes(key) && <span className="text-destructive"> *</span>}
                  </Label>
                  <Input
                    id={key}
                    value={args[key] ?? ""}
                    onChange={(e) => setArgs((a) => ({ ...a, [key]: e.target.value }))}
                    placeholder={prop.description}
                    className="mono"
                  />
                </div>
              ))}
            </div>
          )}

          <Button onClick={run} disabled={running || !tool}>
            <Play /> {running ? "Running…" : "Run"}
          </Button>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Response</CardTitle>
          <CardDescription>Raw JSON returned by the tool handler.</CardDescription>
        </CardHeader>
        <CardContent>
          {error && (
            <p className="rounded-md border border-destructive/40 bg-destructive/5 p-3 text-sm text-destructive">
              {error}
            </p>
          )}
          {result && (
            <pre className="mono max-h-96 overflow-auto rounded-md bg-muted p-3 text-xs">
              {JSON.stringify(result, null, 2)}
            </pre>
          )}
          {!error && !result && (
            <p className="py-12 text-center text-sm text-muted-foreground">Run a tool to see its response here.</p>
          )}
        </CardContent>
      </Card>

      <Card className="lg:col-span-2">
        <CardHeader>
          <CardTitle>All tools</CardTitle>
          <CardDescription>The full MCP catalog this instance exposes.</CardDescription>
        </CardHeader>
        <CardContent className="flex flex-col gap-3">
          {tools.map((t) => (
            <div key={t.name} className="rounded-md border p-3">
              <p className="mono text-sm font-medium">{t.name}</p>
              <p className="mt-1 text-xs text-muted-foreground">{t.description}</p>
            </div>
          ))}
        </CardContent>
      </Card>
    </div>
  );
}
