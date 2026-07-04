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
        including streaming. 16 OpenAI-compatible hosts are detected out of the box, plus
        Anthropic, Gemini, Vertex, Azure OpenAI, AWS Bedrock, and self-hosted vLLM / llama.cpp.
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

      <DocH2 id="observability">What you get for free</DocH2>
      <P>
        Per-provider circuit breakers (an OpenAI outage doesn&apos;t trip DeepSeek),{" "}
        <Link href="/docs/provider-fallback">fallback chains</Link> across OpenAI-compatible
        providers, Prometheus counters for calls / fallbacks / tokens, and OTel{" "}
        <code>gen_ai.*</code> spans with automatic cost estimation across 14 priced models — see{" "}
        <Link href="/docs/observability">Observability</Link>.
      </P>
      <DocsPager slug="outbound" />
    </>
  );
}
