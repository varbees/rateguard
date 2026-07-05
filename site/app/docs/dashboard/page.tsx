import type { Metadata } from "next";
import Link from "next/link";
import { Callout, DocH1, DocH2, DocsPager, P } from "../../../components/docs/Docs";
import { CodeBlock } from "../../../components/docs/CodeBlock";

export const metadata: Metadata = {
  title: "Dashboard & admin API",
  description:
    "A self-hosted control center for a running RateGuard instance — live budget, rate limit, circuit breaker, loop detection, and guardrail state, an MCP tool console, and live time-series traffic, with runtime policy tweaks.",
};

export default function DashboardPage() {
  return (
    <>
      <DocH1 kicker="Operate">Dashboard &amp; admin API</DocH1>
      <P>
        <code>packages/dashboard</code> is a self-hosted control center for a running RateGuard
        instance — six sections in a persistent sidebar: Overview, Analytics, Agents, Controls, MCP
        Console, and Settings. It talks to your instance&apos;s admin API directly from the browser
        — there is no separate database, and nothing is persisted by the dashboard itself beyond
        which instance you last pointed it at (saved locally so a page reload doesn&apos;t lose your
        connection).
      </P>

      <DocH2 id="run-it">Run it</DocH2>
      <P>The fastest path is the bundled demo stack — a live RateGuard instance generating synthetic traffic (including occasional guardrail violations, so every section has real data), and the dashboard pre-pointed at it:</P>
      <CodeBlock
        title="from the repo root"
        code={`docker compose up
# open http://localhost:3001`}
      />
      <P>
        For your own instance, wire the admin handler into whatever you&apos;re already running and
        point the dashboard&apos;s <strong>Instance</strong> field (Settings) at it:
      </P>
      <CodeBlock
        title="Go"
        code={`mux := http.NewServeMux()
mux.Handle("/metrics", rg.Metrics())
mux.Handle("/admin/", rg.AdminHandler())
mux.Handle("/", rg.HTTPMiddleware(yourHandler))
http.ListenAndServe(":8080", mux)`}
      />
      <Callout kind="note">
        Node and Python don&apos;t have an admin handler yet — this is Go-only today. The dashboard
        will show a connection error against a Node/Python instance until that ships.
      </Callout>
      <P>
        The dashboard talks to the Go admin API at <code>/admin/</code>. Node and Python don&apos;t
        have an admin handler yet — the dashboard will show a connection error against a
        Node/Python instance until that ships.
      </P>

      <DocH2 id="sections">What each section shows</DocH2>
      <ul style={{ paddingLeft: "1.25rem", marginBottom: "1rem" }}>
        <li style={{ marginBottom: "0.6rem" }}>
          <strong>Overview</strong> — live requests/sec and tokens/sec, cumulative counters, and the
          current state of every subsystem (budget, rate limit, breaker, loop detection) in one
          screen.
        </li>
        <li style={{ marginBottom: "0.6rem" }}>
          <strong>Analytics</strong> — real time-series charts (not historical — a live view since
          the dashboard was opened) of throughput and denial events, smoothed so the line moves
          fluidly rather than snapping between polls. For durable historical retention, scrape{" "}
          <code>/metrics</code> into Prometheus instead.
        </li>
        <li style={{ marginBottom: "0.6rem" }}>
          <strong>Agents</strong> — loop detection stats, this key&apos;s admission view (what an
          agent querying its own state would see), and <strong>guardrail violations</strong> — PII,
          prompt injection, and length checks, with counts by code and a recent-events feed. Content
          itself is never logged, only the violation code and message.
        </li>
        <li style={{ marginBottom: "0.6rem" }}>
          <strong>Controls</strong> — the full live policy (rps, burst, all three token budget
          windows, budget mode), diffed and confirmed before it applies to the running instance.
        </li>
        <li style={{ marginBottom: "0.6rem" }}>
          <strong>MCP Console</strong> — the complete MCP tool catalog with an interactive
          try-it panel that calls the exact handler behind each tool (the same ones an agent queries
          pre-flight over stdio) and shows the raw response.
        </li>
        <li>
          <strong>Settings</strong> — instance URL and query key (persisted locally), and the
          security posture reference below.
        </li>
      </ul>

      <DocH2 id="security">Security posture — read this before exposing it</DocH2>
      <P>
        <code>AdminHandler()</code> has <strong>no authentication</strong>. Anyone who can reach it
        can read your current limits and change them. Give it the same posture you&apos;d give
        pprof or an unauthenticated Prometheus <code>/metrics</code> endpoint:
      </P>
      <ul style={{ paddingLeft: "1.25rem", marginBottom: "1rem" }}>
        <li style={{ marginBottom: "0.4rem" }}>
          Bind it to <code>localhost</code> or an internal network, never a public interface.
        </li>
        <li style={{ marginBottom: "0.4rem" }}>
          If it must be reachable beyond that, put your own auth in front of it — a reverse proxy
          with basic auth, an internal VPN, or a service mesh policy.
        </li>
        <li>
          It is entirely opt-in: nothing wires <code>/admin/*</code> into{" "}
          <code>HTTPMiddleware</code> or <code>ChiMiddleware</code> automatically.
        </li>
      </ul>

      <DocH2 id="tweak">What &quot;tweak live policy&quot; actually does</DocH2>
      <P>
        <code>PATCH /admin/policy</code> calls <code>SDK.SetPolicy</code>, which atomically
        overrides the fields you send (requests/sec, burst, token budgets, budget mode) on the
        running instance. It&apos;s <strong>in-memory only</strong> — it does not persist across a
        restart and does not edit any config file or environment variable. Existing per-key bucket
        state isn&apos;t reset; the new policy takes effect on the next check for each key.
      </P>
      <CodeBlock
        title="the underlying Go API, if you want to script it instead of using the UI"
        code={`rps := 50
sdk.SetPolicy(rateguard.PolicyUpdate{RequestsPerSecond: &rps})`}
      />

      <DocH2 id="mcp-console">The MCP Console, and why it's not just a demo</DocH2>
      <P>
        <code>POST /admin/mcp/call</code> invokes the same handler function an MCP client (Claude
        Code, Cursor) calls over stdio — there is no separate implementation for the dashboard to
        drift from the real tool behavior. It&apos;s the fastest way to check what an agent would
        actually see before wiring up a real MCP client, or to sanity-check a tool&apos;s behavior
        after a config change.
      </P>

      <DocH2 id="agent-driven">Letting an agent spin it up for you</DocH2>
      <P>
        If you&apos;re working with Claude Code, Cursor, or another coding agent already in this
        repo, you can just ask it to run the stack rather than doing it yourself — starting a local
        Docker Compose stack is exactly the kind of task an agent should do on request:
      </P>
      <CodeBlock
        title='ask your agent'
        code={`"Run the RateGuard dashboard demo stack and open it in the browser."
→ the agent runs: docker compose up -d
→ then navigates to http://localhost:3001`}
      />
      <Callout kind="tip">
        This is a deliberate choice, not an oversight: nothing in RateGuard auto-starts a server on
        its own, and nothing repoints a real service&apos;s provider config at a new proxy
        automatically either. Spinning up a network-facing process, or changing what traffic flows
        through it, is the kind of action that should be initiated on request and verified before
        it's live — not triggered silently as a side effect of something else.
      </Callout>

      <DocsPager slug="dashboard" />
    </>
  );
}
