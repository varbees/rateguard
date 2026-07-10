import type { Metadata } from "next";
import Link from "next/link";
import { Callout, DocH1, DocH2, DocsPager, P } from "../../../components/docs/Docs";
import { CodeTabs } from "../../../components/docs/CodeTabs";
import { CodeBlock } from "../../../components/docs/CodeBlock";

export const metadata: Metadata = {
  title: "Realtime & voice sessions",
  description:
    "Session budgets for OpenAI Realtime and Gemini Live: token, audio, turn, duration, and cost limits enforced mid-session — plus Pipecat and LiveKit Agents adapters.",
};

export default function RealtimeVoicePage() {
  return (
    <>
      <DocH1 kicker="Guides">Realtime &amp; voice sessions</DocH1>
      <P>
        A voice session is one WebSocket that can burn dollars per minute for hours. Rate
        limiting that thinks in requests is structurally blind to it: the &quot;request&quot;
        happened once, at connect time. RateGuard budgets the <strong>session</strong> —
        accumulating the usage events the provider streams back, and deciding continuously
        whether the session is still within its budget.
      </P>

      <DocH2 id="how">How it works</DocH2>
      <P>
        RateGuard never touches your socket. Your receive loop (or your voice framework) feeds
        each inbound server frame to a per-session guard; the guard parses usage, accumulates,
        and answers. On the first breach it fires your callback exactly once and the state is
        terminal — you close the socket with a proper close frame, degrade to text, or downgrade
        the model. Frames are never rewritten.
      </P>
      <CodeTabs
        tabs={[
          {
            label: "Go",
            code: `guard := rateguard.NewRealtimeSessionGuard(rateguard.RealtimeProviderOpenAI,
    rateguard.RealtimeSessionGuardOptions{
        Limits: rateguard.RealtimeSessionLimits{
            MaxTotalTokens: 200_000,
            MaxDuration:    30 * time.Minute,
        },
        OnExceeded: func(d rateguard.RealtimeDecision) {
            // signal your socket loop to close the session
        },
    })

// In your WebSocket receive loop:
event, decision, err := guard.ObserveRaw(frame)
_ = event // parsed view: usage, turn completion
if decision.Exceeded {
    // close with a proper close frame
}`,
          },
          {
            label: "Node.js",
            code: `const guard = new RealtimeSessionGuard('openai', {
  limits: { maxTotalTokens: 200_000, maxDurationMs: 30 * 60_000 },
  onExceeded: (d) => {
    // signal your socket loop to close the session
  },
});

// In your WebSocket message handler:
const { event, decision } = guard.observeRaw(frame);
if (decision.exceeded) {
  // close with a proper close frame
}`,
          },
          {
            label: "Python",
            code: `guard = RealtimeSessionGuard("openai", RealtimeSessionGuardOptions(
    limits=RealtimeSessionLimits(
        max_total_tokens=200_000,
        max_duration_seconds=1_800,
    ),
    on_exceeded=lambda d: ...,  # signal your socket loop
))

# In your WebSocket receive loop:
event, decision = guard.observe_raw(frame)
if decision.exceeded:
    ...  # close with a proper close frame`,
          },
        ]}
      />

      <DocH2 id="limits">What you can limit</DocH2>
      <P>
        Zero means unlimited; set any combination: <code>total tokens</code> (session sum),{" "}
        <code>audio tokens</code> (input+output — the expensive class), <code>turns</code>{" "}
        (completed model responses), <code>duration</code> (wall clock — needs no provider
        cooperation at all), and <code>estimated cost</code>. Cost rates are caller-supplied in
        micro-USD per million tokens per class — realtime pricing changes too often to bake in,
        and the estimate is never invoice truth.
      </P>
      <CodeBlock
        title="Cost-capped session (gpt-realtime-shaped rates)"
        code={`limits:    max_estimated_cost_micro_usd = 500_000        # $0.50/session
cost_rates: input_audio_per_m_tokens  = 32_000_000     # $32/M
            output_audio_per_m_tokens = 64_000_000     # $64/M`}
      />

      <DocH2 id="providers">Provider schemas, stated honestly</DocH2>
      <P>
        <strong>Gemini Live</strong>: live-verified against the real API.{" "}
        <code>usageMetadata</code> arrives with the turn-completing message, carries
        modality-split token details, and is <strong>per-turn</strong> (proven with a two-turn
        session — counts do not accumulate). <strong>OpenAI Realtime</strong>: parsed from the
        documented <code>response.done</code> schema; live verification pending (no free tier),
        and providers themselves note these counts are estimates relative to the billing meter.
        Session totals are the <em>sum</em> of usage events for both providers — the opposite of
        SSE usage inside one response, where fields repeat and RateGuard takes maxima.
      </P>
      <Callout>
        The conformance suite (<code>conformance/realtime_usage_vectors.json</code>) contains
        real captured Gemini Live frames, not hand-written fixtures — all three SDKs replay
        actual API output.
      </Callout>

      <DocH2 id="frameworks">Pipecat &amp; LiveKit Agents (Python)</DocH2>
      <P>
        Production voice usually runs through frameworks that terminate media server-side — so
        enforcement lives inside them. Both adapters are optional imports; the core package
        stays zero-dependency.
      </P>
      <CodeTabs
        tabs={[
          {
            label: "Pipecat",
            code: `from rateguard.integrations.pipecat_adapter import RateGuardBudgetProcessor

pipeline = Pipeline([
    transport.input(), stt, llm,
    RateGuardBudgetProcessor(guard),   # watches Pipecat's own usage metrics
    tts, transport.output(),
])
# On breach: your on_exceeded callback, then Pipecat's own fatal-error
# stop (set fatal_on_exceeded=False to observe without stopping).`,
          },
          {
            label: "LiveKit Agents",
            code: `from rateguard.integrations.livekit_adapter import attach_rateguard

def stop(decision):
    session.interrupt()   # or schedule session.aclose()

attach_rateguard(session, guard, on_exceeded=stop)
# Subscribes to metrics_collected; maps RealtimeModelMetrics (with
# audio/text/cached splits) and LLMMetrics onto the guard.`,
          },
        ]}
      />
      <P>
        A runnable, zero-key demo lives at{" "}
        <code>packages/sdk-python/examples/voice-budget</code> — it replays the real captured
        Gemini frames until the guard trips. See also the{" "}
        <Link href="/docs/integrations">framework integrations</Link> page.
      </P>

      <DocsPager slug="realtime-voice" />
    </>
  );
}
