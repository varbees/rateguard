import type { Metadata } from "next";
import Link from "next/link";
import { Callout, DocH1, DocH2, DocsPager, P } from "../../../components/docs/Docs";
import { CodeTabs } from "../../../components/docs/CodeTabs";

export const metadata: Metadata = {
  title: "Provider fallback",
  description:
    "Automatic failover across OpenAI-compatible providers on 429/5xx/breaker-open — with credential isolation and honest limits.",
};

export default function ProviderFallbackPage() {
  return (
    <>
      <DocH1 kicker="Guides">Provider fallback</DocH1>
      <P>
        When a provider returns 429/5xx or its circuit breaker opens, the outbound transport can
        route the call to the next OpenAI-compatible provider in a chain — DeepSeek, Groq,
        Cerebras, self-hosted vLLM, and friends. Responses served by a fallback carry{" "}
        <code>X-RateGuard-Fallback: true</code>.
      </P>
      <CodeTabs
        tabs={[
          {
            label: "Go",
            code: `client := rg.WrapClient(nil, rateguard.OutboundOptions{
    Chain: rateguard.NewProviderChain(
        rateguard.Provider("openai", "gpt-4o", "https://api.openai.com/v1"),
        rateguard.ProviderEntry{
            Name:    "deepseek",
            Model:   "deepseek-chat",
            BaseURL: "https://api.deepseek.com/v1",
            Headers: map[string]string{
                "Authorization": "Bearer " + deepseekKey,
            },
        },
    ),
})`,
          },
          {
            label: "Node.js",
            code: `const client = new OpenAI({
  fetch: rg.wrapFetch({
    chain: [
      { name: 'openai', model: 'gpt-4o', baseURL: 'https://api.openai.com/v1' },
      { name: 'deepseek', model: 'deepseek-chat',
        baseURL: 'https://api.deepseek.com/v1',
        headers: { Authorization: \`Bearer \${deepseekKey}\` } },
    ],
  }),
});`,
          },
          {
            label: "Python",
            code: `transport = create_httpx_transport(
    rg.runtime,
    chain=[
        FallbackProvider(name="openai", model="gpt-4o",
                         base_url="https://api.openai.com/v1"),
        FallbackProvider(name="deepseek", model="deepseek-chat",
                         base_url="https://api.deepseek.com/v1",
                         headers={"Authorization": f"Bearer {deepseek_key}"}),
    ],
)`,
          },
        ]}
      />
      <Callout kind="warn" title="Honest scope">
        Fallback works across <strong>OpenAI-compatible</strong> endpoints only — same request
        schema. Cross-schema fallback (OpenAI → Anthropic&apos;s native API) is impossible at the
        transport layer and RateGuard does not claim it. Credentials never transfer between
        providers; each chain entry carries its own headers.
      </Callout>

      <DocH2 id="built-in">Built-in chains</DocH2>
      <P>
        Every entry in these three is a genuinely OpenAI-compatible endpoint — Anthropic is
        deliberately absent despite being a top-tier model, for the exact reason in the callout
        above: a fallback to it would send an OpenAI-shaped body to the wrong path. Google is
        included via its own OpenAI-compatible endpoint (<code>/v1beta/openai</code>), not its
        native one. Want Claude in your own fallback logic anyway? That has to happen at the
        application layer — catch the error, call Anthropic&apos;s own SDK yourself.
      </P>
      <CodeTabs
        tabs={[
          {
            label: "Go",
            code: `chain := rateguard.DefaultProviderChain()
// OpenAI → Google Gemini Flash (cost-optimized)

chain = rateguard.BudgetProviderChain()
// Gemini Flash → GPT-4o Mini → DeepSeek (cheapest first)

chain = rateguard.QualityProviderChain()
// GPT-4o → Gemini Pro (best quality among compatible options)

entry, provider, fallback := chain.Route("openai", CircuitBreakerOpen)
// entry = Google provider, fallback = true`,
          },
          {
            label: "Node.js",
            code: `const chain = defaultProviderChain();
// OpenAI → Google Gemini Flash — a plain ProviderEntry[],
// pass straight to wrapFetch({ chain })`,
          },
          {
            label: "Python",
            code: `chain = default_provider_chain()
# OpenAI → Google Gemini Flash — a plain list[FallbackProvider],
# pass straight to wrap_httpx_client(chain=chain)`,
          },
        ]}
      />

      <DocH2 id="breakers">Per-provider circuit breakers</DocH2>
      <P>
        Each provider gets its own breaker (closed → open → half-open) — an OpenAI outage
        doesn&apos;t trip DeepSeek. Agents can check breaker state before calling via the{" "}
        <code>get_circuit_breaker_state</code> <Link href="/docs/agents-mcp">MCP tool</Link>.
      </P>
      <DocsPager slug="provider-fallback" />
    </>
  );
}
