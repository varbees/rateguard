"use client";

import Link from "next/link";
import { Activity, AlertTriangle, ArrowRight, Gauge, Repeat, Zap } from "lucide-react";
import { useRateGuard } from "@/lib/rateguard-context";
import { StatCard } from "@/components/stat-card";
import { StatusPill } from "@/components/status-pill";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Progress } from "@/components/ui/progress";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";

export default function OverviewPage() {
  const { state, counters, history, status, target } = useRateGuard();

  if (status === "error") {
    return <ConnectionError target={target} />;
  }
  if (!state || !counters) {
    return <OverviewSkeleton />;
  }

  const latestRate = history.at(-1);
  const budget = state.token_budget;
  const rate = state.rate_limit;
  const breaker = state.circuit_breaker;
  const loop = state.loop_detector;

  const budgetPct = budget && budget.applied ? Math.min(100, ((budget.limit - budget.remaining) / budget.limit) * 100) : 0;
  const ratePct = rate && rate.applied ? Math.min(100, (rate.remaining / rate.limit) * 100) : 100;

  return (
    <div className="flex flex-col gap-6">
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <StatCard
          label="Requests / sec"
          value={(latestRate?.requestsPerSec ?? 0).toFixed(1)}
          numericValue={latestRate?.requestsPerSec ?? 0}
          decimals={1}
          sub={`${counters.requestsTotal.toLocaleString("en-US")} total`}
          icon={Zap}
        />
        <StatCard
          label="Tokens consumed"
          value={counters.tokensConsumedTotal.toLocaleString("en-US")}
          numericValue={counters.tokensConsumedTotal}
          sub={`${(latestRate?.tokensPerSec ?? 0).toFixed(0)}/s live`}
          icon={Gauge}
        />
        <StatCard
          label="Rate limit hits"
          value={counters.rateLimitHitsTotal.toLocaleString("en-US")}
          numericValue={counters.rateLimitHitsTotal}
          sub="since process start"
          icon={Activity}
        />
        <StatCard
          label="Circuit breaker trips"
          value={counters.circuitBreakerTripsTotal.toLocaleString("en-US")}
          numericValue={counters.circuitBreakerTripsTotal}
          sub={`${counters.outboundFallbacksTotal} provider fallbacks`}
          icon={Repeat}
        />
      </div>

      <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
        <Card>
          <CardHeader>
            <div className="flex items-center justify-between">
              <CardTitle>Token budget</CardTitle>
              <StatusPill
                label={budget?.allowed === false ? "exhausted" : "within budget"}
                tone={budget?.allowed === false ? "critical" : budgetPct >= 70 ? "warning" : "good"}
              />
            </div>
            <CardDescription>
              {budget?.applied ? `${budget.window || "closest-to-limit window"}` : "not configured for this key"}
            </CardDescription>
          </CardHeader>
          <CardContent>
            {budget?.applied ? (
              <>
                <Progress value={budgetPct} className="h-2" />
                <p className="mt-2 font-mono text-sm tabular-nums text-muted-foreground">
                  {(budget.limit - budget.remaining).toLocaleString("en-US")} / {budget.limit.toLocaleString("en-US")} tokens
                </p>
              </>
            ) : (
              <p className="text-sm text-muted-foreground">No token budget configured.</p>
            )}
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <div className="flex items-center justify-between">
              <CardTitle>Rate limit</CardTitle>
              <StatusPill
                label={rate?.allowed === false ? "throttled" : "accepting"}
                tone={rate?.allowed === false ? "critical" : ratePct <= 20 ? "warning" : "good"}
              />
            </div>
            <CardDescription>tokens remaining in bucket</CardDescription>
          </CardHeader>
          <CardContent>
            {rate?.applied ? (
              <>
                <Progress value={ratePct} className="h-2" />
                <p className="mt-2 font-mono text-sm tabular-nums text-muted-foreground">
                  {rate.remaining} / {rate.limit} req/s
                </p>
              </>
            ) : (
              <p className="text-sm text-muted-foreground">Rate limiting not applied.</p>
            )}
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <div className="flex items-center justify-between">
              <CardTitle>Circuit breaker</CardTitle>
              <StatusPill
                label={breaker?.state ?? "unknown"}
                tone={breaker?.state === "open" ? "critical" : breaker?.state === "half-open" ? "warning" : "good"}
              />
            </div>
            <CardDescription>upstream provider health</CardDescription>
          </CardHeader>
          <CardContent>
            <p className="text-sm text-muted-foreground">
              {breaker?.state === "open"
                ? "Failing upstream — requests rejected until cooldown elapses."
                : breaker?.state === "half-open"
                  ? "Probing recovery with limited traffic."
                  : "Healthy — traffic flowing normally."}
            </p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <div className="flex items-center justify-between">
              <CardTitle>Loop detection</CardTitle>
              <StatusPill
                label={loop?.enabled ? ((loop.halted ?? 0) > 0 ? `${loop.halted} halted` : "clear") : "disabled"}
                tone={loop?.enabled ? ((loop.halted ?? 0) > 0 ? "warning" : "good") : "neutral"}
              />
            </div>
            <CardDescription>runaway agent fingerprinting</CardDescription>
          </CardHeader>
          <CardContent>
            <p className="font-mono text-sm tabular-nums text-muted-foreground">
              {loop?.total_fingerprints ?? 0} fingerprints tracked · max depth {loop?.max_depth ?? "-"}
            </p>
          </CardContent>
        </Card>
      </div>

      <div className="flex flex-wrap gap-3">
        <Button
          variant="outline"
          nativeButton={false}
          render={
            <Link href="/analytics">
              View live traffic <ArrowRight />
            </Link>
          }
        />
        <Button
          variant="outline"
          nativeButton={false}
          render={
            <Link href="/controls">
              Tweak policy <ArrowRight />
            </Link>
          }
        />
        <Button
          variant="outline"
          nativeButton={false}
          render={
            <Link href="/mcp">
              Try MCP tools <ArrowRight />
            </Link>
          }
        />
      </div>
    </div>
  );
}

function ConnectionError({ target }: { target: string }) {
  return (
    <Card className="border-destructive/40 bg-destructive/5">
      <CardHeader>
        <div className="flex items-center gap-2">
          <AlertTriangle className="size-4 text-destructive" />
          <CardTitle>Can&apos;t reach {target}</CardTitle>
        </div>
        <CardDescription>
          Point this at a RateGuard instance running <code className="mono">rg.AdminHandler()</code>. Check the
          Instance field in Settings.
        </CardDescription>
      </CardHeader>
    </Card>
  );
}

function OverviewSkeleton() {
  return (
    <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
      {Array.from({ length: 4 }).map((_, i) => (
        <Skeleton key={i} className="h-28 rounded-xl" />
      ))}
    </div>
  );
}
