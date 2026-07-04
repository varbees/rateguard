import type { Metadata } from "next";
import Link from "next/link";
import { Callout, DocH1, DocH2, DocsPager, P, Table } from "../../../components/docs/Docs";
import { CodeTabs } from "../../../components/docs/CodeTabs";

export const metadata: Metadata = {
  title: "Token budgets",
  description:
    "Hourly, daily, and monthly caps on LLM token consumption — hard-stop or soft-stop, with estimate-based reservations that keep concurrency high.",
};

export default function TokenBudgetsPage() {
  return (
    <>
      <DocH1 kicker="Guides">Token budgets</DocH1>
      <P>
        Rate limits count <em>requests</em>; budgets count <em>tokens</em> — the unit your
        provider bill is written in. RateGuard tracks hourly, daily, and monthly windows
        simultaneously, on both inbound requests and{" "}
        <Link href="/docs/outbound">outbound LLM calls</Link>.
      </P>
      <CodeTabs
        tabs={[
          {
            label: "Go",
            code: `rg := rateguard.New(rateguard.Config{
    Preset:              "llm-heavy",
    TokenBudgetPerHour:  250_000,
    TokenBudgetPerDay:   2_500_000,
    TokenBudgetPerMonth: 250_000_000,
    TokenBudgetMode:     rateguard.SoftStop, // or HardStop
})`,
          },
          {
            label: "Node.js",
            code: `const rg = new RateGuard({
  preset: 'llm-heavy',
  tokenBudgetPerHour: 250_000,
  tokenBudgetPerDay: 2_500_000,
  tokenBudgetPerMonth: 250_000_000,
  tokenBudgetMode: 'soft-stop',
});`,
          },
          {
            label: "Python",
            code: `rg = RateGuard(
    preset="llm-heavy",
    token_budget_per_hour=250_000,
    token_budget_per_day=2_500_000,
    token_budget_per_month=250_000_000,
    token_budget_mode="soft-stop",
)`,
          },
        ]}
      />

      <DocH2 id="modes">hard-stop vs soft-stop</DocH2>
      <Table
        head={["Mode", "When exhausted", "Best for"]}
        rows={[
          ["hard-stop", "Reject immediately (429)", "Production APIs, fragile upstreams, cost ceilings that must hold"],
          ["soft-stop", "Queue instead of rejecting", "Streaming and agent workloads where a mid-conversation 429 is worse than a short wait"],
        ]}
      />

      <DocH2 id="reservations">Reserve → commit accounting</DocH2>
      <P>
        A call&apos;s true cost is only known after the response arrives. RateGuard{" "}
        <strong>reserves</strong> an estimate up front and <strong>commits</strong> actual usage
        after — so parallel calls can&apos;t collectively blow through a nearly-empty budget.
      </P>
      <Callout kind="tip" title="Keep concurrency high under hard-stop">
        By default a hard-stop reservation holds <em>all remaining</em> budget until the response
        lands. Set <code>EstimatedTokensPerRequest</code> (Go) to bound each reservation to a
        realistic estimate so many calls can fly at once.
      </Callout>
      <P>
        Outbound budget scope is <code>{"{tenant}:{provider}:{model}:outbound"}</code>. Calls pass
        while any budget remains; the final call may overshoot (actual usage arrives
        post-response), then everything blocks until the window rolls.
      </P>

      <DocH2 id="agents">Let agents check first</DocH2>
      <P>
        The <code>get_token_budget</code> MCP tool answers &quot;how much is left — and would{" "}
        <code>estimated_tokens</code> fit?&quot; without consuming anything. See{" "}
        <Link href="/docs/agents-mcp">Agents &amp; MCP</Link>.
      </P>
      <DocsPager slug="token-budgets" />
    </>
  );
}
