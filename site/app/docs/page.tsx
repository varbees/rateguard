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
        Most rate limiters were built for REST APIs, where requests are cheap and roughly
        uniform. RateGuard is built for the LLM era — where a single request can consume 100,000
        tokens, streaming responses span minutes, and your provider bill depends on how well you
        control it.
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
        Most tools make agents discover limits by hitting a 429 and backing off. RateGuard
        answers <strong>before the request leaves the process</strong>: MCP tools with peek
        semantics let any agent — Claude Code, Cursor, or your own — ask &quot;can I make this
        call?&quot; without consuming budget. See{" "}
        <Link href="/docs/agents-mcp">Agents &amp; MCP</Link>.
      </P>

      <DocH2 id="capabilities">Capabilities</DocH2>
      <Table
        head={["Capability", "What it means"]}
        rows={[
          [<strong key="1">Outbound spend tracking</strong>, <>Wrap <code>http.Client</code>/<code>fetch</code>/<code>httpx</code> — real token usage from JSON and SSE streaming responses, metered into budgets.</>],
          [<strong key="2">Agent pre-flight (MCP)</strong>, "7 tools + a zero-dependency stdio server, identical across all 3 languages. Querying never consumes budget."],
          [<strong key="3">Token budgets</strong>, "Hourly / daily / monthly caps on LLM tokens. Hard-stop or soft-stop."],
          [<strong key="4">Loop detection</strong>, "SHA-256 payload fingerprinting halts runaway agent loops."],
          [<strong key="5">Provider fallback</strong>, "Automatic failover across OpenAI-compatible providers with credential isolation."],
          [<strong key="6">Circuit breakers</strong>, "Per-provider outbound, per-upstream inbound. Closed → open → half-open."],
          [<strong key="7">GenAI observability</strong>, <>OpenTelemetry <code>gen_ai.*</code> spans per the official semantic conventions, plus Prometheus <code>/metrics</code>.</>],
          [<strong key="8">Guardrails</strong>, "PII and prompt-injection detection wired into the middleware — violations return 422."],
        ]}
      />

      <DocH2 id="vs">How it compares</DocH2>
      <P>
        The honest comparison is about <strong>where enforcement lives</strong>, not who has the
        longer feature list. LiteLLM and Kong AI Gateway both ship token-aware LLM rate limiting
        today. The difference is architectural: they are a service you deploy in front of your
        app, RateGuard is a library that runs inside it.
      </P>
      <Table
        head={["", "RateGuard", "express-rate-limit", "LiteLLM", "Kong AI Gateway"]}
        rows={[
          ["Shape", "In-process library", "In-process library", "Proxy you deploy", "Gateway you operate"],
          ["Embeddable in", "Go · Node · Python", "Node only", "Python¹", "—"],
          ["Meters outbound LLM spend inside your process", "✅", "❌", "At the proxy hop", "At the gateway hop"],
          ["Agent queries its own limit pre-flight (MCP, no 429)", "✅ 7 tools", "❌", "❌", "❌"],
          ["Cryptographic budget delegation (Ed25519)", "✅", "❌", "❌", "❌"],
          ["API keys never leave your app", "✅", "n/a", "❌ terminate at proxy", "❌ terminate at gateway"],
          ["Open source", "MIT", "MIT", "MIT", "OSS core + Enterprise"],
        ]}
      />
      <P>
        ¹ LiteLLM&apos;s proxy is callable over HTTP from any language; its embeddable SDK is
        Python. RateGuard&apos;s durable claim is the architecture — in your process, no hop, keys
        never leave — plus budget delegation you can verify with a signature, not a longer list of
        checkmarks.
      </P>
      <P>
        Ready? <Link href="/docs/quickstart">Install it in one line →</Link>
      </P>
      <DocsPager slug="" />
    </>
  );
}
