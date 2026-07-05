"use client";

import { useState } from "react";
import { useRateGuard } from "@/lib/rateguard-context";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Label } from "@/components/ui/label";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";

export default function SettingsPage() {
  const { target, setTarget, reqKey, setReqKey, status } = useRateGuard();
  const [targetInput, setTargetInput] = useState(target);
  const [keyInput, setKeyInput] = useState(reqKey);

  return (
    <div className="flex flex-col gap-4">
      <Card>
        <CardHeader>
          <CardTitle>Instance connection</CardTitle>
          <CardDescription>
            The dashboard is a static client — it polls whichever RateGuard instance you point it
            at. Nothing here is stored server-side.
          </CardDescription>
        </CardHeader>
        <CardContent className="flex flex-col gap-4">
          <div className="flex flex-col gap-1.5">
            <Label htmlFor="target">Instance URL</Label>
            <Input
              id="target"
              value={targetInput}
              onChange={(e) => setTargetInput(e.target.value)}
              className="mono max-w-md"
            />
          </div>
          <div className="flex flex-col gap-1.5">
            <Label htmlFor="key">Query key</Label>
            <Input
              id="key"
              value={keyInput}
              onChange={(e) => setKeyInput(e.target.value)}
              className="mono max-w-md"
            />
            <p className="text-xs text-muted-foreground">
              A free-form identifier queried against <code className="mono">/admin/state</code> —
              in a real deployment this is a user/tenant/API-key, not RateGuard&apos;s internal
              request-derived key.
            </p>
          </div>
          <div>
            <Button
              onClick={() => {
                setTarget(targetInput);
                setReqKey(keyInput);
              }}
            >
              Save &amp; reconnect
            </Button>
          </div>
          <p className="text-sm text-muted-foreground">
            Status: <span className="font-medium text-foreground">{status}</span>
          </p>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Security posture</CardTitle>
          <CardDescription>Read this before exposing the admin API beyond localhost.</CardDescription>
        </CardHeader>
        <CardContent className="flex flex-col gap-2 text-sm text-muted-foreground">
          <p>
            <code className="mono">rg.AdminHandler()</code> has no authentication. Anyone who can
            reach it can read your current limits and change them — the same posture as pprof or
            an unauthenticated Prometheus endpoint.
          </p>
          <ul className="list-disc pl-5">
            <li>Bind it to localhost or an internal network, never a public interface.</li>
            <li>If it must be reachable beyond that, put your own auth in front of it.</li>
            <li>
              It&apos;s entirely opt-in — nothing wires <code className="mono">/admin/*</code> into
              the request middleware automatically.
            </li>
          </ul>
        </CardContent>
      </Card>
    </div>
  );
}
