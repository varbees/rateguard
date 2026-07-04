import type { Metadata } from "next";
import Link from "next/link";
import { DocH1, DocH2, DocsPager, P, Table } from "../../../components/docs/Docs";
import { CodeBlock } from "../../../components/docs/CodeBlock";

export const metadata: Metadata = {
  title: "Configuration",
  description:
    "The full RateGuard config surface — presets, rate limits, token budgets, observability, multi-tenancy, guardrails, and loop detection.",
};

export default function ConfigurationPage() {
  return (
    <>
      <DocH1 kicker="Reference">Configuration</DocH1>
      <P>
        The Go struct is the canonical shape; Node.js uses camelCase keys and Python uses
        snake_case keys with identical semantics.
      </P>
      <CodeBlock
        title="Go"
        code={`type Config struct {
    Preset               string          // preset name or alias
    RequestsPerSecond    int             // override preset RPS
    Burst                int             // override preset burst
    TokenBudgetPerHour   int64           // override token budget
    TokenBudgetPerDay    int64
    TokenBudgetPerMonth  int64
    TokenBudgetMode      TokenBudgetMode // "hard-stop" or "soft-stop"
    ServiceName          string          // OTel service name
    OTLPCollectorEndpoint string         // OTel collector URL
    RedisClient          *redis.Client   // distributed rate limiting
    CircuitBreaker       CircuitBreakerOptions
    EventEmitter         EventEmitter    // custom event handler
    EventEndpoint        string          // HTTP event webhook
    TenantID             string          // multi-tenant key
    RouteID              string
    UpstreamID           string
    Provider             string          // LLM provider name
    Model                string          // LLM model name

    EstimatedTokensPerRequest int64      // bound hard-stop budget reservations
    Guardrails           *GuardrailChain // violations → 422
    LoopDetection        bool            // agent loop detection
    LoopMaxDepth         int             // max sequence depth (default 50)
    MaxBufferedResponseBytes int         // token-extraction buffer cap (default 1 MiB)
}`}
      />

      <DocH2 id="groups">Field groups</DocH2>
      <Table
        head={["Group", "Fields", "Notes"]}
        rows={[
          ["Rate limiting", <><code>Preset</code>, <code>RequestsPerSecond</code>, <code>Burst</code></>, <>Preset values in <Link href="/docs/presets">Presets</Link>; overrides win.</>],
          ["Token budgets", <><code>TokenBudgetPerHour/Day/Month</code>, <code>TokenBudgetMode</code>, <code>EstimatedTokensPerRequest</code></>, <>See <Link href="/docs/token-budgets">Token budgets</Link>.</>],
          ["Scoping", <><code>TenantID</code>, <code>RouteID</code>, <code>UpstreamID</code>, <code>Provider</code>, <code>Model</code></>, "Partition buckets, budgets, and breakers."],
          ["Distribution", <code>RedisClient</code>, "Optional — without it, limiting is process-local."],
          ["Observability", <><code>ServiceName</code>, <code>OTLPCollectorEndpoint</code>, <code>EventEmitter</code>, <code>EventEndpoint</code></>, <>See <Link href="/docs/observability">Observability</Link>.</>],
          ["Agent safety", <><code>LoopDetection</code>, <code>LoopMaxDepth</code>, <code>Guardrails</code></>, <>See <Link href="/docs/loop-detection">Loop detection</Link> and <Link href="/docs/guardrails">Guardrails</Link>.</>],
          ["Streaming", <code>MaxBufferedResponseBytes</code>, "Caps the side-scan buffer used for token extraction (default 1 MiB)."],
        ]}
      />

      <DocH2 id="more">Deeper reference</DocH2>
      <P>
        The complete API reference — every adapter, outbound option, MCP tool schema, and event
        payload — lives in the repository:{" "}
        <a href="https://github.com/varbees/rateguard/blob/main/docs/API_REFERENCE.md">
          docs/API_REFERENCE.md
        </a>
        . A machine-readable config schema ships as{" "}
        <a href="https://github.com/varbees/rateguard/blob/main/config.schema.json">
          config.schema.json
        </a>
        , and <a href="/llms.txt">llms.txt</a> carries these docs in a format AI readers ingest
        directly.
      </P>
      <DocsPager slug="configuration" />
    </>
  );
}
