import type { Metadata } from "next";
import Link from "next/link";
import { Callout, DocH1, DocH2, DocsPager, P, Table } from "../../../components/docs/Docs";
import { CodeBlock } from "../../../components/docs/CodeBlock";

export const metadata: Metadata = {
  title: "Agent frameworks",
  description:
    "One-line RateGuard integrations for LangChain/LangGraph, OpenAI Agents SDK, Vercel AI SDK, Pydantic AI, and Mastra — verified against each framework's official docs.",
};

export default function IntegrationsPage() {
  return (
    <>
      <DocH1 kicker="Integrations">Agent frameworks</DocH1>
      <P>
        RateGuard wraps the HTTP client your LLM SDK already uses — so it plugs into any framework
        that lets you pass a custom client or fetch. One line each, verified against each
        framework&apos;s official documentation.
      </P>
      <Callout kind="note" title="Why integrate at the wire, not in the framework">
        Framework token counting is unreliable today: LangChain reports incorrect counts in
        streaming mode (langchain#30429) and CrewAI&apos;s <code>token_usage</code> disagrees with
        provider counts. RateGuard counts <strong>below</strong> the framework at the transport
        layer — the numbers are whatever the provider actually returned. Budgets, breakers, and
        fallback come along for free.
      </Callout>

      <DocH2 id="langchain">LangChain / LangGraph (Python)</DocH2>
      <CodeBlock
        title="Python"
        code={`from langchain_openai import ChatOpenAI
from rateguard import RateGuard

rg = RateGuard(preset="agent-orchestrator")

llm = ChatOpenAI(
    model="gpt-4o",
    http_client=rg.wrap_httpx_client(),          # sync path
    http_async_client=rg.wrap_httpx_async_client(),  # async path
)
# Use llm inside any LangGraph graph — every call is budgeted and metered.`}
      />

      <DocH2 id="openai-agents">OpenAI Agents SDK (Python)</DocH2>
      <CodeBlock
        title="Python — one global line"
        code={`from agents import set_default_openai_client
from openai import AsyncOpenAI

set_default_openai_client(
    AsyncOpenAI(http_client=rg.wrap_httpx_async_client())
)`}
      />

      <DocH2 id="vercel">Vercel AI SDK (TypeScript)</DocH2>
      <CodeBlock
        title="TypeScript — provider fetch is the official middleware surface"
        code={`import { createOpenAI } from '@ai-sdk/openai';
import { RateGuard } from '@varbees/rateguard-node';

const rg = new RateGuard({ preset: 'agent-orchestrator' });
const openai = createOpenAI({ fetch: rg.wrapFetch() });

const { text } = await generateText({ model: openai('gpt-4o'), prompt });`}
      />
      <P>
        Works identically for <code>createAnthropic</code>, <code>createGroq</code>, and every
        OpenAI-compatible AI SDK provider — they all accept <code>fetch</code>.{" "}
        <strong>Mastra</strong> models are AI SDK providers, so the same line covers Mastra.
      </P>

      <DocH2 id="pydantic">Pydantic AI (Python)</DocH2>
      <CodeBlock
        title="Python"
        code={`from pydantic_ai.models.openai import OpenAIModel
from pydantic_ai.providers.openai import OpenAIProvider

model = OpenAIModel(
    "gpt-4o",
    provider=OpenAIProvider(http_client=rg.wrap_httpx_async_client()),
)`}
      />

      <DocH2 id="go">Go frameworks</DocH2>
      <CodeBlock
        title="Go — the pattern is universal"
        code={`rg := rateguard.New(rateguard.Config{Preset: "agent-orchestrator"})
httpClient := rg.WrapClient(&http.Client{})

openai := openai.NewClient(option.WithHTTPClient(httpClient))
claude := anthropic.NewClient(option.WithHTTPClient(httpClient))`}
      />

      <DocH2 id="crewai">CrewAI — honest status</DocH2>
      <Callout kind="warn" title="Not yet">
        CrewAI&apos;s native provider path does not currently expose custom HTTP client injection
        (crewAI#5139). We track client-injection support and will publish a recipe the day it
        lands. Pointing CrewAI&apos;s LiteLLM fallback at infrastructure you control is a proxy
        pattern — not what RateGuard recommends.
      </Callout>

      <DocH2 id="what-you-get">What every integration gets</DocH2>
      <Table
        head={["Capability", "How"]}
        rows={[
          ["Real token usage per call", "Extracted from the provider's response — JSON and SSE streaming"],
          ["Token budgets (hr/day/mo)", <>Scoped <code>{"{tenant}:{provider}:{model}:outbound"}</code>, reserve → commit</>],
          ["Per-provider circuit breakers", "An OpenAI outage doesn't trip DeepSeek"],
          ["Enforcement", <>Synthesized provider-native 429/503 with <code>Retry-After</code> — SDK retry logic just works</>],
          ["Fallback", "OpenAI-compatible providers, credential-isolated"],
          ["Pre-flight queries", <><Link href="/docs/agents-mcp">MCP tools</Link> — agents ask before they spend</>],
          ["Metrics", <>Prometheus <code>/metrics</code>: outbound calls, fallbacks, tokens consumed</>],
        ]}
      />
      <DocsPager slug="integrations" />
    </>
  );
}
