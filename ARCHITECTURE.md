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
│  │  (sliding│  │  (hr/day │  │  (closed→open→     │    │
│  │  window) │  │  /month) │  │   half-open)       │    │
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

## Claude's hard 10% (at 1:50 AM)

### 1. Lock-free sharded rate limiter
- Replace mutex-based limiter with atomic counters + sharded windows
- Target: <1μs overhead at p99 under 100K concurrent req/s
- Pattern: per-CPU shard, no contention on read path

### 2. gRPC middleware adapter
- Unary + streaming interceptors for Go gRPC
- LLM services increasingly use gRPC streaming
- Follow existing adapter pattern (see `packages/sdk-node/src/adapters/`)

### 3. Redis cluster support
- Current `redis_limiter.go` is single-node
- Need: Redis Cluster with slot-aware key routing
- Fallback: local limiter when Redis is partitioned

### 4. Prometheus metrics endpoint (5 min, Hermes can do)
- Expose `/metrics` with all RateGuard counters in Prometheus format
- No new dependencies — already have counters via OTel
