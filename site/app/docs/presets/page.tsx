import type { Metadata } from "next";
import Link from "next/link";
import { Callout, DocH1, DocH2, DocsPager, P, Table } from "../../../components/docs/Docs";
import { CodeTabs } from "../../../components/docs/CodeTabs";

export const metadata: Metadata = {
  title: "Presets",
  description:
    "Eight presets covering every 2026 workload — from local dev to multi-agent orchestration. Set once, override per-field.",
};

export default function PresetsPage() {
  return (
    <>
      <DocH1 kicker="Get started">Presets</DocH1>
      <P>
        RateGuard ships with 8 presets covering every 2026 workload. Set once, override any field.
        The same presets exist in all three SDKs with identical values.
      </P>
      <Table
        head={["Preset", "RPS", "Burst", "Tokens/hr", "Tokens/day", "Tokens/mo", "Mode", "Use case"]}
        rows={[
          [<code key="p">dev</code>, "10", "20", "1K", "10K", "100K", "hard-stop", "Local development"],
          [<code key="p">standard</code>, "100", "200", "10K", "100K", "1M", "hard-stop", "Production APIs"],
          [<code key="p">high-throughput</code>, "1,000", "2,000", "100K", "1M", "10M", "hard-stop", "High-volume services"],
          [<code key="p">streaming-llm</code>, "200", "500", "500K", "5M", "500M", "soft-stop", "Real-time LLM streaming"],
          [<code key="p">agent-orchestrator</code>, "500", "1,000", "1M", "10M", "1B", "soft-stop", "Multi-agent systems"],
          [<code key="p">llm-heavy</code>, "500", "1,000", "250K", "2.5M", "250M", "soft-stop", "LLM-intensive apps"],
          [<code key="p">mcp-server</code>, "30", "60", "50K", "500K", "50M", "hard-stop", "MCP tool servers"],
          [<code key="p">strict-upstream-protection</code>, "50", "75", "5K", "20K", "2M", "hard-stop", "Fragile upstreams"],
        ]}
      />
      <Callout kind="note" title="Aliases">
        Friendly aliases resolve to the same presets: <code>free</code>→<code>dev</code>,{" "}
        <code>starter</code>→<code>standard</code>, <code>pro</code>→<code>high-throughput</code>,{" "}
        <code>business</code>/<code>enterprise</code>→<code>llm-heavy</code>, <code>streaming</code>→
        <code>streaming-llm</code>, <code>agent</code>/<code>multi-agent</code>→
        <code>agent-orchestrator</code>, <code>mcp</code>→<code>mcp-server</code>.
      </Callout>

      <DocH2 id="override">Override any field</DocH2>
      <P>Start from a preset, then override exactly what differs for your workload:</P>
      <CodeTabs
        tabs={[
          {
            label: "Go",
            code: `rg := rateguard.New(rateguard.Config{
    Preset:             "streaming-llm",
    RequestsPerSecond:  300,        // override preset RPS
    TokenBudgetPerHour: 750_000,    // override token budget
})`,
          },
          {
            label: "Node.js",
            code: `const rg = new RateGuard({
  preset: 'streaming-llm',
  rateLimit: { requestsPerSecond: 300 },   // override preset RPS
  tokenBudget: { hourLimit: 750_000 },     // override token budget
});`,
          },
          {
            label: "Python",
            code: `rg = RateGuard(
    preset="streaming-llm",
    rate_limit=RateLimitOptions(requests_per_second=300),  # override preset RPS
    token_budget=TokenBudgetOptions(hour_limit=750_000),   # override token budget
)`,
          },
        ]}
      />

      <DocH2 id="modes">hard-stop vs soft-stop</DocH2>
      <P>
        <strong>hard-stop</strong> rejects once the budget is exhausted.{" "}
        <strong>soft-stop</strong> queues instead of rejecting — the right default for streaming
        and agent workloads where a hard 429 mid-conversation is worse than a short wait. Details
        in <Link href="/docs/token-budgets">Token budgets</Link>.
      </P>

      <DocH2 id="algorithm">The algorithm underneath</DocH2>
      <P>
        All three SDKs use the <strong>token bucket</strong> algorithm — the same RFC-standards-track
        approach as Kong, Envoy, and AWS:
      </P>
      <CodeTabs
        tabs={[
          {
            label: "Formula",
            code: `tokens = min(burst, tokens + elapsed × rps)
Allow:  tokens >= 1.0 → consume 1
Deny:   retry_after = ceil((1.0 - tokens) / rps) × 1000ms`,
          },
        ]}
      />
      <P>
        Every limiter also implements <code>Peek</code> — a non-consuming pre-flight query. That
        single design decision is what makes agent-native behavior possible; see{" "}
        <Link href="/docs/agents-mcp">Agents &amp; MCP</Link>.
      </P>
      <DocsPager slug="presets" />
    </>
  );
}
