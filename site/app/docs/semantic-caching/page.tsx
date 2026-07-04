import type { Metadata } from "next";
import { Callout, DocH1, DocH2, DocsPager, P, Table } from "../../../components/docs/Docs";
import { CodeBlock } from "../../../components/docs/CodeBlock";

export const metadata: Metadata = {
  title: "Semantic caching",
  description:
    "Cache LLM responses by meaning, not exact text. Bring your own embedder — a cache hit skips the network call, the circuit breaker, and the token budget entirely.",
};

export default function SemanticCachingPage() {
  return (
    <>
      <DocH1 kicker="Guides">Semantic caching</DocH1>
      <P>
        Exact-match caching misses the common case: two prompts that mean the same thing but
        differ in wording never hit. Semantic caching embeds the prompt and serves a prior
        response when a sufficiently similar prompt was already answered — real cost and latency
        savings on workloads with duplicate intent (support bots, agent retries, templated
        prompts with small variations).
      </P>
      <Callout kind="note" title="No bundled embedding model — on purpose">
        RateGuard does not ship an ONNX runtime, a hosted embeddings dependency, or a Python
        sidecar. That is exactly the kind of infrastructure RateGuard&apos;s &quot;zero
        infrastructure, zero added attack surface&quot; positioning exists to avoid. Instead,{" "}
        <code>Embedder</code> is a one-method interface — bring the OpenAI/Cohere/Voyage
        embeddings API, a local sentence-transformer binding, or anything else that turns text
        into a vector.
      </Callout>

      <DocH2 id="setup">Set it up</DocH2>
      <CodeBlock
        title="Go"
        code={`type Embedder interface {
    Embed(ctx context.Context, text string) ([]float32, error)
}

client := rg.WrapClient(&http.Client{}, rateguard.OutboundOptions{
    SemanticCache: &rateguard.SemanticCacheOptions{
        Embedder:            myEmbedder,   // required — no default
        SimilarityThreshold: 0.92,         // default 0.92
        TTL:                 time.Hour,    // default 1h
        MaxEntriesPerScope:  500,          // default 500, oldest-first eviction
    },
})`}
      />
      <P>
        A cache hit skips the network call, the per-provider circuit breaker, and the token
        budget reservation entirely — this is a real dollar saved, not just a faster response.
        The response carries <code>X-RateGuard-Cache: hit</code> so callers and observability can
        tell it apart from a live call.
      </P>

      <DocH2 id="semantics">What gets cached, and what never does</DocH2>
      <Table
        head={["Rule", "Why"]}
        rows={[
          [
            "Scoped per provider:model",
            "An entry for openai:gpt-4o never serves an anthropic:claude-opus-4-5 request, even with an identical prompt.",
          ],
          [
            "Streaming requests always bypass the cache",
            "Replaying a cached body as a fabricated SSE stream would misrepresent TTFT/TPOT to the caller.",
          ],
          [
            "Only HTTP 200, non-synthesized responses are stored",
            "A provider error or a RateGuard-synthesized 429/503 rejection is never cached.",
          ],
          [
            "An Embedder error degrades to a real call",
            "Caching is a cost optimization, never a reason to fail a request.",
          ],
        ]}
      />

      <DocH2 id="prompt-extraction">Prompt extraction</DocH2>
      <P>
        RateGuard understands OpenAI- and Anthropic-shaped chat request bodies —{" "}
        <code>messages[].content</code> as a plain string or as typed parts, plus Anthropic&apos;s
        top-level <code>system</code> field. Non-text parts (images, audio) are ignored for
        embedding purposes; only the text content contributes to the similarity comparison.
      </P>

      <DocH2 id="tuning">Tuning the threshold</DocH2>
      <P>
        <code>SimilarityThreshold</code> (default 0.92) is the one knob that matters. Higher is
        safer — fewer false-positive hits where a semantically different prompt gets served a
        stale answer — but lower catches more paraphrases. Start at the default and measure your
        own hit rate before loosening it; the right value depends entirely on your embedding
        model and your workload&apos;s prompt diversity.
      </P>
      <DocsPager slug="semantic-caching" />
    </>
  );
}
