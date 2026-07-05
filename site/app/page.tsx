import type { Metadata } from "next";
import Link from "next/link";
import { CodeTabs } from "@/components/docs/CodeTabs";
import Reveal from "@/components/landing/Reveal";
import LogoStrip from "@/components/landing/LogoStrip";
import ChaosField from "@/components/landing/ChaosField";
import ShieldReveal from "@/components/landing/ShieldReveal";
import TokenBucket from "@/components/landing/TokenBucket";
import StatCounter from "@/components/landing/StatCounter";
import FeatureCard from "@/components/landing/FeatureCard";
import {
  MicroHandshake,
  MicroMeter,
  MicroLoop,
  MicroParity,
  MicroSingleNode,
  MicroFallback,
  MicroDashboard,
} from "@/components/landing/FeatureMicros";

export const metadata: Metadata = {
  metadataBase: new URL("https://rateguard.antharmaya.com"),
  title: "RateGuard — AI-Native Rate Limiting Middleware",
  description:
    "The first agent-native rate limiting SDK. Go, Node, Python. MCP tools for pre-flight queries. Outbound transport tracking. Loop detection. Open source (MIT).",
  openGraph: {
    title: "RateGuard — AI Agents That Know Their Limits",
    description:
      "Multi-language middleware that lets AI agents query their own rate limits before making API calls. No proxy, no latency, MIT license.",
    type: "website",
    siteName: "Antharmaya Labs",
    images: [{ url: "/og.png", width: 1280, height: 640, alt: "RateGuard — AI agents that know their limits. Go, Node.js, Python. MIT." }],
  },
  twitter: {
    card: "summary_large_image",
    title: "RateGuard — AI Agents That Know Their Limits",
    description: "Multi-language AI-native rate limiting middleware. Go/Node/Python. MCP tools. MIT.",
    images: ["/og.png"],
  },
  keywords: [
    "rate limiting", "AI middleware", "LLM rate limit", "token budget", "MCP server",
    "agent rate limit", "OpenTelemetry", "Go", "Node.js", "Python", "open source", "MIT",
  ],
  robots: "index, follow",
  alternates: {
    types: { "application/ld+json": "/rateguard.jsonld" },
  },
};

const codeTabs = [
  { label: "Go", code: `rg := rateguard.New(rateguard.Config{Preset: "standard"})\nr.Use(rg.Middleware())` },
  { label: "Node.js", code: `const rg = new RateGuard({ preset: "standard" });\napp.use(rg.middleware());` },
  { label: "Python", code: `rg = RateGuard(preset="standard")\napp.add_middleware(rg.asgi_middleware)` },
];

const features = [
  {
    title: "Ask before you call",
    desc: "Five MCP tools let Claude Code, Cursor, or any MCP client check its own limit before making a request. The agent asks permission instead of hitting a 429.",
    micro: <MicroHandshake />,
  },
  {
    title: "Real spend, not estimates",
    desc: "The outbound RoundTripper wraps your HTTP client and meters every OpenAI, Anthropic, or Google call as it actually happens — budgeted, traced, priced.",
    micro: <MicroMeter />,
  },
  {
    title: "Loops get caught, not billed",
    desc: "Every request is fingerprinted with SHA-256 over a bounded LRU cache. A runaway agent repeating itself gets halted before it burns through your budget.",
    micro: <MicroLoop />,
  },
  {
    title: "One algorithm, three runtimes",
    desc: "Go, Node.js, and Python share the same token bucket math and the same presets. 256 tests — including a shared conformance suite that replays identical admission sequences across all three — hold them to real behavioral parity, not just similar APIs.",
    micro: <MicroParity />,
  },
  {
    title: "Nothing else to run",
    desc: "No proxy, no sidecar, no extra service to keep alive. RateGuard runs inside your process — drop in a middleware and every call becomes governed.",
    micro: <MicroSingleNode />,
  },
  {
    title: "Failure reroutes, it doesn't cascade",
    desc: "Circuit breakers open on a failing provider and the chain moves to the next one automatically — your application never sees the outage.",
    micro: <MicroFallback />,
  },
];

export default function Page() {
  return (
    <main className="min-h-screen bg-[var(--void)] text-[var(--fg)]">
      {/* Header */}
      <header className="sticky top-0 z-50 border-b border-[var(--border)] bg-[var(--void)]/80 backdrop-blur">
        <div className="mx-auto flex max-w-6xl items-center justify-between px-6 py-4">
          <div className="flex items-baseline gap-3">
            <Link href="/" className="font-display text-[15px] font-bold tracking-tight">
              RateGuard<span className="text-[var(--amber)]">.</span>
            </Link>
            <Link href="/docs" className="text-sm font-medium hover:text-white transition-colors">
              Docs
            </Link>
          </div>
          <div className="flex items-center gap-6">
            <a href="https://antharmaya.com" className="hidden sm:block text-sm text-[var(--muted)] hover:text-[var(--fg)] transition-colors">
              Antharmaya Labs
            </a>
            <a href="https://github.com/varbees/rateguard" className="text-sm text-[var(--muted)] hover:text-[var(--fg)] transition-colors">
              GitHub ↗
            </a>
          </div>
        </div>
      </header>

      {/* Hero */}
      <section className="relative overflow-hidden px-6 pt-28 pb-24">
        <ChaosField count={20} />
        <div className="relative mx-auto max-w-3xl text-center">
          <p className="mb-5 text-sm uppercase tracking-[0.2em] text-[var(--muted)]">
            Antharmaya Labs · Open Source · MIT
          </p>
          <h1 className="font-display text-5xl sm:text-6xl font-bold leading-[1.05] mb-6">
            AI agents that
            <br />
            know their limits.
          </h1>
          <p className="mx-auto max-w-xl text-lg text-[var(--muted)] leading-relaxed mb-10">
            Agents don&apos;t stop when they should. RateGuard does it for them —
            in-process, in three languages, before the bill arrives.
          </p>
          <div className="flex flex-wrap justify-center gap-4">
            <a href="https://github.com/varbees/rateguard" className="inline-flex items-center gap-2 px-5 py-3 bg-[var(--bone)] text-black rounded-lg font-medium hover:bg-white transition-colors">
              View on GitHub <span className="text-sm">↗</span>
            </a>
            <Link href="/docs/quickstart" className="inline-flex items-center gap-2 px-5 py-3 border border-[var(--border)] rounded-lg font-medium hover:border-[var(--muted)] transition-colors">
              Read the docs
            </Link>
          </div>
        </div>
      </section>

      {/* Ecosystem */}
      <section className="px-6 pb-24">
        <Reveal>
          <p className="mb-6 text-center text-xs uppercase tracking-[0.2em] text-[var(--muted)]">
            Plugs into what you already use
          </p>
          <LogoStrip />
        </Reveal>
      </section>

      {/* The problem */}
      <section className="relative px-6 py-32">
        <Reveal className="mx-auto max-w-2xl text-center">
          <h2 className="font-display text-3xl sm:text-4xl font-bold mb-5">
            An agent will call an API as many times as it thinks it needs to.
          </h2>
          <p className="text-[var(--muted)] leading-relaxed">
            No rate awareness, no budget sense, no idea it&apos;s stuck in a loop.
            Every unguarded call is a chance to blow through a limit you find out about
            after the invoice.
          </p>
        </Reveal>
      </section>

      {/* The mechanism — 3D scroll reveal */}
      <ShieldReveal />

      <section className="px-6 pb-32">
        <Reveal className="mx-auto max-w-2xl text-center mb-14">
          <h2 className="font-display text-3xl sm:text-4xl font-bold mb-5">
            One bucket. Real math. No black box.
          </h2>
          <p className="text-[var(--muted)] leading-relaxed">
            This is the actual formula running in production right now — not a mockup.
            Tokens refill continuously, requests consume them one at a time, and the
            bucket never lies about what it has left.
          </p>
        </Reveal>
        <Reveal delay={0.1} className="flex justify-center">
          <TokenBucket />
        </Reveal>
      </section>

      {/* Features */}
      <section className="mx-auto max-w-5xl px-6 pb-32">
        <Reveal>
          <h2 className="font-display text-2xl font-bold mb-10 text-center">What makes it different</h2>
        </Reveal>
        <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-5">
          {features.map((f, i) => (
            <Reveal key={f.title} delay={i * 0.06}>
              <FeatureCard {...f} />
            </Reveal>
          ))}
        </div>
      </section>

      {/* Code */}
      <section className="mx-auto max-w-3xl px-6 pb-32">
        <Reveal>
          <h2 className="font-display text-2xl font-bold mb-6 text-center">One line to ship</h2>
          <CodeTabs tabs={codeTabs} />
        </Reveal>
      </section>

      {/* Operate */}
      <section className="mx-auto max-w-5xl px-6 pb-32">
        <Reveal>
          <h2 className="font-display text-2xl font-bold mb-10 text-center">See it, don&apos;t just ship it</h2>
        </Reveal>
        <div className="flex justify-center">
          <Reveal>
            <Link href="/docs/dashboard">
              <FeatureCard
                title="Dashboard — a control center for a running instance"
                desc="Self-hosted, six sections: live budgets, breakers, agent loop stats, guardrail violations, an MCP tool console, and runtime policy tweaks. docker compose up, one instance already generating traffic."
                micro={<MicroDashboard />}
              />
            </Link>
          </Reveal>
        </div>
      </section>

      {/* Stats */}
      <section className="mx-auto max-w-3xl px-6 pb-32">
        <Reveal className="grid grid-cols-2 sm:grid-cols-4 gap-8 rounded-xl border border-[var(--border)] bg-[var(--card)] p-8">
          <StatCounter value={256} label="Tests" />
          <StatCounter value={16} label="Providers" />
          <StatCounter value={3} label="Languages" />
          <div className="text-center">
            <div className="font-display text-2xl font-bold">MIT</div>
            <div className="mt-1 text-sm text-[var(--muted)]">License</div>
          </div>
        </Reveal>
      </section>

      {/* CTA */}
      <section className="mx-auto max-w-2xl px-6 pb-32 text-center">
        <Reveal>
          <h2 className="font-display text-2xl sm:text-3xl font-bold mb-4">Open source. Free forever.</h2>
          <p className="text-[var(--muted)] mb-8">
            Built by a solo founder in India. Every feature claim is backed by a test that
            exercises it end to end.
          </p>
          <a href="https://github.com/varbees/rateguard" className="inline-flex items-center gap-2 px-6 py-3 bg-[var(--bone)] text-black rounded-lg font-medium hover:bg-white transition-colors">
            Star on GitHub <span className="text-sm">↗</span>
          </a>
        </Reveal>
      </section>

      {/* Footer */}
      <footer className="border-t border-[var(--border)]">
        <div className="mx-auto flex max-w-5xl items-center justify-between px-6 py-6 text-sm text-[var(--muted)]">
          <span>Antharmaya Labs · 2026</span>
          <a href="https://antharmaya.com" className="hover:text-[var(--fg)] transition-colors">antharmaya.com</a>
        </div>
      </footer>
    </main>
  );
}
