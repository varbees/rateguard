# RateGuard Codebase Audit - 2026-05-16

This is a code-first audit of the current repository at commit `22c7cff` on branch
`main`. Existing markdown files were used as historical claims only. The findings
below are based on the actual source, route wiring, migrations, SDK packages,
deployment files, and verification commands run on 2026-05-16.

## Executive Verdict

Do not judge this repo as a finished SaaS. It is not launch-ready today.

Do not abandon it blindly either. There is real engineering work here: Go control
plane, Redis/Postgres storage, proxying, realtime events, webhook workers, LLM
token accounting, generated OpenAPI/TS client, and three middleware SDKs. The
highest-potential direction is not "another hosted AI gateway." That market is
already crowded by Cloudflare, Vercel, Kong, Portkey, Helicone, LiteLLM, and
Langfuse-adjacent stacks. The best wedge is narrower:

> Self-hosted, middleware-first API and AI traffic protection for teams that do
> not want to migrate their app behind a full gateway.

Keep going only if the next workstream is a discipline pass: remove drift, make
SDK parity honest, get all release gates green, and produce one tight demo path.
If the goal is a broad hosted AI gateway/observability SaaS, pause or abandon;
the repo is too far behind the market in that category.

## Repo Facts

- Git root: `/home/driftr/Desktop/bolting/rateguard-exp`
- Branch: `main`
- HEAD: `22c7cff feat(sdk-go): align section 2 quickstarts and headers`
- Remote: none configured
- Tracked files: 708
- Dirty state before this audit file: only untracked `.cache/`,
  `apps/gateway/.cache/`, and `codex_resume.txt`

## What Exists

### Backend / Gateway

The backend is a Go Fiber runtime under `apps/gateway/`. It wires:

- Health/readiness/metrics routes outside `/api/v1`.
- `/api/v1` control-plane routes with optional self-protection middleware.
- Auth with JWT cookies, bearer/API-key auth, signup, login, refresh tokens,
  password reset, email verification, geo detection, and user handles.
- API config CRUD, API keys, settings, usage/cost/token dashboards, queue config,
  rate-limit suggestions, guardrails, webhooks, SSE, WebSockets, and OpenAPI.
- Proxy paths:
  - `/api/v1/proxy` JSON proxy.
  - `/proxy/:api_name/*` transparent authenticated proxy.
  - `/p/:firstSegment/*` "intelligent" authenticated proxy for templates or
    handle/slug routes.

Important code anchors:

- Runtime assembly: `apps/gateway/internal/app/runtime/runtime.go`
- Route wiring: `apps/gateway/api/routes.go`
- Proxy service: `apps/gateway/internal/proxy/`
- Storage: `apps/gateway/internal/storage/`
- Migrations: `apps/gateway/migrations/`

### Middleware SDKs

There are three in-process SDKs plus one generated client:

- `packages/sdk-go`: Go HTTP/chi middleware with local or Redis GCRA rate
  limiting, token budgets, event emission, and OpenTelemetry attributes.
- `packages/sdk-node`: Node middleware/runtime package with rate limiter, token
  budget manager, circuit breaker, and Express/Fastify/Hono/Next-style adapters.
- `packages/sdk-python`: Python package with ASGI/WSGI/decorator support, rate
  limiter, token budget manager, circuit breaker, and event payloads.
- `packages/sdk-ts`: generated TypeScript control-plane client, not middleware.

SDK parity is incomplete. Node and Python have real circuit breaker code. Go
emits `circuit_breaker_state: "closed"` in events, but no Go SDK circuit breaker
implementation exists in `packages/sdk-go`.

### Dashboard

The dashboard is a Next.js 16 / React 19 app under `apps/dashboard/`.
It has:

- Auth pages and protected dashboard shell.
- Overview, API config wizard, API detail page, usage charts, queue panels,
  streaming charts, budget/guardrail pages, account/API-key management, and
  realtime WebSocket/SSE client fallback.
- A custom client in `apps/dashboard/lib/api.ts`, despite the generated TS
  client existing under `packages/sdk-ts`.

The dashboard is useful but drifted. It calls endpoints that are not actually
registered, and several mutating client methods do not send the backend-required
`Idempotency-Key` header.

### Workers / Background Processing

"Workers" here are internal Go goroutines, not separate deployable services:

- Webhook worker polls pending webhooks, marks them processing, delivers with
  retries/backoff, records attempts, and uses the proxy circuit breaker manager.
- Analytics/event queue can use Redis Streams when Redis is available, otherwise
  storage falls back to synchronous DB writes.
- WebSocket hub uses Redis Pub/Sub plus Redis stream `rateguard:events` for
  broadcast and replay, with in-memory fallback.
- Circuit breaker cleanup routine removes inactive closed breakers.

KEDA manifests exist, but the analytics worker manifest explicitly describes a
future separate worker cut; the current code still runs consumers in the main
gateway binary.

## Strong Engineering Points

- Redis GCRA rate limiting is implemented with Lua and multi-tier keys for
  per-second, burst, hour, day, and month limits.
- Proxy queue admission is event-driven with waiter channels and completion
  release instead of blind polling.
- Circuit breaker has closed/open/half-open states, rolling outcome ring,
  single half-open probe by default, metrics, reset, and cleanup.
- Streaming LLM responses are passed through without buffering, and the
  transparent proxy handler records streamed token usage after completion.
- Self-protection is real: the Go gateway can wrap `/api/v1/*` with the local Go
  SDK preset `strict-upstream-protection` when Redis and the WebSocket hub exist.
  `/health` and `/metrics` remain outside that group.
- Realtime infrastructure is better than a toy: Redis Pub/Sub, replay stream,
  SSE, WebSocket manager, and normalized event envelopes exist.
- The project has test coverage across backend handlers, rate limiter, queueing,
  streaming token accounting, WebSocket replay, OpenAPI generation, and SDKs.

## Major Code-Backed Problems

These are the issues that would embarrass a demo or mentor review if left
unexplained.

### 1. LLM provider metadata is dropped

The API create flow collects provider/model-like data, and migration
`021_add_llm_token_tracking.up.sql` adds `provider`, `model`, `is_llm_api`, and
`pricing_model` to `api_configs`. But the actual store insert omits those fields:

- `apps/gateway/internal/storage/postgres.go` `CreateAPIConfig` inserts only
  base API config fields.
- `GetAPIConfig`, `GetAPIConfigByName`, and `ListAPIConfigs` also select base
  fields only.
- `apps/dashboard/lib/api.ts` `createAPIConfig()` formats the payload and drops
  `provider` before sending it.

Impact: LLM-specific cost/token attribution is unreliable for newly created APIs.
The UI appears to collect product-critical metadata that the backend never
persists on the main path.

### 2. Idempotency enforcement breaks many dashboard mutations

Backend routes enforce `Idempotency-Key` on many mutating endpoints:

- settings update/password change
- queue config/cancel
- API key regenerate/create/revoke
- API create/update/delete/test
- rate-limit apply
- webhook inbox/replay
- circuit breaker reset
- guardrail config/delete

The frontend only consistently passes idempotency keys for API create and test
connection. Many live dashboard methods in `apps/dashboard/lib/api.ts` call these
mutating endpoints without `idempotencyKey`, so they should return `400` from the
middleware in normal use.

Also, `POST /api/v1/guardrails/alerts/:id/ack` is mutating but is not protected
by the idempotency middleware, unlike the adjacent guardrail config routes.

### 3. Metrics query a table that migrations do not create

`UsageTracker.GetAPIMetrics()` and the KEDA error-burst path query
`request_logs`, but `rg request_logs apps/gateway/migrations` has no migration
that creates it. The actual initial schema has `api_usage` and `api_metrics`.

Impact:

- `GET /api/v1/apis/:id/metrics` can fail at runtime.
- KEDA p95/error metrics can fail or become meaningless.
- The dashboard may show partial/fallback analytics rather than actual metrics.

### 4. Dashboard client has unsupported endpoint drift

`apps/dashboard/lib/api.ts` calls endpoints that route wiring does not register:

- `POST /api/v1/apis/slug/check`
- `GET /api/v1/marketplace/templates`
- `GET /api/v1/marketplace/templates/:provider`
- `GET /api/v1/marketplace/usage`
- `GET /api/v1/webhook/stats`
- `GET /api/v1/models/pricing`

Some handlers or OpenAPI specs exist for a subset, but `apps/gateway/api/routes.go`
does not actually register them. That is worse than a missing feature because it
creates false confidence.

### 5. Deployment/monitoring config is stale

- Docker Compose service name is `gateway` on port `8008`.
- Prometheus config scrapes `aggregator:8080`.
- `apps/gateway/Dockerfile` still names the binary `aggregator` and exposes
  `8080`, while compose overrides the runtime port to `8008`.
- `deploy/docker/compose.staging.yml` overrides a `dashboard` service that is
  not present in the base compose file.

Impact: local/staging observability is likely broken out of the box.

### 6. Go SDK parity claim is not true

Node and Python SDKs implement circuit breakers. Go SDK does not. The Go SDK
event payload carries a circuit breaker state, but middleware events always use
`closed`.

Impact: the gateway self-protection dogfoods the Go SDK, but it does not dogfood
the full protection contract that Node/Python expose.

### 7. Dashboard does not typecheck

`task ui:typecheck` fails on Recharts tooltip formatter types in:

- `apps/dashboard/components/dashboard/APIUsageChart.tsx`
- `apps/dashboard/components/dashboard/StreamingChart.tsx`
- `apps/dashboard/components/queue/queue-analytics.tsx`

The dashboard release gate is not green. In this sandbox, production build also
hit a Turbopack environment error before it could prove the application package.

### 8. Python package metadata is custom and leaky

`packages/sdk-python/pyproject.toml` declares optional dependency group `dev`,
but the custom `build_backend.py` emits wheel metadata with only
`Requires-Dist: cachetools>=5.0`. During verification, `pip install -e '.[dev]'`
warned that the package does not provide the `dev` extra. Tests passed only after
installing `pytest` and `pytest-asyncio` directly.

Impact: developer onboarding and CI will be confusing until package metadata is
generated from `pyproject.toml` or duplicated correctly in the backend.

## Product Reality

The codebase is pulled between two products:

1. A middleware-first control plane and SDK suite.
2. A gateway/proxy/dashboard SaaS with marketplace, billing, public proxy, and
   observability ambitions.

The first is credible and differentiated if tightened. The second is too broad
for the current state and too crowded in the market.

The strongest product sentence the repo can currently support is:

> RateGuard is a self-hosted traffic safety layer for existing APIs and AI apps:
> install middleware in Go/Node/Python, enforce rate limits/token budgets, emit
> realtime events, and optionally route traffic through a Go proxy/dashboard.

The repo cannot honestly claim "production-ready AI gateway SaaS" today.

## Market Context

Market check was based on official/current docs on 2026-05-16:

- Cloudflare AI Gateway offers analytics/logging, caching, rate limiting,
  retries, model fallback, DLP/guardrails, and provider support:
  https://developers.cloudflare.com/ai-gateway/
- Vercel AI Gateway offers a unified model endpoint, budgets, usage/spend
  monitoring, load balancing, fallbacks, BYOK, and observability:
  https://vercel.com/docs/ai-gateway/
- Kong has AI Gateway and AI Rate Limiting Advanced, including token/cost-based
  rate limits and Redis-backed strategies:
  https://developer.konghq.com/plugins/ai-rate-limiting-advanced/
- Portkey positions as an AI Gateway with routing, guardrails, caching,
  fallbacks, circuit breakers, load balancing, budget limits, and rate limits:
  https://portkey.ai/docs/product/ai-gateway
- Helicone AI Gateway/observability covers unified provider access, fallbacks,
  observability, caching, and rate limits:
  https://docs.helicone.ai/gateway/overview
- LiteLLM Proxy is an LLM gateway with auth hooks, logging hooks, cost tracking,
  rate limiting, virtual keys, and spend management:
  https://docs.litellm.ai/
- Langfuse is a strong open-source LLM observability/prompt/evaluation platform:
  https://langfuse.com/docs/observability/overview

Conclusion: "AI gateway plus dashboard" is saturated. "Middleware-first,
self-hosted, drop-in protection with SDK parity" is a narrower and more
defensible lane.

## Verification Run

Commands run during this audit:

- `task test`: failed because the aggregate task ran Go SDK tests through
  `ccache`, which hit a read-only filesystem. Backend package tests in the same
  run passed, with expected socket/integration skips.
- Direct Go SDK test:
  `CC=/usr/bin/gcc GOCACHE=/tmp/go-build-cache GOWORK=off GOPROXY=off GOSUMDB=off go test -v ./...`
  in `packages/sdk-go`: passed.
- Node SDK:
  - `BUN_TMPDIR=/tmp BUN_INSTALL=/tmp/bun bun install`: required network access,
    then passed with no repo changes.
  - `BUN_TMPDIR=/tmp BUN_INSTALL=/tmp/bun bun run test` in `packages/sdk-node`:
    5 files passed, 12 tests passed.
- Python SDK:
  - `python3 -m pip install -e '.[dev]'`: succeeded but warned that `dev` extra
    is not provided by package metadata.
  - `python3 -m pip install pytest pytest-asyncio`
  - `python3 -m pytest -q` in `packages/sdk-python`: 9 passed.
- Dashboard:
  - `task ui:typecheck`: failed on Recharts formatter typings.
  - `task ui:build`: failed before app-code verification with a Turbopack
    internal error while processing `apps/dashboard/app/globals.css`; the root
    cause in this environment was `creating new process -> binding to a port ->
    Operation not permitted`. Treat production build as environment-blocked
    here, while `task ui:typecheck` remains a real code failure.

## Keep / Kill Recommendation

Keep it if you are willing to do one focused repair sprint before adding any new
features.

Kill or archive it if you want a quick SaaS launch against Cloudflare/Vercel/
Portkey/Helicone/LiteLLM. The market will punish a broad, half-working gateway.

My mentor-style recommendation: keep the code, narrow the product, and run a
credibility sprint. This repo has enough hard parts implemented that deleting it
would waste useful work. But it also has enough drift that pretending it is
launch-ready would waste far more time.

## Suggested 14-Day Rescue Plan

1. Pick the lane and write it into the product docs:
   middleware-first, self-hosted API/AI traffic guardrails.
2. Fix provider/model persistence end-to-end:
   dashboard payload, create/update store, get/list selectors, tests.
3. Fix idempotency:
   either send keys from every dashboard mutation or reduce enforcement to routes
   where it is truly required. Make guardrail ack consistent.
4. Replace `request_logs` queries with `api_metrics`/`api_usage`, or create and
   write the missing table. Do not leave both models half-alive.
5. Register or delete stale endpoints:
   marketplace, slug check, webhook stats, model pricing.
6. Fix Docker/Prometheus/staging compose names and ports.
7. Add real Go SDK circuit breaker support or explicitly remove circuit breaker
   from Go SDK parity claims.
8. Fix dashboard typecheck and build.
9. Add CI for backend, dashboard typecheck/build, Go SDK, Node SDK, Python SDK,
   and OpenAPI generation drift.
10. Produce one demo:
    a small Go/Node/Python app protected by middleware, dashboard showing live
    traffic, token budget/rate limit hit, realtime event, and optional proxy.

## Questions For Mentors / Experts

Use these instead of asking "is this good?":

- Is the middleware-first wedge differentiated enough against AI gateway vendors?
- Which buyer would urgently want in-process traffic protection instead of a
  gateway migration?
- Should the dashboard remain a control plane or become optional developer
  tooling around the SDKs?
- Is rate limiting/token budget/circuit breaker enough, or does the product need
  prompt/security guardrails to be taken seriously in 2026?
- Would you cut marketplace, billing, and public proxy features until SDK parity
  and release gates are clean?

## Bottom Line

RateGuard is not dead. It is unfocused.

There is a viable project inside this repo if you compress it around SDK parity,
self-hosted control, and existing-app adoption. There is not a viable near-term
path if you try to compete as a generic AI gateway SaaS with the current code
quality and deployment drift.
