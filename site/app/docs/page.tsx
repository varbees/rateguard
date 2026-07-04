import type { Metadata } from "next";
import Link from "next/link";
import { Callout, DocH1, DocH2, DocsPager, P, Table } from "../../components/docs/Docs";
import { CodeTabs } from "../../components/docs/CodeTabs";

export const metadata: Metadata = {
  title: "Introduction",
  description:
    "RateGuard is the AI-native rate limiting SDK for Go, Node.js, and Python — outbound LLM spend tracking, agent pre-flight queries over MCP, token budgets, and loop detection with zero infrastructure.",
};

export default function IntroPage() {
  return (
    <>
      <DocH1 kicker="Get started">What is RateGuard?</DocH1>
      <P>
        RateGuard is <strong>middleware that makes every LLM call transparent</strong>. Drop it
        into your app and every token consumed, every rate limit hit, every circuit breaker trip
        becomes a traceable event — with zero infrastructure. Three SDKs (Go, Node.js, Python),
        identical behavior, one API.
      </P>
      <P>
        Every other rate limiting tool was built for REST APIs. RateGuard was built for the LLM
        era — where a single request can consume 100,000 tokens, streaming responses span
        minutes, and your provider bill depends on how well you control it.
      </P>
      <Callout kind="note" title="Not a proxy">
        RateGuard runs <strong>inside your application process</strong>. No gateway, no extra
        service, no added latency, no new attack surface. Your API keys never leave your app.
      </Callout>

      <DocH2 id="two-jobs">The two jobs it does</DocH2>
      <P>
        <strong>1. Guard the door (inbound).</strong> Classic rate limiting middleware for your
        own API — token bucket algorithm, per-tenant and per-route, with presets tuned for LLM
        workloads.
      </P>
      <P>
        <strong>2. Guard the money (outbound).</strong> Real LLM spend happens on outbound calls.
        RateGuard wraps the HTTP client your LLM SDK already uses, so every call to OpenAI,
        Anthropic, Gemini, or any OpenAI-compatible provider is budgeted, breaker-protected, and
        metered with the provider&apos;s <em>real</em> token counts — including streaming.
      </P>
      <CodeTabs
        tabs={[
          {
            label: "Go",
            code: `client := rg.WrapClient(&http.Client{})
openai := openai.NewClient(option.WithHTTPClient(client))`,
          },
          {
            label: "Node.js",
            code: `const client = new OpenAI({ fetch: rg.wrapFetch() });`,
          },
          {
            label: "Python",
            code: `client = OpenAI(http_client=rg.wrap_httpx_client())`,
          },
        ]}
      />

      <DocH2 id="agents">Built for agents</DocH2>
      <P>
        Every AI gateway makes agents discover limits by hitting 429s. RateGuard answers{" "}
        <strong>before the request leaves the process</strong>: five MCP tools with peek
        semantics let any agent — Claude Code, Cursor, or your own — ask &quot;can I make this
        call?&quot; without consuming budget. See{" "}
        <Link href="/docs/agents-mcp">Agents &amp; MCP</Link>.
      </P>

      <DocH2 id="capabilities">Capabilities</DocH2>
      <Table
        head={["Capability", "What it means"]}
        rows={[
          [<strong key="1">Outbound spend tracking</strong>, <>Wrap <code>http.Client</code>/<code>fetch</code>/<code>httpx</code> — real token usage from JSON and SSE streaming responses, metered into budgets.</>],
          [<strong key="2">Agent pre-flight (MCP)</strong>, "5 MCP tools + a zero-dependency stdio server. Querying never consumes budget."],
          [<strong key="3">Token budgets</strong>, "Hourly / daily / monthly caps on LLM tokens. Hard-stop or soft-stop."],
          [<strong key="4">Loop detection</strong>, "SHA-256 payload fingerprinting halts runaway agent loops."],
          [<strong key="5">Provider fallback</strong>, "Automatic failover across OpenAI-compatible providers with credential isolation."],
          [<strong key="6">Circuit breakers</strong>, "Per-provider outbound, per-upstream inbound. Closed → open → half-open."],
          [<strong key="7">GenAI observability</strong>, <>OpenTelemetry <code>gen_ai.*</code> spans per the official semantic conventions, plus Prometheus <code>/metrics</code>.</>],
          [<strong key="8">Guardrails</strong>, "PII and prompt-injection detection wired into the middleware — violations return 422."],
        ]}
      />

      <DocH2 id="vs">How it compares</DocH2>
      <Table
        head={["", "RateGuard", "express-rate-limit", "LiteLLM", "Kong"]}
        rows={[
          ["Multi-language", "✅ Go + Node + Python", "❌ JS only", "❌ Python only", "❌"],
          ["Zero infrastructure", "✅ Middleware", "✅", "❌ Proxy required", "❌ Gateway"],
          ["In-process outbound tracking", "✅ Client wrapper", "❌", "❌ Proxy only", "❌"],
          ["Agent pre-flight (MCP)", "✅ 5 tools + stdio", "❌", "❌", "❌"],
          ["Agent loop detection", "✅", "❌", "❌", "❌"],
          ["LLM token budgets", "✅", "❌", "✅", "❌"],
          ["GenAI OTel conventions", "✅", "❌", "❌", "❌"],
          ["Open source", "✅ MIT", "✅", "✅", "Partial"],
        ]}
      />
      <P>
        Ready? <Link href="/docs/quickstart">Install it in one line →</Link>
      </P>
      <DocsPager slug="" />
    </>
  );
}
