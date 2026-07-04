import type { Metadata } from "next";
import "./globals.css";

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
    images: [
      {
        url: "/og.png",
        width: 1280,
        height: 640,
        alt: "RateGuard — AI agents that know their limits. Go, Node.js, Python. MIT.",
      },
    ],
  },
  twitter: {
    card: "summary_large_image",
    title: "RateGuard — AI Agents That Know Their Limits",
    description:
      "Multi-language AI-native rate limiting middleware. Go/Node/Python. MCP tools. MIT.",
    images: ["/og.png"],
  },
  keywords: [
    "rate limiting",
    "AI middleware",
    "LLM rate limit",
    "token budget",
    "MCP server",
    "agent rate limit",
    "OpenTelemetry",
    "Go",
    "Node.js",
    "Python",
    "open source",
    "MIT",
  ],
  robots: "index, follow",
};

export default function Page() {
  return (
    <main className="min-h-screen bg-[#0a0a0a] text-[#f5f5f5]">
      {/* Header */}
      <header className="border-b border-[#262626]">
        <div className="max-w-4xl mx-auto px-6 py-4 flex items-center justify-between">
          <a href="https://antharmaya.com" className="text-sm text-[#737373] hover:text-[#f5f5f5] transition-colors">
            Antharmaya Labs
          </a>
          <a
            href="https://github.com/varbees/rateguard"
            className="text-sm text-[#737373] hover:text-[#f5f5f5] transition-colors"
          >
            GitHub ↗
          </a>
        </div>
      </header>

      {/* Hero */}
      <section className="relative max-w-4xl mx-auto px-6 pt-24 pb-16">
        {/* Shield visualization: chaotic streams becoming measured amber pulses */}
        <img
          src="/hero.webp"
          alt=""
          aria-hidden
          className="pointer-events-none absolute -right-48 -top-8 hidden w-[720px] max-w-none opacity-70 sm:block [mask-image:linear-gradient(to_left,black_25%,transparent_80%)]"
        />
        <div className="relative">
        <p className="text-sm text-[#737373] mb-4 tracking-wide uppercase">
          Antharmaya Labs · Open Source · MIT
        </p>
        <h1 className="text-4xl sm:text-5xl font-bold leading-tight mb-6">
          AI agents that know
          <br />
          their limits.
        </h1>
        <p className="text-lg text-[#a3a3a3] max-w-2xl mb-8 leading-relaxed">
          RateGuard is the first agent-native rate limiting middleware. Go, Node, and Python SDKs with identical behavior.
          MCP tools let AI agents query their own limits before making calls. No proxy, no extra infrastructure, no added latency.
        </p>
        <div className="flex flex-wrap gap-4">
          <a
            href="https://github.com/varbees/rateguard"
            className="inline-flex items-center gap-2 px-5 py-3 bg-white text-black rounded-lg font-medium hover:bg-[#e5e5e5] transition-colors"
          >
            View on GitHub
            <span className="text-sm">↗</span>
          </a>
          <a
            href="https://github.com/varbees/rateguard#quick-start"
            className="inline-flex items-center gap-2 px-5 py-3 border border-[#404040] rounded-lg font-medium hover:border-[#737373] transition-colors"
          >
            Quick Start
          </a>
        </div>
        </div>
      </section>

      {/* Stats */}
      <section className="max-w-4xl mx-auto px-6 pb-16">
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-6 p-6 bg-[#171717] border border-[#262626] rounded-xl">
          {[
            ["146", "Commits"],
            ["123", "Tests"],
            ["3", "Languages"],
            ["MIT", "License"],
          ].map(([value, label]) => (
            <div key={label} className="text-center">
              <div className="text-2xl font-bold">{value}</div>
              <div className="text-sm text-[#737373] mt-1">{label}</div>
            </div>
          ))}
        </div>
      </section>

      {/* Features */}
      <section className="max-w-4xl mx-auto px-6 pb-24">
        <h2 className="text-2xl font-bold mb-10">What makes it different</h2>
        <div className="grid sm:grid-cols-2 gap-6">
          {[
            {
              title: "Agent-Native MCP Tools",
              desc: "5 MCP tools + zero-dependency JSON-RPC stdio server. Claude Code, Cursor, or any MCP client queries RateGuard BEFORE making calls. The agent asks permission — no more 429 errors.",
            },
            {
              title: "Outbound Transport Tracking",
              desc: "Inbound middleware guards your API. The outbound RoundTripper tracks real LLM spend. WrapClient() wraps http.Client — every OpenAI/Anthropic/Google call gets budgeted, traced, and metered.",
            },
            {
              title: "Loop Detection",
              desc: "SHA-256 payload fingerprinting via X-Sequence-Depth header. Runaway agent loops get halted before they torch your budget. Bounded LRU cache — no memory leaks.",
            },
            {
              title: "Multi-Language Parity",
              desc: "Go, Node.js, Python — same token bucket algorithm, same APIs, same presets. Every feature claim has passing tests. 123 tests across three SDKs, all wired end-to-end.",
            },
            {
              title: "Zero Infrastructure",
              desc: "No proxy. No extra service. No third-party dependency. RateGuard runs inside your app process. Drop a middleware and every LLM call becomes transparent.",
            },
            {
              title: "Provider Fallback",
              desc: "Automatic failover across OpenAI-compatible providers when one goes down. Circuit breakers open, provider chain routes to the next — transparent to your application.",
            },
          ].map((f) => (
            <div key={f.title} className="p-5 bg-[#171717] border border-[#262626] rounded-lg">
              <h3 className="font-semibold mb-2">{f.title}</h3>
              <p className="text-sm text-[#a3a3a3] leading-relaxed">{f.desc}</p>
            </div>
          ))}
        </div>
      </section>

      {/* Code snippet */}
      <section className="max-w-4xl mx-auto px-6 pb-24">
        <h2 className="text-2xl font-bold mb-6">One line to ship</h2>
        <div className="bg-[#171717] border border-[#262626] rounded-lg overflow-hidden">
          <div className="flex gap-2 px-4 py-3 border-b border-[#262626]">
            <span className="text-xs text-[#737373]">Go</span>
            <span className="text-xs text-[#525252]">|</span>
            <span className="text-xs text-[#525252]">Node.js</span>
            <span className="text-xs text-[#525252]">|</span>
            <span className="text-xs text-[#525252]">Python</span>
          </div>
          <pre className="p-4 text-sm leading-relaxed overflow-x-auto">
            <code>{`// Track every outbound LLM call with one line
client := rg.WrapClient(&http.Client{})

// Agent queries its own limits before calling
get_rate_limit_state("user-123") → {remaining: 47, limit: 100}

// Stop runaway loops before they burn your budget
X-Sequence-Depth: 3 → SHA-256 fingerprint → halted`}</code>
          </pre>
        </div>
      </section>

      {/* CTA */}
      <section className="max-w-4xl mx-auto px-6 pb-24">
        <div className="bg-[#171717] border border-[#262626] rounded-xl p-8 text-center">
          <h2 className="text-2xl font-bold mb-4">Open source. MIT license. Free forever.</h2>
          <p className="text-[#a3a3a3] mb-6 max-w-lg mx-auto">
            Built by a solo founder in India. 146 commits, 123 tests, 3 languages. Every feature is wired and tested.
          </p>
          <a
            href="https://github.com/varbees/rateguard"
            className="inline-flex items-center gap-2 px-6 py-3 bg-white text-black rounded-lg font-medium hover:bg-[#e5e5e5] transition-colors"
          >
            Star on GitHub
            <span className="text-sm">↗</span>
          </a>
        </div>
      </section>

      {/* Footer */}
      <footer className="border-t border-[#262626]">
        <div className="max-w-4xl mx-auto px-6 py-6 flex items-center justify-between text-sm text-[#525252]">
          <span>Antharmaya Labs · 2026</span>
          <a href="https://antharmaya.com" className="hover:text-[#737373] transition-colors">
            antharmaya.com
          </a>
        </div>
      </footer>
    </main>
  );
}
