# RateGuard Architecture — 2026 Edition

## Positioning

RateGuard is the transparent window into your API internals. One line of code, and every LLM call, every streaming chunk, every token consumed, every circuit trip becomes a traceable, queryable event — with zero added latency.

**Vertical niche:** Middleware that makes AI APIs observable at the protocol level. Not a dashboard you visit. A lens you look through.

## The 2026 stack

```
┌─────────────────────────────────────────────────────────┐
│                    APPLICATION LAYER                     │
│  Express · Fastify · Hono · Next.js · chi · net/http    │
├─────────────────────────────────────────────────────────┤
│                   RATEGUARD MIDDLEWARE                   │
│  ┌──────────┐  ┌──────────┐  ┌────────────────────┐    │
│  │  Rate    │  │  Token   │  │  Circuit            │    │
│  │  Limiter │  │  Budget  │  │  Breaker            │    │
│  │  (token  │  │  (hr/day │  │  (closed→open→     │    │
│  │  bucket) │  │  /month) │  │   half-open)       │    │
│  └──────────┘  └──────────┘  └────────────────────┘    │
│  ┌──────────────────────────────────────────────────┐  │
│  │  GenAI Observer (NEW 2026)                        │  │
│  │  · OTel semantic conventions for LLM calls       │  │
│  │  · Token counting (prompt/completion/streaming)  │  │
│  │  · Model pricing → cost tracking                 │  │
│  │  · Streaming chunk telemetry                     │  │
│  └──────────────────────────────────────────────────┘  │
├─────────────────────────────────────────────────────────┤
│                    EVENT PIPELINE                        │
│  ┌──────────┐  ┌──────────┐  ┌────────────────────┐    │
│  │  Events  │  │  Redis   │  │  OpenTelemetry      │    │
│  │  (in-mem)│  │  (dist)  │  │  (OTLP → Datadog/   │    │
│  │          │  │          │  │   Grafana/Honeycomb) │    │
│  └──────────┘  └──────────┘  └────────────────────┘    │
└─────────────────────────────────────────────────────────┘
```

## Presets (8 total, 3 new for 2026)

| Preset | Use case | Key numbers |
|---|---|---|
| `dev` | Local development | 10 req/s, 1K tokens/hr |
| `standard` | Production API | 100 req/s, 10K tokens/hr |
| `high-throughput` | High-volume services | 1000 req/s, 100K tokens/hr |
| `llm-heavy` | LLM-intensive apps | 500 req/s, 250K tokens/hr, soft stop |
| `strict-upstream-protection` | Fragile upstreams | 50 req/s, aggressive circuit breaking |
| **`streaming-llm`** 🆕 | Real-time LLM streaming | 200 req/s, 500K tokens/hr, queues don't reject |
| **`agent-orchestrator`** 🆕 | Multi-agent systems | 500 req/s, 1M tokens/hr, 1B tokens/month |
| **`mcp-server`** 🆕 | MCP tool servers | 30 req/s (tool-heavy), 50K tokens/hr |

## What makes it world-class vs Datadog/Kong/Cloudflare

| Capability | Datadog | Kong | Cloudflare | RateGuard |
|---|---|---|---|---|
| Rate limiting | Via agent | Plugin | Edge rules | **In-app middleware** |
| LLM token budgets | ❌ | ❌ | ❌ | **✅ Native** |
| GenAI OTel conventions | Partial | ❌ | ❌ | **✅ Full** |
| Streaming-aware | ❌ | ❌ | ❌ | **✅** |
| Cost tracking | Separate product | ❌ | ❌ | **✅ Built-in** |
| Circuit breakers | ❌ | ❌ | ❌ | **✅** |
| Open source (MIT) | ❌ | Partial | ❌ | **✅** |
| Zero infra overhead | ❌ | ❌ | ❌ | **✅** |
| MCP-ready | ❌ | ❌ | ❌ | **✅** |

## Companion tools (optional — the SDK never depends on them)

The middleware above is the whole product; nothing below is required to use it.

- **Dashboard** (`packages/dashboard`) — a self-hosted control center for a running RateGuard
  instance: live budgets, breaker state, agent loop stats, guardrail violations, an MCP tool
  console, and runtime policy tweaks. Talks to `AdminHandler()` directly from the browser — no
  separate database. `docker compose up` for a one-command demo.
- **Connect** (`packages/connect`) — a one-command reverse proxy for third-party tools you don't
  control the source of (Claude Code, Hermes, Aider, Cursor — anything with a `base_url`
  override). Same rate limiting, budgets, breaker, loop detection, and guardrails, fronting any
  OpenAI- or Anthropic-compatible endpoint.

Both are thin: they depend on the SDK, never the reverse, and both are opt-in — nothing about the
in-process middleware changes whether or not you run either of them.

## Roadmap

Shipped, not aspirational — the SDK's default limiter (`ShardedLimiter`, `sharded_limiter.go`) is
already a lock-free, 64-shard, atomic-CAS design; the mutex-based `MemoryLimiter` remains for
callers who want the simpler implementation. Two gaps are still open:

- **Redis Cluster support** — `redis_limiter.go` is single-node today; slot-aware key routing for
  a clustered Redis deployment isn't built yet.
- **gRPC middleware adapter** — unary/streaming interceptors for Go gRPC. LLM services increasingly
  stream over gRPC, but no adapter exists yet; follow the pattern in `packages/sdk-node/src/adapters/`
  when one lands.
