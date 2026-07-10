import type { Metadata } from "next";
import Link from "next/link";
import { Callout, DocH1, DocH2, DocsPager, P } from "../../../components/docs/Docs";
import { CodeTabs } from "../../../components/docs/CodeTabs";
import { CodeBlock } from "../../../components/docs/CodeBlock";

export const metadata: Metadata = {
  title: "Loop detection",
  description:
    "SHA-256 payload fingerprinting halts runaway agent loops before they torch your budget — wired into the middleware via the X-Sequence-Depth header.",
};

export default function LoopDetectionPage() {
  return (
    <>
      <DocH1 kicker="Guides">Loop detection</DocH1>
      <P>
        The most expensive agent failure mode is the quiet one: an agent re-issuing the same call
        in a cycle, each iteration burning tokens. RateGuard fingerprints payloads with SHA-256
        and halts the pattern before it compounds.
      </P>

      <DocH2 id="how">How a loop is defined</DocH2>
      <P>
        A loop is an <strong>identical fingerprint reappearing at a higher sequence depth</strong>.
        Same-depth repeats are treated as retries (legitimate). Depths beyond{" "}
        <code>LoopMaxDepth</code> (default 50) halt regardless. Fingerprint state is LRU-bounded
        at 10K entries — no memory leaks.
      </P>

      <DocH2 id="middleware">Middleware wiring</DocH2>
      <CodeBlock
        title="Go — enable, then agents send headers"
        code={`rg := rateguard.New(rateguard.Config{
    Preset:        "agent-orchestrator",
    LoopDetection: true,
    LoopMaxDepth:  50, // default
})

// Agents include on each request:
//   X-Sequence-Depth: 3              (required to activate the check)
//   X-Payload-Fingerprint: <sha256>  (optional — else SHA256(method+path+body))
//
// Detected loops → 429 {"error": "loop_detected", ...}`}
      />

      <DocH2 id="library">Library use (any SDK)</DocH2>
      <CodeTabs
        tabs={[
          {
            label: "Go",
            code: `fp := rateguard.Fingerprint(systemPrompt, userInput, toolDefs)

allowed, reason := detector.Check(fp, depth) // records the observation
allowed, reason  = detector.Peek(fp, depth)  // pre-flight, records nothing`,
          },
          {
            label: "Node.js",
            code: `const result = await rg.mcpCall('check_loop', {
  system_prompt: sp,
  user_input: ui,
  sequence_depth: 3,
});`,
          },
          {
            label: "Python",
            code: `result = rg.mcp_call("check_loop", {
    "system_prompt": sp,
    "user_input": ui,
    "sequence_depth": 3,
})`,
          },
        ]}
      />
      <Callout kind="tip">
        <code>check_loop</code> is one of the seven <Link href="/docs/agents-mcp">MCP tools</Link>{" "}
        — an agent can ask &quot;am I looping?&quot; about its own behavior before issuing the
        call. Peek semantics: asking records nothing.
      </Callout>

      <DocH2 id="semantic">Semantic loop detection — the paraphrase loop</DocH2>
      <P>
        Exact hashing has a blind spot it cannot close: an agent repeating the same step{" "}
        <em>in different words</em>. The{" "}
        <Link href="/denial-of-wallet">reported $47K ping-pong incident</Link> was this shape — two
        agents passing semantically identical, byte-distinct messages back and forth for eleven
        days. Every SHA-256 fingerprint differed; nothing tripped. <code>SemanticLoopDetector</code>{" "}
        closes the gap: it embeds each step locally (see the built-in{" "}
        <Link href="/docs/semantic-caching">static embedder</Link> — no network, no inference
        runtime) and compares against a sliding window of the sequence&apos;s recent steps.
      </P>
      <CodeTabs
        tabs={[
          {
            label: "Go",
            code: `embedder, _ := rateguard.LoadStaticEmbedder("potion-base-2M.rgemb")
detector := rateguard.NewSemanticLoopDetector(embedder,
    rateguard.SemanticLoopOptions{}) // threshold 0.90, window 8, minRepeats 2

decision, _ := detector.Check(ctx, "agent-key", stepText)
if decision.Loop {
    // the agent is circling — halt it
}
// Peek(ctx, key, text) gives the same verdict without recording.`,
          },
          {
            label: "Node.js",
            code: `const embedder = StaticEmbedder.load('potion-base-2M.rgemb');
const detector = new SemanticLoopDetector(embedder);
// defaults: threshold 0.90, window 8, minRepeats 2

const decision = await detector.check('agent-key', stepText);
if (decision.loop) {
  // the agent is circling — halt it
}
// peek(key, text) gives the same verdict without recording.`,
          },
          {
            label: "Python",
            code: `embedder = StaticEmbedder.load("potion-base-2M.rgemb")
detector = SemanticLoopDetector(embedder)
# defaults: threshold 0.90, window 8, min_repeats 2

decision = await detector.check("agent-key", step_text)
if decision.loop:
    ...  # the agent is circling — halt it
# peek(key, text) gives the same verdict without recording.`,
          },
        ]}
      />
      <P>
        The 0.90 threshold is calibrated from measured data, not intuition: tight rewordings of
        one ask score 0.92–0.99, same-template/different-entity workloads (&quot;weather in
        Paris&quot; / &quot;weather in London&quot;) top out near 0.80, and genuinely distinct
        task steps stay under 0.67. Honest limitation: loosely reworded repeats (0.73–0.86) are
        indistinguishable from enumeration at this model size and will not trip the default —
        lowering the threshold trades that for false positives on template workloads.
      </P>
      <Callout>
        Semantic loop detection is a public primitive with a <code>Check</code>/<code>Peek</code>{" "}
        split (pre-flight never records). It is not yet wired into the HTTP middleware — pair it
        with your agent loop or the <Link href="/docs/realtime-voice">voice adapters</Link>.
      </Callout>
      <DocsPager slug="loop-detection" />
    </>
  );
}
