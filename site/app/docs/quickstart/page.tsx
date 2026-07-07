import type { Metadata } from "next";
import Link from "next/link";
import { Callout, DocH1, DocH2, DocsPager, P } from "../../../components/docs/Docs";
import { CodeTabs } from "../../../components/docs/CodeTabs";

export const metadata: Metadata = {
  title: "Quickstart",
  description:
    "Install RateGuard and protect your first endpoint plus your first LLM call in under five minutes — Go, Node.js, or Python.",
};

export default function QuickstartPage() {
  return (
    <>
      <DocH1 kicker="Get started">Quickstart</DocH1>
      <P>
        Five minutes to a protected API and a metered LLM client. Pick your language once — every
        code block on this site remembers it.
      </P>

      <DocH2 id="install">1. Install</DocH2>
      <CodeTabs
        tabs={[
          {
            label: "Go",
            code: `go get github.com/varbees/rateguard/packages/sdk-go`,
          },
          {
            label: "Node.js",
            code: `npm install @varbees/rateguard-node`,
          },
          {
            label: "Python",
            code: `pip install varbees-rateguard`,
          },
        ]}
      />

      <DocH2 id="middleware">2. Rate limit your API (inbound)</DocH2>
      <P>
        Create a RateGuard instance from a <Link href="/docs/presets">preset</Link> and mount the
        middleware for your framework:
      </P>
      <CodeTabs
        tabs={[
          {
            label: "Go",
            code: `import rateguard "github.com/varbees/rateguard/packages/sdk-go"

rg := rateguard.New(rateguard.Config{Preset: "streaming-llm"})

// net/http
http.Handle("/", rg.HTTPMiddleware(myHandler))
// Prometheus metrics
http.Handle("/metrics", rg.Metrics())`,
          },
          {
            label: "Node.js",
            code: `import { RateGuard } from '@varbees/rateguard-node';

const rg = new RateGuard({ preset: 'streaming-llm' });

// Express
app.use(rg.middleware());`,
          },
          {
            label: "Python",
            code: `from rateguard import RateGuard

rg = RateGuard(preset="streaming-llm")

# FastAPI / Starlette (ASGI)
app.add_middleware(rg.asgi_middleware)`,
          },
        ]}
      />

      <DocH2 id="outbound">3. Track your LLM spend (outbound)</DocH2>
      <P>
        Wrap the HTTP client your LLM SDK already uses. Every call gets budgeted,
        breaker-protected per provider, and metered with real token usage:
      </P>
      <CodeTabs
        tabs={[
          {
            label: "Go",
            code: `client := rg.WrapClient(&http.Client{})
openai := openai.NewClient(option.WithHTTPClient(client))`,
          },
          {
            label: "Node.js",
            code: `import OpenAI from 'openai';

const client = new OpenAI({ fetch: rg.wrapFetch() });`,
          },
          {
            label: "Python",
            code: `from openai import OpenAI

client = OpenAI(http_client=rg.wrap_httpx_client())
# async frameworks:
# AsyncOpenAI(http_client=rg.wrap_httpx_async_client())`,
          },
        ]}
      />
      <Callout kind="tip">
        This is the headline feature. Anthropic, Gemini, Vertex, Azure OpenAI, Bedrock, and 16
        OpenAI-compatible hosts (DeepSeek, Groq, vLLM, …) are detected out of the box. See{" "}
        <Link href="/docs/outbound">Track LLM spend</Link> for enforce vs observe modes and
        fallback chains.
      </Callout>

      <DocH2 id="mcp">4. Let your agents ask first (MCP)</DocH2>
      <P>
        Expose RateGuard&apos;s pre-flight tools to any MCP client — so agents check limits{" "}
        <em>before</em> they spend:
      </P>
      <CodeTabs
        tabs={[
          {
            label: "Go",
            code: `// Zero-dependency MCP stdio server (JSON-RPC 2.0)
rg := rateguard.New(rateguard.Config{Preset: "agent-orchestrator"})
_ = rg.ServeMCP(ctx, os.Stdin, os.Stdout)`,
          },
          {
            label: "Node.js",
            code: `// Zero-dependency MCP stdio server (JSON-RPC 2.0)
const rg = new RateGuard({ preset: 'agent-orchestrator' });
await serveMCP(rg);`,
          },
          {
            label: "Python",
            code: `# Zero-dependency MCP stdio server (JSON-RPC 2.0)
rg = RateGuard(preset="agent-orchestrator")
serve_mcp(rg)`,
          },
        ]}
      />
      <P>
        Point Claude Code, Claude Desktop, or Cursor straight at that — every language ships its
        own stdio server, no MCP framework required. Prefer to wire the tool definitions into a
        framework you already run instead? <code>rg.mcpTools()</code> /{" "}
        <code>rg.mcp_tools()</code> return them directly. Full walkthrough in{" "}
        <Link href="/docs/agents-mcp">Agents &amp; MCP</Link>.
      </P>
      <DocsPager slug="quickstart" />
    </>
  );
}
