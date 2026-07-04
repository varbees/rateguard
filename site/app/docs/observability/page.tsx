import type { Metadata } from "next";
import { Callout, DocH1, DocH2, DocsPager, P } from "../../../components/docs/Docs";
import { CodeBlock } from "../../../components/docs/CodeBlock";

export const metadata: Metadata = {
  title: "Observability",
  description:
    "OpenTelemetry gen_ai.* spans per the official GenAI semantic conventions, Prometheus /metrics, automatic cost estimation, and an event pipeline.",
};

export default function ObservabilityPage() {
  return (
    <>
      <DocH1 kicker="Guides">Observability</DocH1>
      <P>
        RateGuard emits OpenTelemetry spans and metrics for every LLM call using the official{" "}
        <strong>GenAI semantic conventions</strong>. Span names follow{" "}
        <code>{"{operation} {model}"}</code> (e.g. <code>chat gpt-4o</code>); standard{" "}
        <code>gen_ai.*</code> attributes are used where the convention defines them, and
        RateGuard-specific data lives under <code>rateguard.*</code> so the reserved namespace
        stays clean.
      </P>
      <CodeBlock
        title="span shape"
        code={`chat gpt-4o                       ← span name: {operation} {model}
├── gen_ai.provider.name:   "openai" | "anthropic" | "google"
├── gen_ai.request.model:   "gpt-4o" | "claude-opus-4-5" | ...
├── gen_ai.operation.name:  "chat" | "text_completion" | "embedding"
├── gen_ai.usage.input_tokens:  1234
├── gen_ai.usage.output_tokens: 567
└── gen_ai.conversation.id / gen_ai.response.id (when provided)`}
      />

      <DocH2 id="manual">Track any call manually</DocH2>
      <CodeBlock
        title="Go"
        code={`ctx, span := rg.StartGenAICall(ctx, rateguard.GenAICall{
    Provider: "openai", Model: "gpt-4o", Operation: "chat",
})
resp, err := client.Chat(ctx, req)
span.RecordChunk() // optional, per streaming chunk — first call sets TTFT
span.End(rateguard.GenAICall{
    PromptTokens:     usage.Input,
    CompletionTokens: usage.Output,
}, err)`}
      />
      <P>
        Cost is estimated automatically from the pricing table (14 models verified against
        provider pricing pages) when not provided. TTFT and TPOT are derived from{" "}
        <code>RecordChunk()</code> timing. Node and Python expose the same attribute builders via{" "}
        <code>genaiSpanName</code> / <code>genai_span_name</code> and friends.
      </P>
      <Callout kind="tip">
        Point <code>OTLPCollectorEndpoint</code> at your collector and the spans land in Datadog,
        Grafana, or Honeycomb with zero extra glue — they follow the semconv your backend already
        understands.
      </Callout>

      <DocH2 id="prometheus">Prometheus</DocH2>
      <CodeBlock
        title="Go"
        code={`http.Handle("/metrics", rg.Metrics())
// live counters: requests, rate limits, budgets,
// breakers, loops, outbound calls + fallbacks + tokens`}
      />

      <DocH2 id="events">Events</DocH2>
      <P>
        Every request emits an event — <code>request.completed</code>,{" "}
        <code>request.rate_limited</code>, <code>token_budget.exceeded</code> — for custom
        dashboards, alerts, or audit logs:
      </P>
      <CodeBlock
        title="Go"
        code={`// Send to an HTTP endpoint
rg := rateguard.New(rateguard.Config{
    EventEndpoint: "https://my-dashboard.example/api/events",
})

// Or handle in-process
rg = rateguard.New(rateguard.Config{
    EventEmitter: myCustomEmitter{},
})`}
      />
      <DocsPager slug="observability" />
    </>
  );
}
