import type { Metadata } from "next";
import Link from "next/link";
import { Callout, DocH1, DocH2, DocsPager, P, Table } from "../../../components/docs/Docs";
import { CodeTabs } from "../../../components/docs/CodeTabs";
import { CodeBlock } from "../../../components/docs/CodeBlock";

export const metadata: Metadata = {
  title: "Agents & MCP",
  description:
    "Give AI agents rate-limit awareness: MCP pre-flight tools with peek semantics, a zero-dependency stdio server, and config for Claude Code, Claude Desktop, and Cursor.",
};

export default function AgentsMcpPage() {
  return (
    <>
      <DocH1 kicker="Guides">Agents &amp; MCP</DocH1>
      <P>
        Agents burn budgets because they can&apos;t see their own limits — they discover a rate
        limit by hitting it, then retry into the same wall. RateGuard inverts that: it exposes
        limits as <strong>MCP tools an agent can query before acting</strong>. The agent asks
        &quot;can I make this call?&quot; and gets an answer without a single token spent.
      </P>
      <Callout kind="note" title="Peek semantics — the core guarantee">
        Every tool below is a <strong>peek</strong>: querying never consumes budget, never takes a
        token from the bucket, never records loop state. An agent can check as often as it wants
        for free.
      </Callout>

      <DocH2 id="tools">The five base tools</DocH2>
      <P>Identical across Go, Node.js, and Python:</P>
      <Table
        head={["Tool", "What it answers"]}
        rows={[
          [<code key="t">get_rate_limit_state</code>, "Would a call for this key be allowed right now? Remaining, limit, retry-after."],
          [<code key="t">get_token_budget</code>, <>How many LLM tokens remain? Optionally: would <code>estimated_tokens</code> fit?</>],
          [<code key="t">get_circuit_breaker_state</code>, "Is the upstream healthy? closed / open / half-open."],
          [<code key="t">check_loop</code>, "Has this exact payload been seen at a lower sequence depth (runaway loop)?"],
          [<code key="t">list_limits</code>, "Everything above in one call — designed for agent initialization."],
        ]}
      />
      <P>
        Go adds two more — <code>attest_budget</code> and <code>verify_budget</code> — for
        cryptographic budget delegation between agents. See{" "}
        <Link href="/docs/budget-attestation">Budget attestation</Link>.
      </P>

      <DocH2 id="serve">Serve the tools</DocH2>
      <P>
        The Go SDK ships a <strong>zero-dependency MCP stdio server</strong> — newline-delimited
        JSON-RPC 2.0 implementing <code>initialize</code>, <code>tools/list</code>,{" "}
        <code>tools/call</code>, and <code>ping</code>. Node and Python return tool definitions
        ready to register in your MCP server framework:
      </P>
      <CodeTabs
        tabs={[
          {
            label: "Go",
            code: `rg := rateguard.New(rateguard.Config{Preset: "agent-orchestrator"})

// Serve over stdio — plugs into any MCP client config
_ = rg.ServeMCP(ctx, os.Stdin, os.Stdout)

// Or call tools directly, in-process:
res := rg.MCPCall("get_token_budget",
    map[string]any{"key": "tenant-1", "estimated_tokens": 8000})`,
          },
          {
            label: "Node.js",
            code: `const rg = new RateGuard({ preset: 'agent-orchestrator' });

const tools = rg.mcpTools();  // MCPTool[] for your MCP server framework

const result = await rg.mcpCall('check_loop', {
  system_prompt: s,
  user_input: u,
  sequence_depth: 3,
});`,
          },
          {
            label: "Python",
            code: `rg = RateGuard(preset="agent-orchestrator")

tools = rg.mcp_tools()  # list[MCPTool] for your MCP server framework

result = rg.mcp_call("get_rate_limit_state", {"key": "tenant-1"})`,
          },
        ]}
      />

      <DocH2 id="clients">Connect Claude Code, Claude Desktop, or Cursor</DocH2>
      <P>
        Any MCP client can query RateGuard. Add your app (running the stdio server) to the
        client&apos;s MCP config:
      </P>
      <CodeBlock
        title="mcp config (Claude Code / Claude Desktop / Cursor)"
        code={`{
  "mcpServers": {
    "rateguard": {
      "command": "your-app",
      "args": ["mcp"]
    }
  }
}`}
      />
      <P>
        From that moment the agent can call <code>list_limits</code> on startup to learn its
        operating envelope, <code>get_token_budget</code> with an estimate before an expensive
        call, and <code>check_loop</code> when its own behavior starts repeating.
      </P>

      <DocH2 id="pattern">The pre-flight pattern</DocH2>
      <P>A well-behaved agent loop with RateGuard looks like this:</P>
      <CodeBlock
        title="agent pseudocode"
        code={`state = mcp.call("list_limits")            # 1. learn the envelope at startup

for task in tasks:
    budget = mcp.call("get_token_budget", {
        "key": tenant, "estimated_tokens": est(task)})
    if not budget["fits"]:
        wait_or_replan(budget["retry_after"])  # 2. ask before spending

    loop = mcp.call("check_loop", {
        "system_prompt": sp, "user_input": ui,
        "sequence_depth": depth})
    if not loop["allowed"]:
        break                                  # 3. stop your own runaway loop

    result = call_llm(task)                    # 4. spend — metered by the
                                               #    outbound transport`}
      />
      <Callout kind="tip">
        Pair this with the <Link href="/docs/outbound">outbound transport</Link>: MCP tools are
        how the agent <em>asks</em>, the wrapped HTTP client is how spend is <em>enforced</em>.
        Together the agent can&apos;t out-spend its budget even when it forgets to ask.
      </Callout>

      <DocH2 id="preset">Which preset?</DocH2>
      <P>
        <code>agent-orchestrator</code> (500 RPS, 1M tokens/hr, soft-stop) for multi-agent
        systems; <code>mcp-server</code> (30 RPS, 50K tokens/hr, hard-stop) when RateGuard guards
        an MCP tool server itself. Full table in <Link href="/docs/presets">Presets</Link>.
      </P>
      <DocsPager slug="agents-mcp" />
    </>
  );
}
