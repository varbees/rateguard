"use client";

import { useState } from "react";
import { toast } from "sonner";
import { useRateGuard } from "@/lib/rateguard-context";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
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
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";

const FIELDS = [
  { key: "requests_per_second", label: "Requests / sec", hint: "Token bucket refill rate" },
  { key: "burst", label: "Burst", hint: "Bucket capacity" },
  { key: "token_budget_per_hour", label: "Token budget / hour", hint: "" },
  { key: "token_budget_per_day", label: "Token budget / day", hint: "" },
  { key: "token_budget_per_month", label: "Token budget / month", hint: "" },
] as const;

export default function ControlsPage() {
  const { policy, applyPolicyPatch } = useRateGuard();
  const [values, setValues] = useState<Record<string, string>>({});
  const [mode, setMode] = useState<string | undefined>(undefined);
  const [confirmOpen, setConfirmOpen] = useState(false);
  const [applying, setApplying] = useState(false);

  if (!policy) {
    return <Skeleton className="h-96 rounded-xl" />;
  }

  const dirtyEntries = Object.entries(values).filter(([, v]) => v !== "");
  const dirty = dirtyEntries.length > 0 || (mode !== undefined && mode !== policy.token_budget_mode);

  async function apply() {
    setApplying(true);
    try {
      const patch: Record<string, number | string> = {};
      for (const [key, v] of dirtyEntries) patch[key] = Number(v);
      if (mode !== undefined && mode !== policy!.token_budget_mode) patch.token_budget_mode = mode;
      await applyPolicyPatch(patch);
      toast.success("Policy applied", { description: "The running instance is using the new values now." });
      setValues({});
      setMode(undefined);
      setConfirmOpen(false);
    } catch (e) {
      toast.error("Failed to apply", { description: e instanceof Error ? e.message : "Unknown error" });
    } finally {
      setApplying(false);
    }
  }

  return (
    <div className="flex flex-col gap-4">
      <Card>
        <CardHeader>
          <CardTitle>Live policy</CardTitle>
          <CardDescription>
            Changes apply immediately to the running instance, in memory only — nothing here
            persists across a restart or edits a config file.
          </CardDescription>
        </CardHeader>
        <CardContent className="flex flex-col gap-5">
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
            {FIELDS.map((f) => (
              <div key={f.key} className="flex flex-col gap-1.5">
                <Label htmlFor={f.key}>{f.label}</Label>
                <Input
                  id={f.key}
                  type="number"
                  placeholder={String(policy[f.key as keyof typeof policy])}
                  value={values[f.key] ?? ""}
                  onChange={(e) => setValues((v) => ({ ...v, [f.key]: e.target.value }))}
                  className="mono"
                />
              </div>
            ))}
            <div className="flex flex-col gap-1.5">
              <Label>Token budget mode</Label>
              <Select value={mode ?? policy.token_budget_mode} onValueChange={(v) => setMode(v ?? undefined)}>
                <SelectTrigger className="w-full">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="hard-stop">hard-stop</SelectItem>
                  <SelectItem value="soft-stop">soft-stop</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </div>

          <div className="flex items-center gap-3">
            <Button disabled={!dirty} onClick={() => setConfirmOpen(true)}>
              Review changes
            </Button>
            {dirty && (
              <Button
                variant="ghost"
                onClick={() => {
                  setValues({});
                  setMode(undefined);
                }}
              >
                Discard
              </Button>
            )}
          </div>
        </CardContent>
      </Card>

      <Dialog open={confirmOpen} onOpenChange={setConfirmOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Apply to the live instance?</DialogTitle>
            <DialogDescription>This takes effect immediately for every key on this instance.</DialogDescription>
          </DialogHeader>
          <div className="flex flex-col gap-2 py-2">
            {dirtyEntries.map(([key, v]) => {
              const field = FIELDS.find((f) => f.key === key);
              return (
                <div key={key} className="flex items-center justify-between text-sm">
                  <span className="text-muted-foreground">{field?.label ?? key}</span>
                  <span className="mono font-medium">
                    {String(policy[key as keyof typeof policy])} → {v}
                  </span>
                </div>
              );
            })}
            {mode !== undefined && mode !== policy.token_budget_mode && (
              <div className="flex items-center justify-between text-sm">
                <span className="text-muted-foreground">Token budget mode</span>
                <span className="mono font-medium">
                  {policy.token_budget_mode} → {mode}
                </span>
              </div>
            )}
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setConfirmOpen(false)}>
              Cancel
            </Button>
            <Button onClick={apply} disabled={applying}>
              {applying ? "Applying…" : "Confirm"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
