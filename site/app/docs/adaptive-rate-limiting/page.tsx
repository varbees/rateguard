import type { Metadata } from "next";
import Link from "next/link";
import { Callout, DocH1, DocH2, DocsPager, P, Table } from "../../../components/docs/Docs";
import { CodeBlock } from "../../../components/docs/CodeBlock";

export const metadata: Metadata = {
  title: "Adaptive rate limiting",
  description:
    "A static rate limit is a guess. RateGuard's AIMD controller auto-tunes the effective limit from observed upstream error rate, shedding load before the circuit breaker has to trip.",
};

export default function AdaptiveRateLimitingPage() {
  return (
    <>
      <DocH1 kicker="Guides">Adaptive rate limiting</DocH1>
      <P>
        A static rate limit is a guess made once, at config time, about traffic that changes every
        day. <code>AdaptiveLimiter</code> wraps the configured limiter and auto-tunes the
        effective policy from the same success/failure signal the circuit breaker already
        observes — no ML, no external model, just the same AIMD shape TCP congestion control has
        used for decades: additive growth on healthy traffic, multiplicative cut when errors rise.
      </P>

      <DocH2 id="enable">Turn it on</DocH2>
      <CodeBlock
        title="Go"
        code={`rg := rateguard.New(rateguard.Config{
    Preset:            "llm-heavy",
    AdaptiveRateLimit:  true,
    Adaptive: rateguard.AdaptiveOptions{
        TargetErrorRate: 0.05, // default
        MinFactor:       0.25, // floor: 25% of configured policy
        MaxFactor:       2.0,  // ceiling: 200% of configured policy
    },
})`}
      />
      <Callout kind="note" title="The policy stays the anchor">
        Adaptation scales your configured preset within <code>[MinFactor, MaxFactor]</code> — it
        never replaces it. Turn it off and the effective limit snaps back to exactly what you
        configured. <Link href="/docs/presets">Peek</Link> scales identically to Allow, so agent
        pre-flight answers stay honest while the limit is being adjusted.
      </Callout>

      <DocH2 id="how">How the controller decides</DocH2>
      <P>
        Every request outcome (success = HTTP status &lt; 500) updates an exponential moving
        average of the error rate. Once per <code>AdjustInterval</code> (default 1s), the
        controller compares that EMA against <code>TargetErrorRate</code>:
      </P>
      <Table
        head={["Condition", "Action"]}
        rows={[
          [
            "Error EMA ≥ 80% of target",
            <>
              Cut the effective limit multiplicatively (<code>factor × DecreaseFactor</code>,
              default 0.5) — <strong>before</strong> the error rate actually breaches the target,
              so the limiter sheds load before the circuit breaker would have to trip.
            </>,
          ],
          [
            "Error EMA below the trigger",
            <>Grow the effective limit additively (<code>factor + IncreaseStep</code>, default 0.05 per interval).</>,
          ],
        ]}
      />
      <P>
        This predictive 80% trigger is deliberate: reacting only once the breaker&apos;s own
        threshold is breached means the breaker and the limiter fight the same fire at the same
        time. Cutting earlier gives the limiter first crack at recovery.
      </P>

      <DocH2 id="options">All options</DocH2>
      <Table
        head={["Field", "Default", "Meaning"]}
        rows={[
          ["MinFactor", "0.25", "Floor — the effective limit never drops below 25% of the configured policy."],
          ["MaxFactor", "2.0", "Ceiling — the effective limit never exceeds 200% of the configured policy."],
          ["TargetErrorRate", "0.05", "The error rate the controller steers under."],
          ["IncreaseStep", "0.05", "Additive factor gain per healthy interval."],
          ["DecreaseFactor", "0.5", "Multiplicative cut applied on breach."],
          ["AdjustInterval", "1s", "Minimum time between controller decisions — rate-limits the rate limiter's own adjustments."],
          ["EMAAlpha", "0.2", "Weight given to each new outcome sample in the error-rate moving average."],
        ]}
      />
      <DocsPager slug="adaptive-rate-limiting" />
    </>
  );
}
