# rateguard-connect

A one-command reverse proxy that puts RateGuard's rate limiting, token budgets, circuit breaker,
loop detection, and guardrails in front of **any** OpenAI-compatible or Anthropic-compatible LLM
endpoint — for tools you don't control the source of.

If you own the calling code, use the SDK directly instead (`WrapClient` / `wrapFetch` /
`wrap_httpx_client`) — zero proxy hop, zero extra process. This exists for everything else: a
third-party coding agent, a CLI tool, an IDE extension — anything that exposes a `base_url` / API
base override but isn't something you can add an import to.

## Install & run

```bash
cd packages/connect
go build -o rateguard-connect .
./rateguard-connect -upstream https://api.deepseek.com -port 8090
```

Or without building first:

```bash
go run . -upstream https://api.anthropic.com -port 8091 -name claude
```

Starts **permissive and observational by default** — soft-stop token budgets (2M/hour, 20M/day),
generous rate limits (50 req/s, burst 100). Nothing blocks real traffic until you add `-hard-stop`
or tighten it live through the dashboard's Controls page once you've seen real usage.

## Point a tool at it

Every row below labels its own confidence — **✅ verified** means tested against the tool's real
documentation or the actual running proxy this session; **⚠️ reported** means it came from research
that wasn't independently re-verified here — check before depending on it for anything but casual,
low-stakes use.

| Tool | Config | Confidence |
|---|---|---|
| **Claude Code** | `ANTHROPIC_BASE_URL` — set in `~/.claude/settings.json`'s `env` block (applies to every new session) or export before launching `claude`. **Only takes effect on a new process** — doesn't affect an already-running session. Also: pointing at a non-first-party host disables MCP tool search by default; set `ENABLE_TOOL_SEARCH=true` to keep it. | ✅ verified against [code.claude.com/docs/en/env-vars](https://code.claude.com/docs/en/env-vars) |
| **Hermes** (Nous Hermes Agent) | `hermes config set <provider>.base_url http://localhost:PORT/v1` | ✅ verified live — real DeepSeek traffic tracked, token count matched exactly |
| **Aider** | `--openai-api-base` flag, or `OPENAI_API_BASE` env var (note: **not** `OPENAI_BASE_URL` — Aider uses the older name). Non-OpenAI models need an `openai/` prefix, e.g. `aider --model openai/deepseek-chat`. | ✅ verified against [aider.chat/docs/config/options.html](https://aider.chat/docs/config/options.html) |
| **Cursor** | Settings → Add Model → "Override OpenAI Base URL". **Only the chat/plan panel honors this** — Composer, inline edit, autocomplete, and apply/edit do not route through a custom endpoint. | ✅ verified (with the caveat) — don't expect to see Cursor's actual agent usage through this |
| **OpenAI Python/Node SDK** (and anything built on it) | `OPENAI_BASE_URL` env var, or `base_url` param to the client constructor. Some tools built on older SDK versions expect the legacy `OPENAI_API_BASE` name instead — set both if unsure. | ✅ verified against official OpenAI SDK docs |
| Gemini (native), via Google's OpenAI-compat layer | `base_url` → `https://generativelanguage.googleapis.com/v1beta/openai/` — so pointing *that* at rateguard-connect (rather than the tool itself) also works if the tool speaks Gemini's OpenAI-compat mode | ✅ verified — this exact URL is a real, currently-configured production endpoint |
| Codex CLI, Gemini CLI, Continue, Cline, Roo Code, OpenHands, CrewAI, AutoGen/AG2, LangChain/LangGraph, LlamaIndex, Haystack, Google ADK, Vercel AI SDK, Mastra | `OPENAI_BASE_URL` / `OPENAI_API_BASE` / an `apiBase` or `base_url` code param, per the tool's own docs | ⚠️ reported by research, not independently re-verified — same general OpenAI-compatible pattern, but check the specific tool's docs before relying on it |

## What you get, free

- Real token counting and cost estimation for every call
- Rate limiting, circuit breaking, loop detection, guardrails (PII/prompt-injection) — per key
- 7 MCP tools queryable over HTTP (`/admin/mcp/tools`, `/admin/mcp/call`)
- Prometheus metrics (`/metrics`) and a full dashboard (`packages/dashboard`)
- All of it MIT-licensed, single static Go binary, zero required external dependencies

## Flags

| Flag | Default | What it does |
|---|---|---|
| `-upstream` | *(required, or `UPSTREAM_BASE_URL`)* | The real API to forward to |
| `-port` | `8090` (or `PORT`) | Port to listen on |
| `-name` | derived from `-upstream`'s host | Dashboard/admin-API key |
| `-rps` | `50` | Requests per second |
| `-burst` | `100` | Burst capacity |
| `-budget-hour` | `2,000,000` | Token budget per hour |
| `-budget-day` | `20,000,000` | Token budget per day |
| `-hard-stop` | `false` | Enforce budgets instead of just observing |

## Security posture

Same as the SDK's `AdminHandler()` — **no authentication**. Bind to `localhost` or an internal
network; if it must be reachable beyond that, put your own auth in front of it (reverse proxy with
basic auth, internal VPN, service mesh policy). It's a real proxy for real API keys — treat the
network boundary around it accordingly.
