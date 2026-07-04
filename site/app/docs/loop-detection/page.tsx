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
        <code>check_loop</code> is one of the five <Link href="/docs/agents-mcp">MCP tools</Link>{" "}
        — an agent can ask &quot;am I looping?&quot; about its own behavior before issuing the
        call. Peek semantics: asking records nothing.
      </Callout>
      <DocsPager slug="loop-detection" />
    </>
  );
}
