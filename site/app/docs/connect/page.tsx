import type { Metadata } from "next";
import Link from "next/link";
import { Callout, DocH1, DocH2, DocsPager, P, Table } from "../../../components/docs/Docs";
import { CodeBlock } from "../../../components/docs/CodeBlock";

export const metadata: Metadata = {
  title: "Connect — universal proxy",
  description:
    "A one-command reverse proxy that puts RateGuard in front of any OpenAI- or Anthropic-compatible endpoint, for third-party tools you don't control the source of — Claude Code, Hermes, Aider, Cursor, and anything with a base_url override.",
};

export default function ConnectPage() {
  return (
    <>
      <DocH1 kicker="Operate">Connect — for tools you don&apos;t own</DocH1>
      <P>
        The SDK wraps your own <code>http.Client</code> / <code>fetch</code> / <code>httpx</code>
        — great when you control the calling code. <code>packages/connect</code> is for
        everything else: a coding agent, a CLI tool, an IDE extension — anything that exposes a{" "}
        <code>base_url</code> override but isn&apos;t something you can add an import to.
      </P>
      <CodeBlock
        title="one command"
        code={`go run . -upstream https://api.deepseek.com -port 8090
# point the tool's base_url at http://localhost:8090/v1`}
      />
      <Callout kind="note">
        Starts <strong>permissive and observational</strong>: soft-stop budgets, generous limits.
        Nothing blocks real traffic until you add <code>-hard-stop</code> or tighten it live
        through the <Link href="/docs/dashboard">dashboard&apos;s</Link> Controls page.
      </Callout>

      <DocH2 id="point">Point a tool at it</DocH2>
      <P>
        Every row states its own confidence — <strong>verified</strong> means tested against the
        tool&apos;s real docs or a live proxied call this session; <strong>reported</strong> means
        it&apos;s the common OpenAI-compatible pattern, not independently re-checked here.
      </P>
      <Table
        head={["Tool", "Config", ""]}
        rows={[
          [<code key="1">Claude Code</code>, <><code>ANTHROPIC_BASE_URL</code> — new process only; non-first-party hosts disable MCP tool search unless <code>ENABLE_TOOL_SEARCH=true</code></>, "✅ verified"],
          [<code key="2">Hermes</code>, <code>hermes config set &lt;provider&gt;.base_url http://localhost:PORT/v1</code>, "✅ verified live"],
          [<code key="3">Aider</code>, <><code>--openai-api-base</code> / <code>OPENAI_API_BASE</code> (not <code>OPENAI_BASE_URL</code>)</>, "✅ verified"],
          [<code key="4">Cursor</code>, "Settings → Override OpenAI Base URL — chat panel only, not Composer/autocomplete", "✅ verified"],
          [<code key="5">OpenAI SDK</code>, <><code>OPENAI_BASE_URL</code> env or <code>base_url</code> param</>, "✅ verified"],
          ["Everything else OpenAI-compatible", <>Codex CLI, Continue, Cline, LangChain, CrewAI, Vercel AI SDK, … — same <code>base_url</code>/<code>apiBase</code> pattern</>, "⚠️ check the tool's own docs"],
        ]}
      />

      <DocH2 id="get">What you get, free</DocH2>
      <P>
        Real token counting and cost estimation, rate limiting, circuit breaking, loop detection,
        guardrails — all per key, plus the same 7 MCP tools and Prometheus metrics the SDK exposes.
        One static Go binary, MIT-licensed, zero required external dependencies.
      </P>

      <DocH2 id="compose">Or via Docker Compose</DocH2>
      <CodeBlock
        title="from the repo root"
        code={`UPSTREAM_BASE_URL=https://api.deepseek.com docker compose --profile connect up
# proxy: http://localhost:8090 · dashboard: http://localhost:3001`}
      />

      <DocH2 id="security">Security posture</DocH2>
      <P>
        Same as <code>AdminHandler()</code> — <strong>no authentication</strong>. It&apos;s a real
        proxy for real API keys: bind to <code>localhost</code> or an internal network, and put
        your own auth in front if it must be reachable beyond that.
      </P>
      <DocsPager slug="connect" />
    </>
  );
}
