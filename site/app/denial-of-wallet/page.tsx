import type { Metadata } from "next";
import Link from "next/link";
import { CodeTabs } from "@/components/docs/CodeTabs";

export const metadata: Metadata = {
  metadataBase: new URL("https://rateguard.antharmaya.com"),
  title: "Denial of Wallet: documented AI agent runaway-cost incidents, and the config that stops each one",
  description:
    "A sourced library of real AI agent budget-overrun incidents (the $6,531 DN42 loop, the reported $47K two-agent ping-pong, a 63-incident academic catalog), each mapped to the in-process enforcement that stops it.",
  openGraph: {
    title: "Denial of Wallet: when your own agent is the attacker",
    description:
      "Documented runaway-agent-spend incidents, primary sources only, each mapped to the RateGuard config that stops it.",
    type: "website",
    siteName: "Antharmaya Labs",
  },
  keywords: [
    "denial of wallet", "AI agent runaway costs", "LLM budget enforcement", "agent infinite loop",
    "token budget", "AI cost control", "agent runtime enforcement",
  ],
  robots: "index, follow",
};

type Incident = {
  title: string;
  cost: string;
  story: string;
  sourceLabel: string;
  sourceHref: string;
  sourceNote?: string;
  stops: string;
};

const incidents: Incident[] = [
  {
    title: "The DN42 scanner that bankrupted its operator",
    cost: "$6,531 in under 24 hours",
    story:
      "An unsupervised agent set loose to scan the DN42 hobbyist network worked around its basic guardrails and autonomously provisioned five large AWS instances overnight. The Hacker News thread hit 1,467 points — because everyone running agents knows it could have been them.",
    sourceLabel: "Hacker News discussion (June 2026, 1,467 points)",
    sourceHref: "https://news.ycombinator.com/item?id=48500012",
    sourceNote:
      "Honest scope: the bill here was cloud spend, not LLM API spend. What an in-process enforcement layer reaches is the unchecked reasoning loop driving those decisions — halting the engine, not the invoice it already generated.",
    stops:
      "A hard session budget plus loop detection halts the agent's decision loop long before hour 24 — the agent stops reasoning when its grant is exhausted, instead of stopping when a human wakes up.",
  },
  {
    title: "The $47,000 two-agent ping-pong",
    cost: "~$47,000 over 11 days (reported)",
    story:
      "As reported in a developer postmortem and catalogued in Vectara's community collection of agent failures: an \"Analyzer\" and a \"Verifier\" agent in a LangChain A2A research pipeline passed work back and forth for 264 hours. Each message was worded differently — so nothing that matched exact repeats could see the loop. Every retelling of this story you've seen citing a major tech publication is embellished; the postmortem is the source, and we cite it as reported, not verified.",
    sourceLabel: "Case study in vectara/awesome-agent-failures",
    sourceHref:
      "https://github.com/vectara/awesome-agent-failures/blob/main/docs/case-studies/langchain-a2a-47k-infinite-loop.md",
    stops:
      "This is the paraphrase loop: SHA-256 fingerprinting alone provably misses it. Semantic loop detection (cosine distance over recent steps, computed locally) plus a monthly hard budget kills it in minutes, not days. Semantic loop detection ships in v0.3.",
  },
  {
    title: "Sixty-three incidents, catalogued",
    cost: "A documented failure class, not an anecdote",
    story:
      "An academic catalog of 63 real LLM-agent budget-overrun incidents — collected, classified, and published with a dataset. Runaway agent spend isn't a viral story that happened to someone once; it is a recurring production failure mode with a taxonomy.",
    sourceLabel: "arXiv 2606.04056 — \"Token Budgets: An Empirical Catalog of 63 LLM-Agent Budget-Overrun Incidents\"",
    sourceHref: "https://arxiv.org/abs/2606.04056",
    stops:
      "The catalog's common thread: alerts fired, dashboards updated, and nothing enforced. Budgets that deny — reserve before the call, commit what was actually spent — are the difference between a graph of the incident and the absence of one.",
  },
  {
    title: "The function-call loop, in the wild since 2023",
    cost: "Community-reported burns, recurring",
    story:
      "OpenAI's own developer forum has a years-long thread of developers describing the same shape: a tool-calling loop that retries, re-ingests its own growing context, and burns budget quadratically until someone notices.",
    sourceLabel: "OpenAI developer community thread",
    sourceHref: "https://community.openai.com/t/function-call-loop-burned-through-my-budget/550563",
    stops:
      "Request fingerprinting (SHA-256 over prompt + tools, bounded LRU) halts exact-repeat loops at depth N — shipped today in all three languages, wired into middleware via X-Sequence-Depth.",
  },
  {
    title: "Your guardrails are the attack surface",
    cost: "Denial-of-Wallet as a security class",
    story:
      "Researchers showed that agent guardrails themselves can be weaponized: craft inputs that trigger endless reasoning-extension and retry cycles, and the defender's own safety machinery runs up the bill. A loop isn't just a bug anymore — it's an exploitable vulnerability with a name.",
    sourceLabel: "arXiv 2606.14517 — \"From Shield to Target: Denial-of-Service Attacks on LLM-Based Agent Guardrails\"",
    sourceHref: "https://arxiv.org/abs/2606.14517",
    stops:
      "Enforcement that lives below the guardrails: a spend ceiling the attacked component cannot extend caps the blast radius of any input-triggered loop, adversarial or accidental.",
  },
];

const configTabs = [
  {
    label: "Go",
    code: `rg := rateguard.New(rateguard.Config{
    Preset:        "agent-orchestrator", // 1M tokens/hr ceiling, soft-stop
    LoopDetection: true,                 // SHA-256 fingerprint, halts repeats
})
client := rg.WrapClient(http.DefaultClient) // every LLM call metered
// Sub-agents get a narrowing, verifiable grant — not your API key:
child, childKey, _ := rateguard.Attest(root, parentKey,
    rateguard.AttestOptions{Grant: rateguard.BudgetGrant{MaxTokens: 50_000}})`,
  },
  {
    label: "Node.js",
    code: `const rg = new RateGuard({
  preset: "agent-orchestrator", // 1M tokens/hr ceiling, soft-stop
  loopDetection: true,          // SHA-256 fingerprint, halts repeats
});
const client = new OpenAI({ fetch: rg.wrapFetch() }); // every call metered
// Sub-agents get a narrowing, verifiable grant — not your API key:
const { token: child } = attest(root, parentKey, { grant: { maxTokens: 50_000 } });`,
  },
  {
    label: "Python",
    code: `rg = RateGuard(preset="agent-orchestrator", loop_detection=True)
client = OpenAI(http_client=rg.wrap_httpx_client())  # every call metered
# Sub-agents get a narrowing, verifiable grant — not your API key:
child, child_key = attest(root, parent_key, BudgetGrant(max_tokens=50_000))`,
  },
];

export default function DenialOfWalletPage() {
  return (
    <main className="min-h-screen bg-[var(--bg)] text-[var(--fg)]">
      {/* Header */}
      <header className="sticky top-0 z-50 border-b border-[var(--border)] bg-[var(--bg)]/80 backdrop-blur">
        <div className="mx-auto flex max-w-6xl items-center justify-between px-6 py-4">
          <div className="flex items-baseline gap-3">
            <Link href="/" className="font-display text-[15px] font-bold tracking-tight">
              RateGuard<span className="text-[var(--accent)]">.</span>
            </Link>
            <Link href="/docs" className="text-sm font-medium hover:text-[var(--fg)] transition-colors">
              Docs
            </Link>
          </div>
          <a href="https://github.com/varbees/rateguard" className="text-sm text-[var(--muted)] hover:text-[var(--fg)] transition-colors">
            GitHub ↗
          </a>
        </div>
      </header>

      {/* Hero */}
      <section className="px-6 pt-24 pb-16">
        <div className="mx-auto max-w-3xl text-center">
          <p className="mb-5 text-sm uppercase tracking-[0.2em] text-[var(--muted)]">
            The incident library · Primary sources only
          </p>
          <h1 className="font-display text-4xl sm:text-5xl font-bold leading-[1.08] mb-6">
            Denial of Wallet
          </h1>
          <p className="mx-auto max-w-2xl text-lg text-[var(--muted)] leading-relaxed">
            When software spends money at machine speed, the dangerous actor isn&apos;t
            inbound traffic. It&apos;s your own agent. These incidents are real, each
            linked to its primary source. No invented dollar figures: the internet is
            full of viral runaway-cost numbers that dissolve under a citation check,
            and we checked. Each incident is mapped to the enforcement that stops it.
          </p>
        </div>
      </section>

      {/* Incidents */}
      <section className="mx-auto max-w-3xl px-6 pb-20">
        <div className="flex flex-col gap-8">
          {incidents.map((inc) => (
            <article key={inc.title} className="rounded-xl border border-[var(--border)] bg-[var(--card)] p-7">
              <div className="mb-1 text-sm font-medium text-[var(--accent)]">{inc.cost}</div>
              <h2 className="font-display text-xl font-bold mb-3">{inc.title}</h2>
              <p className="text-[var(--muted)] leading-relaxed mb-4">{inc.story}</p>
              <p className="text-sm leading-relaxed mb-4">
                <span className="font-medium">What stops it:</span>{" "}
                <span className="text-[var(--muted)]">{inc.stops}</span>
              </p>
              {inc.sourceNote && (
                <p className="text-xs text-[var(--muted)] leading-relaxed mb-4 border-l-2 border-[var(--border)] pl-3">
                  {inc.sourceNote}
                </p>
              )}
              <a
                href={inc.sourceHref}
                className="text-sm text-[var(--accent)] hover:underline"
                rel="nofollow noopener"
              >
                Source: {inc.sourceLabel} ↗
              </a>
            </article>
          ))}
        </div>
      </section>

      {/* The pattern */}
      <section className="px-6 pb-20">
        <div className="mx-auto max-w-2xl text-center">
          <h2 className="font-display text-3xl font-bold mb-5">The pattern in every postmortem</h2>
          <p className="text-[var(--muted)] leading-relaxed">
            The telemetry was fine. Dashboards graphed the burn in real time. Alerts
            fired into channels nobody was watching at 3am. Provider spend caps were
            monthly, so the meter had weeks of headroom. What was missing in every
            single case is the same thing: <span className="text-[var(--fg)]">enforcement
            in the process where the agent runs</span>. Something that denies the next
            call instead of describing it. Observability explains the bill afterward.
            Gateways cap the perimeter, coarsely. Flight controls belong inside the aircraft.
          </p>
        </div>
      </section>

      {/* The config */}
      <section className="mx-auto max-w-3xl px-6 pb-20">
        <h2 className="font-display text-2xl font-bold mb-3 text-center">The config that stops them</h2>
        <p className="text-center text-[var(--muted)] mb-8 text-sm">
          In-process, three languages, identical behavior. Conformance-tested, not just similar APIs.
        </p>
        <CodeTabs tabs={configTabs} />
      </section>

      {/* Field honesty */}
      <section className="mx-auto max-w-3xl px-6 pb-20">
        <h2 className="font-display text-2xl font-bold mb-6 text-center">Who else works on this</h2>
        <p className="text-[var(--muted)] leading-relaxed mb-6 text-sm text-center max-w-2xl mx-auto">
          An honest map, because the problem is bigger than any one tool. Gateways
          (LiteLLM, Portkey, Bifrost, Helicone) enforce budgets at a proxy you deploy:
          strong for org-wide policy, blind to anything that doesn&apos;t route through
          them. In-process attempts exist too: ironcurtain is an actively developed
          security-policy runtime for agents (TypeScript); several single-language
          budget guards have appeared and mostly gone dormant. What none of them
          combine, as of July 2026: cross-language parity held by shared conformance
          vectors, cryptographic budget delegation with narrowing, and loop detection, all
          in the same process as your agent.
        </p>
        <div className="flex justify-center">
          <Link
            href="/docs"
            className="inline-flex items-center gap-2 px-5 py-3 border border-[var(--border)] rounded-lg font-medium hover:border-[var(--muted)] transition-colors"
          >
            See what ships today
          </Link>
        </div>
      </section>

      {/* CTA */}
      <section className="mx-auto max-w-2xl px-6 pb-24 text-center">
        <h2 className="font-display text-2xl sm:text-3xl font-bold mb-4">
          Give your agents flight controls.
        </h2>
        <p className="text-[var(--muted)] mb-8">
          Budgets, breakers, and loop-kills that live inside your agent&apos;s process —
          and receipts that prove what it spent. Open source, MIT.
        </p>
        <div className="flex flex-wrap justify-center gap-4">
          <a
            href="https://github.com/varbees/rateguard"
            className="inline-flex items-center gap-2 px-6 py-3 bg-[var(--fg)] text-[var(--bg)] rounded-lg font-medium hover:opacity-90 transition-colors"
          >
            Star on GitHub <span className="text-sm">↗</span>
          </a>
          <Link
            href="/docs/quickstart"
            className="inline-flex items-center gap-2 px-6 py-3 border border-[var(--border)] rounded-lg font-medium hover:border-[var(--muted)] transition-colors"
          >
            Quickstart
          </Link>
        </div>
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
