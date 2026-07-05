"use client";

import { useRateGuard } from "@/lib/rateguard-context";
import type { AdminState } from "@/lib/api";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { StatusPill } from "@/components/status-pill";
import { Skeleton } from "@/components/ui/skeleton";

export default function AgentsPage() {
  const { state, status } = useRateGuard();

  if (status !== "connected" || !state) {
    return <Skeleton className="h-96 rounded-xl" />;
  }

  const loop = state.loop_detector;
  const halted = loop?.halted ?? 0;

  return (
    <div className="flex flex-col gap-4">
      <Card>
        <CardHeader>
          <div className="flex items-center justify-between">
            <div>
              <CardTitle>Loop detection</CardTitle>
              <CardDescription>
                SHA-256 payload fingerprinting catches an agent repeating itself at increasing
                sequence depth — the signature of a runaway loop — before it burns through budget.
              </CardDescription>
            </div>
            <StatusPill
              label={loop?.enabled ? (halted > 0 ? `${halted} halted` : "clear") : "disabled"}
              tone={loop?.enabled ? (halted > 0 ? "warning" : "good") : "neutral"}
            />
          </div>
        </CardHeader>
        <CardContent>
          <div className="grid grid-cols-3 gap-4">
            <Metric label="Fingerprints tracked" value={loop?.total_fingerprints ?? 0} />
            <Metric label="Loops halted" value={halted} />
            <Metric label="Max sequence depth" value={loop?.max_depth ?? "—"} />
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>This key&apos;s admission view</CardTitle>
          <CardDescription>
            What an agent querying <code className="mono">get_rate_limit_state</code> /{" "}
            <code className="mono">get_token_budget</code> for this key would see right now —
            exactly what it uses to decide whether to make the call.
          </CardDescription>
        </CardHeader>
        <CardContent className="grid grid-cols-1 gap-3 sm:grid-cols-3">
          <div className="rounded-md border p-3">
            <p className="text-xs text-muted-foreground">Rate limit</p>
            <p className="mono mt-1 text-sm font-medium">
              {state.rate_limit?.allowed ? "would allow" : "would deny"}
            </p>
          </div>
          <div className="rounded-md border p-3">
            <p className="text-xs text-muted-foreground">Token budget</p>
            <p className="mono mt-1 text-sm font-medium">
              {state.token_budget?.allowed ? "within budget" : "would deny"}
            </p>
          </div>
          <div className="rounded-md border p-3">
            <p className="text-xs text-muted-foreground">Circuit breaker</p>
            <p className="mono mt-1 text-sm font-medium">{state.circuit_breaker?.state ?? "unknown"}</p>
          </div>
        </CardContent>
      </Card>

      <GuardrailsCard guardrails={state.guardrails} />
    </div>
  );
}

function GuardrailsCard({ guardrails }: { guardrails: AdminState["guardrails"] }) {
  if (!guardrails?.enabled) {
    return (
      <Card className="border-dashed">
        <CardHeader>
          <CardTitle className="text-sm text-muted-foreground">Guardrails</CardTitle>
          <CardDescription>
            No <code className="mono">Guardrails</code> configured on this instance — nothing to
            violate. Set <code className="mono">Config.Guardrails</code> (e.g.{" "}
            <code className="mono">StandardGuardrails()</code>) to catch PII, prompt injection, or
            oversized payloads before they reach your handler.
          </CardDescription>
        </CardHeader>
      </Card>
    );
  }

  const total = guardrails.total ?? 0;
  const byCode = guardrails.by_code ?? {};
  const recent = guardrails.recent ?? [];

  return (
    <Card>
      <CardHeader>
        <div className="flex items-center justify-between">
          <div>
            <CardTitle>Guardrail violations</CardTitle>
            <CardDescription>
              PII, prompt injection, and length checks against request bodies — content is never
              logged, only the violation code and message.
            </CardDescription>
          </div>
          <StatusPill label={total > 0 ? `${total} caught` : "clear"} tone={total > 0 ? "warning" : "good"} />
        </div>
      </CardHeader>
      <CardContent className="flex flex-col gap-4">
        {Object.keys(byCode).length > 0 && (
          <div className="flex flex-wrap gap-3">
            {Object.entries(byCode).map(([code, count]) => (
              <div key={code} className="rounded-md border px-3 py-2">
                <p className="mono text-xs text-muted-foreground">{code}</p>
                <p className="mono text-lg font-semibold tabular-nums">{count}</p>
              </div>
            ))}
          </div>
        )}
        {recent.length > 0 ? (
          <div className="flex flex-col gap-2">
            <p className="text-xs font-medium text-muted-foreground">Recent (last {recent.length})</p>
            <div className="flex max-h-64 flex-col gap-1.5 overflow-y-auto">
              {[...recent].reverse().map((event, i) => (
                <div key={i} className="flex items-center justify-between rounded-md border px-3 py-2 text-sm">
                  <span className="mono text-xs text-muted-foreground">{event.code}</span>
                  <span className="truncate pl-3 text-xs">{event.message}</span>
                  <span className="mono pl-3 text-xs text-muted-foreground">
                    {new Date(event.at).toLocaleTimeString()}
                  </span>
                </div>
              ))}
            </div>
          </div>
        ) : (
          <p className="text-sm text-muted-foreground">No violations caught yet.</p>
        )}
      </CardContent>
    </Card>
  );
}

function Metric({ label, value }: { label: string; value: string | number }) {
  return (
    <div>
      <p className="text-xs text-muted-foreground">{label}</p>
      <p className="mono mt-1 text-2xl font-semibold tabular-nums">{value}</p>
    </div>
  );
}
