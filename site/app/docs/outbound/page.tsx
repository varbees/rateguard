import type { Metadata } from "next";
import Link from "next/link";
import { Callout, DocH1, DocH2, DocsPager, P, Table } from "../../../components/docs/Docs";
import { CodeTabs } from "../../../components/docs/CodeTabs";

export const metadata: Metadata = {
  title: "Track LLM spend",
  description:
    "Wrap the HTTP client your LLM SDK already uses — real token usage from JSON and SSE streaming responses, metered into budgets with per-provider circuit breakers.",
};

export default function OutboundPage() {
  return (
    <>
      <DocH1 kicker="Guides">Track LLM spend</DocH1>
      <P>
        Inbound middleware protects your API. But real LLM spend happens on{" "}
        <strong>outbound</strong> calls — and RateGuard rides the HTTP client your LLM SDK already
        uses. Not a proxy. Not a new service. No YAML, no Redis, no new attack surface.
      </P>
      <CodeTabs
        tabs={[
          {
            label: "Go",
            code: `rg := rateguard.New(rateguard.Config{
    Preset:             "llm-heavy",
    TokenBudgetPerHour: 1_000_000,
})

client := rg.WrapClient(&http.Client{})   // or rg.Transport(next, opts)
openai := openai.NewClient(option.WithHTTPClient(client))
claude := anthropic.NewClient(option.WithHTTPClient(client))`,
          },
          {
            label: "Node.js",
            code: `const rg = new RateGuard({ preset: 'llm-heavy' });

const client = new OpenAI({ fetch: rg.wrapFetch() });
// Options: { mode: 'enforce' | 'observe', chain: ProviderEntry[], fetch }`,
          },
          {
            label: "Python",
            code: `rg = RateGuard(preset="llm-heavy")

client = OpenAI(http_client=rg.wrap_httpx_client())        # sync
aclient = AsyncOpenAI(http_client=rg.wrap_httpx_async_client())  # async

# Advanced:
# create_httpx_transport(rg.runtime, mode="observe",
#                        chain=[FallbackProvider(...)])`,
          },
        ]}
      />
      <P>
        Every call through the wrapped client is budgeted, breaker-protected per provider, and
        metered with <strong>real token usage from the provider&apos;s own response</strong> —
        including streaming. 26 OpenAI-compatible hosts across 23 providers are detected out of the
        box — OpenAI, DeepSeek, Groq, Mistral, Together, OpenRouter, xAI, Perplexity, Moonshot,
        Fireworks, Cerebras, Cohere, DashScope, SambaNova, NVIDIA NIM, DeepInfra, Hugging Face,
        Baseten, Nebius, Z.AI, SiliconFlow, Requesty, and GitHub Models — plus Anthropic, Gemini,
        Vertex, Azure OpenAI, AWS Bedrock, and any self-hosted <code>/chat/completions</code> server
        (vLLM, Ollama, llama.cpp, LocalAI, ...).
      </P>

      <DocH2 id="why-wire">Why count at the wire?</DocH2>
      <P>
        Framework-level token counting is unreliable today: LangChain reports incorrect counts in
        streaming mode (langchain#30429), CrewAI&apos;s <code>token_usage</code> disagrees with
        the provider&apos;s own numbers, and every aggregation layer re-implements usage parsing
        per provider. RateGuard counts <strong>below</strong> the framework, at the transport
        layer — the numbers are whatever the provider actually put in the response.
      </P>
      <Callout kind="note" title="Streaming handled correctly">
        SSE bytes pass through untouched while usage is extracted from a bounded side-scan.
        OpenAI&apos;s <code>usage: null</code> intermediate events and Anthropic&apos;s split{" "}
        <code>message_start</code>/<code>message_delta</code> shapes are both handled — the two
        places naive implementations break.
      </Callout>
      <Callout kind="warn" title="Streaming needs usage turned on — or the budget can't see it">
        OpenAI-compatible providers emit <strong>no usage at all</strong> in a stream unless you
        ask for it: set <code>stream_options: {"{"} include_usage: true {"}"}</code> on the request
        (Anthropic emits split usage automatically; Gemini emits <code>usageMetadata</code>). Without
        an emitted usage record — or for a response larger than{" "}
        <code>MaxBufferedResponseBytes</code> — the exact token count is unknowable at the wire, so
        set <code>EstimatedTokens</code> (or <code>Config.EstimatedTokensPerRequest</code>) to a
        conservative per-call estimate so the budget still accounts for the call. Exact accounting
        needs the provider&apos;s emitted usage; the estimate is the floor that keeps enforcement
        from going blind.
      </Callout>

      <DocH2 id="modes">enforce vs observe</DocH2>
      <Table
        head={["Mode", "Behavior"]}
        rows={[
          [
            <code key="m">enforce</code>,
            <>
              Default. Exhausted budgets / open breakers synthesize <strong>provider-native</strong>{" "}
              429/503 responses with <code>Retry-After</code> and{" "}
              <code>X-RateGuard-Synthesized: true</code> — your SDK&apos;s retry logic handles them
              natively.
            </>,
          ],
          [<code key="m">observe</code>, "Never blocks. Only meters — ideal for a first rollout week."],
        ]}
      />
      <P>
        Budget scope is <code>{"{tenant}:{provider}:{model}:outbound"}</code> with
        reserve-then-commit accounting. Calls pass while any budget remains; the final call may
        overshoot (actual usage is only known post-response), then everything blocks until the
        window rolls. See <Link href="/docs/token-budgets">Token budgets</Link>.
      </P>

      <DocH2 id="per-customer">Per-customer budgets &amp; attribution</DocH2>
      <P>
        Send an <code>X-RateGuard-Customer</code> header on the request and the customer becomes
        part of the budget scope — <strong>each customer gets their own budget</strong>, so one
        runaway end-user can&apos;t exhaust the whole tenant&apos;s allowance, and spend is tracked
        per customer for free (query it by the scoped budget key). The header is{" "}
        <strong>stripped before the request reaches the provider</strong>, and the customer is
        emitted as the <code>rateguard.customer</code> span attribute for per-user cost dashboards.
        No header → the scope and behavior are unchanged.
      </P>
      <Callout kind="tip" title="One header, no code change">
        Because RateGuard rides your existing client, per-customer budgets need nothing more than a
        header on the outbound request — the agent code stays the same. Override the header name via{" "}
        <code>Config.OutboundCustomerHeader</code> (Go), <code>outboundCustomerHeader</code> (Node),
        or <code>outbound_customer_header</code> (Python). Attribution survives provider fallback.
      </Callout>

      <DocH2 id="kill-switch">Kill switch: freeze outbound calls</DocH2>
      <P>
        When an agent goes wrong in production you need a stop button that does not require a
        redeploy. <code>Freeze</code> halts outbound LLM calls the instant it is called, from inside
        the process. Freeze everything, or freeze one customer (the same{" "}
        <code>X-RateGuard-Customer</code> scope) to stop a single runaway user without touching the
        rest. Frozen calls return a synthesized 403; unfreeze to resume.
      </P>
      <CodeTabs
        tabs={[
          {
            label: "Go",
            code: `rg.Freeze("")            // freeze everything\nrg.Freeze("acme-corp")   // or one customer\nrg.Unfreeze("acme-corp")\nrg.IsFrozen("acme-corp")  // true\nrg.FrozenScopes()         // ["customer=acme-corp"]`,
          },
          {
            label: "Node.js",
            code: `rg.freeze();             // freeze everything\nrg.freeze('acme-corp');  // or one customer\nrg.unfreeze('acme-corp');\nrg.isFrozen('acme-corp'); // true\nrg.frozenScopes();        // ['customer=acme-corp']`,
          },
          {
            label: "Python",
            code: `rg.freeze()              # freeze everything\nrg.freeze("acme-corp")   # or one customer\nrg.unfreeze("acme-corp")\nrg.is_frozen("acme-corp")  # True\nrg.frozen_scopes()          # ["customer=acme-corp"]`,
          },
        ]}
      />
      <Callout kind="tip" title="Trip it from ops tooling, not just code">
        The freeze is also on the admin API: <code>POST /admin/freeze</code> with a{" "}
        <code>scope</code> field (empty scope freezes everything), <code>POST /admin/unfreeze</code>,
        and <code>GET /admin/frozen</code>. An on-call engineer can halt a runaway agent from a
        dashboard or a curl, no deploy. This is the in-process form of the human-oversight interrupt
        the EU AI Act Article 14 expects.
      </Callout>

      <DocH2 id="pricing">Pricing your own models</DocH2>
      <P>
        RateGuard ships a small starter table of common models for the OTel{" "}
        <code>gen_ai.usage.cost_usd</code> estimate. It deliberately does <em>not</em> bundle
        hundreds of models or fetch a pricing file at startup — that would trade the zero-network,
        zero-dependency posture for a maintenance treadmill and a supply-chain surface. Instead you
        own the lever: supply a <code>PricingProvider</code> and price exactly what you are billed.
      </P>
      <CodeTabs
        tabs={[
          {
            label: "Go",
            code: `rg := rateguard.New(rateguard.Config{
    PricingProvider: rateguard.StaticPricing{
        "my-finetune":  {PromptUSDPer1K: 0.001, CompletionUSDPer1K: 0.002},
        "gpt-4o":       {PromptUSDPer1K: 0.0025, CompletionUSDPer1K: 0.010}, // override
    },
})`,
          },
          {
            label: "Node.js",
            code: `const rg = new RateGuard({
  pricingProvider: new StaticPricing({
    'my-finetune': { promptUSDPer1K: 0.001, completionUSDPer1K: 0.002 },
    'gpt-4o':      { promptUSDPer1K: 0.0025, completionUSDPer1K: 0.010 },
  }),
});`,
          },
          {
            label: "Python",
            code: `rg = RateGuard(pricing_provider=StaticPricing({
    "my-finetune": ModelPrice(0.001, 0.002),
    "gpt-4o":      ModelPrice(0.0025, 0.010),  # override
}))`,
          },
        ]}
      />
      <Callout kind="tip" title="Dated snapshots resolve automatically">
        Lookups are model-ID normalized, so the dated ID a provider actually reports back —{" "}
        <code>gpt-4o-2024-08-06</code>, <code>claude-sonnet-4-5-20250929</code>,{" "}
        <code>gemini-2.5-flash-09-2025</code> — resolves to the base entry you registered. Register
        base names. A minor-version segment like <code>claude-sonnet-4-5</code> is never stripped.
        The order is: your provider → the built-in table → <code>$0</code> (costs are never
        fabricated, and cost is an estimate only — it never drives enforcement).
      </Callout>

      <DocH2 id="observability">What you get for free</DocH2>
      <P>
        Per-provider circuit breakers (an OpenAI outage doesn&apos;t trip DeepSeek),{" "}
        <Link href="/docs/provider-fallback">fallback chains</Link> across OpenAI-compatible
        providers, Prometheus counters for calls / fallbacks / tokens, and OTel{" "}
        <code>gen_ai.*</code> spans with automatic cost estimation — a starter set of common models
        out of the box, extended by your own <code>PricingProvider</code> — see{" "}
        <Link href="/docs/observability">Observability</Link>.
      </P>
      <DocsPager slug="outbound" />
    </>
  );
}
