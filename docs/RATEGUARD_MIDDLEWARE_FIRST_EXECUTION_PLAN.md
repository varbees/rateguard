# RateGuard Middleware-First Execution Plan

This file is the canonical source of truth for the repo.

If this document and another doc disagree, this one wins.

Date of current snapshot:
- 2026-03-22

## How To Use This Document

Use this file to answer four questions before making changes:

1. What is the product now?
2. What is already implemented in the repo?
3. What is still transitional or temporary?
4. What is the next safest move?

When the repo changes, update this file in the same workstream so future developers and agents can trust it.

## Product Vision

RateGuard is a middleware-first control plane for existing APIs.

The product is not:
- a forced gateway migration
- a billing-first SaaS wrapper
- a plan-tier marketing site with technical garnish

The product is:
- middleware for request admission, rate limiting, token budgets, and circuit breaking
- a control plane for observability, queueing, and policy presets
- a Go SDK plus OSS gateway runtime that share contracts
- a dashboard and docs experience that match the real runtime behavior

## Competitive Intelligence

The current 2026 market shape matters because it tells us where RateGuard can win and where it will lose if we do nothing.

Primary competitors and the relevant truth:
- Kong: enterprise-heavy, proxy-first, and now shipping premium AI token limiting; the OSS tier still does not give the middleware-first SDK wedge we have
- Portkey: gateway-centric with model catalogs, budgets, rate limits, and virtual keys; strong governance surface, but still proxy/gateway-first rather than in-process middleware
- Tyk: governance-heavy and upmarket; strong enterprise story, weak developer-first in-process story
- Helicone: strong on LLM observability and gateway-style logging/rate limiting, but narrow; it does not cover traditional API traffic control in the same product path
- Cloudflare AI Gateway: powerful edge platform, but not self-hostable or on-prem; structurally different from our audience
- LiteLLM / APISIX AI / Zuplo: credible 2025-2026 entrants, each with one or two strong features, but not the same middleware-first Go SDK shape

RateGuard’s wedge:
- in-process Go middleware for existing apps
- self-hosted control plane and runtime contracts
- LLM token budgets plus traditional API traffic control in one developer path
- OSS-friendly deployment shape for teams that refuse proxy migration

Capability matrix snapshot:

| Capability | RateGuard | Portkey | Helicone | LiteLLM | Kong |
|---|---|---|---|---|---|
| In-process middleware hard-stop before upstream call | Strong | Weak, gateway-centric | Weak | Weak | Weak |
| Works without proxy migration | Strong | Weak | Weak | Weak / partial | Weak |
| Traditional API + LLM in one product path | Strong | Moderate | Weak | Weak | Moderate |
| Self-host / data stays on your infra | Strong | Strong-ish | Moderate | Strong | Strong |
| Governance / workspace policy surface | Partial | Strong | Moderate | Partial | Strong |
| Observability / tracing / analytics depth | Good | Strong | Strong | Strong | Strong |
| Multi-language in-process middleware SDKs | Strong | Weak | Weak | Weak | Weak |
| MCP / agent-tool integration | Not yet | Strong | Strong | Not primary | Strong |

Verdict:
- RateGuard is strongest at the developer-first middleware wedge.
- RateGuard is not yet strongest on enterprise governance, routing breadth, or analytics depth.
- Our durable advantage is narrow but sharp: in-process, self-hosted, cross-language middleware that enforces LLM budgets before the request leaves the app.

## Agent Governance Framing

The goal we are walking toward is not "just API rate limiting."
The sharper category we want to own is:

- AI Agent Traffic Control Plane
- AI governance infrastructure for existing apps
- in-process enforcement for runaway agent loops

This direction is credible because the repo already has the core enforcement primitives:

- hard-stop before upstream call
- circuit breaker for unhealthy loops and failing dependencies
- token-budget enforcement
- realtime observability and replay
- self-hosted gateway/control plane
- Go, Node, and Python middleware contracts

What this means for positioning:
- do not market RateGuard as a proxy migration tool
- do not market it as a pure observability layer
- do not overclaim unique governance features that competitor gateways already have in gateway/proxy form
- do market the in-process enforcement point as the differentiator

Recommended execution order for the framing pivot:
1. Update public-facing copy to lead with agent governance and runaway-spend prevention.
2. Keep the comparison table honest: competitors have strong gateway features, but RateGuard owns the in-process middleware wedge.
3. Make the self-protection loop visible so the product dogfoods its own contract.
4. Add the MCP bridge only as a follow-on integration layer when the schedule can support it.
5. Add any ergonomic SDK sugar, such as budget enforcement helpers, only if it keeps the in-process contract simpler for developers.
6. Produce the demo assets around a real runaway-agent scenario rather than an abstract gateway comparison.

Do not use unverified TAM or revenue numbers inside the repo docs unless they are separately sourced in marketing collateral.
The source of truth here should stay on architecture, contracts, and what the repo can actually do.

What this means:
- we should not drift back toward proxy-first product thinking
- the core moat is the SDK integration path plus the realtime control plane
- feature completeness alone is not enough if the hot-path algorithms are weak or the docs lie about runtime behavior

## Algorithmic Gap Map

This section is the priority list for the remaining technical hardening work.

1. Replace the Redis rate limiter’s fixed-window counter path with an atomic GCRA-style Lua script.
   - Goal: remove boundary spikes, collapse the multi-call counter path into a mathematically correct Redis operation, and keep the retry-after signal deterministic.
   - Status: completed in the codebase; the live limiter now uses an atomic GCRA Lua path and propagates retry-after metadata.
2. Wire streaming token accounting end-to-end.
   - Goal: make the token-budget wedge work on the default LLM workload, which is streaming.
   - Status: completed in the codebase; the transparent proxy now accumulates SSE chunks, extracts final token usage, and records the streamed LLM completion.
3. Replace polling-based queue admission with event-driven wakeup.
   - Goal: remove timer churn and make backpressure visible instead of approximate.
   - Status: completed in the codebase; queued requests now wait on per-request channels and wake on FIFO completion signals instead of polling every 50ms.
4. Harden the circuit breaker around a rolling window or equivalent error-rate detection.
   - Goal: stop letting intermittent successes hide an unhealthy upstream.
   - Status: completed in the codebase; the breaker now uses a rolling outcome window with configurable error-rate thresholding.
5. Add bounded eviction to hot in-memory maps in the SDK token/rate limiter paths.
   - Goal: keep the middleware safe under high-cardinality tenants and API keys.
   - Status: completed in the codebase; the SDK limiter and token-budget manager now use bounded caches instead of unbounded maps.

These are not product feature requests. They are algorithmic correctness and scale-safety tasks.

## Repository Reality

Active paths:
- `apps/gateway/`
- `apps/dashboard/`
- `packages/sdk-go/`
- `packages/sdk-node/`
- `packages/sdk-python/`
- `packages/sdk-ts/`
- `packages/openapi/`
- `deploy/docker/`
- `docs/`
- `AGENTS.md` plus `agent_docs/` is the lightweight repo-operating contract for future tasks

SDK reality:
- `packages/sdk-go` is the reference in-process middleware SDK in the repo; the gateway dogfooding plan centers on this implementation
- `packages/sdk-node` is a real Node.js middleware SDK package in the repo, built against the same middleware-first contract model
- `packages/sdk-python` is now a Python middleware SDK package in the repo, with FastAPI, Flask, Django, WSGI/ASGI, and decorator support
- `packages/sdk-ts` is a generated TypeScript control-plane client, not a middleware SDK
- Node middleware exists; Python middleware is now part of the repo state and should stay aligned with the Go and Node SDK contracts

Local bootstrap split:
- `task dev` starts the backend runtime and infrastructure only
- `task ui:dev` runs the dashboard separately against the local backend
- gateway startup applies database migrations; Docker Compose does not rely on a SQL init bind mount
- `task dev` rebuilds the gateway image from source; it is not a hot-reload loop for code changes

Transitional paths still in tree but no longer product-center:
- legacy billing handlers and `internal/billing/*`
- docs demo helpers and generated examples that are now archival-only or intentionally historical
- storage-only legacy schema fields (`users.plan`, `plan_tier`) that remain in place until a future schema migration is explicitly scheduled

Current strategic read:
- the repo is already credible as middleware-first OSS
- the remaining launch risk is not architecture invention, it is release validation plus a small amount of contract and UI polish
- any future work should preserve the SDK wedge and avoid re-centralizing the product around the proxy
- the biggest post-launch SDK expansion opportunity is no longer adding SDKs from scratch; it is keeping the Go, Node, and Python middleware contracts aligned as the repo evolves
- the new root `AGENTS.md` file should stay small, with specialized guidance split across `agent_docs/`
- the next strategic product move is to dogfood `packages/sdk-go` inside the gateway process so RateGuard protects its own control plane routes with the same middleware contract it ships to users

## Self-Protection Loop

This is the highest-leverage product loop now that the launch-scope hardening work is complete.

Goal:
- run RateGuard's own gateway API through `sdk-go` middleware in-process
- keep the control plane self-protected without introducing a circular dependency
- use the dashboard to make the loop visible in real time
- keep the gateway boot sequence safe by initializing middleware only after Redis and Postgres are healthy

Why it matters:
- it proves the SDK is not just a library, but the same runtime contract RateGuard depends on internally
- it collapses gateway and SDK correctness into one test surface
- it gives a live trust signal for demos, onboarding, and enterprise evaluation
- it makes `task smoke` and local stack validation more representative of actual production usage

Status:
- Completed. The gateway now routes `/api/v1/*` through `sdk-go` middleware in-process after Redis and Postgres are healthy, while `/health` and `/metrics` stay outside the protected boundary.
- Completed. The dashboard events screen now consumes the live request feed and websocket event spine, so gateway `request.completed` and `request.rate_limited` activity is visible in the UI instead of mocked.
- Completed. The dashboard's user-facing data screens now use live backend contracts instead of synthetic defaults: API keys list/create/revoke through `/api/v1/api-keys`, usage analytics come from `/api/v1/dashboard/stats` plus `/api/v1/dashboard/usage/history` and recent requests, budget guardrails read the live cost estimate endpoint, the token summary card uses `/api/v1/dashboard/tokens`, the live analytics widget no longer invents fallback series, and the analytics view aggregates from real dashboard history instead of random series.
- Completed. The dashboard realtime provider now falls back from WebSocket to the authenticated SSE stream at `/api/v1/events/stream` when websocket reconnects exhaust, and the visible dashboard cards subscribe only to backend-emitted event names (`metrics.update`, `alert.triggered`, `system.health`, `circuit_breaker.state_change`, `api.metrics.update`, `request.*`) instead of guessed UI-only topics.
- Completed. The authenticated dashboard screens were audited end to end against the live backend contracts, and the remaining user-facing drift was removed: settings now target `/api/v1/dashboard/settings`, the webhook screen only exposes the real inbox/status/details/replay flow, the account screen uses the live handle update path, the API and queue screens stay on supported control-plane routes, and no frontend control now advertises unsupported backend behavior as if it were live.
- Completed. The websocket contract was tightened across the dashboard: the shared realtime context and the older dashboard websocket wrapper now derive the transport from the active host configuration, and the frontend event unions only include backend-emitted events (`metrics.update`, `alert.triggered`, `system.health`, `circuit_breaker.state_change`, `api.metrics.update`, `request.completed`, `request.rate_limited`, `request.token_budget_exceeded`, `test.message`).
- Completed. The remaining user-facing docs and legacy dashboard surfaces were aligned with the live backend routes and data model: the real-time analytics docs now reference `/api/v1/dashboard/alerts`, webhook docs and replay controls now use `/api/v1/webhook/events/:id/replay`, the webhook detail sheet no longer fabricates attempt history, and the websocket debug panel names the real event set.
- Completed. SDK event parity is restored across Go, Node, and Python: all three middleware SDKs now share the same canonical request event wire surface (`request.completed`, `request.rate_limited`, `request.token_budget_exceeded`), and the older SDK-only `request.circuit_open`, `request.rate_limiter_degraded`, and `request.budget_warning` topics were removed from the control-plane contract.
- Completed. Login now accepts either email or handle plus password, the dashboard auth form sends the `identifier` payload, and the live smoke passed after restoring the missing `users.country_code` and `users.detected_currency` columns that the current auth and billing lookups expect.
- Completed. API creation and connection testing are contract-aligned end to end: the dashboard derives `slug` when it is omitted, the gateway accepts the optional slug and returns the derived proxy URL, the `test-connection` body matches the handler contract, and live smoke against `/api/v1/apis/test-connection` plus `/api/v1/apis` passed.
- Completed. The create-API wizard now sends `Idempotency-Key` on both the connection test and create calls, maps upstream credentials to the backend's actual `auth_type` / `auth_credentials` contract, and validates target URLs inline before letting the user continue.
- Completed. The gateway CORS contract now allows `Idempotency-Key` on authenticated API routes, so the dashboard's create and test-connection POSTs can pass browser preflight and reach the live handler instead of surfacing a fake `NETWORK_ERROR`.
- Completed. Provider auth in the dashboard now matches the current upstream docs: OpenAI and Cohere use bearer tokens, Anthropic uses `x-api-key`, Gemini uses `x-goog-api-key`, and the BasicConfiguration screen blocks test/create until a required provider key is present.
- Completed. The dashboard provider docs and templates were refreshed to match the current upstream URLs: Gemini now has native and OpenAI-compatible proxy URLs in the docs, and Cohere moved to the current `v2` endpoint in both the wizard and template screen.
- Completed. The create-API test-connection flow is now provider-aware end to end: the dashboard sends `provider`, `custom_headers`, and `Idempotency-Key`, the gateway probes canonical model paths for OpenAI/Anthropic/Google/Cohere, and custom REST APIs now probe with `GET` so public endpoints like Fakestore are tested with a request that matches their actual contract.
- Completed. The final create payload now persists the selected provider metadata into the API config record, so the dashboard review step, stored API state, and proxy defaults stay in sync instead of dropping the provider field on the floor.
- Completed. The local compose stack now ships a valid base64-encoded dev `ENCRYPTION_KEY`, so template-driven proxy creation can persist upstream credentials without tripping the storage guardrail.
- Verified. `task test`, `task ui:typecheck`, `task ui:build`, and the live smoke burst against `/api/v1/apis` passed; the stack boots cleanly with `task dev`, and the realtime replay shows the self-protection events.
- Verified. After the screen audit, `task ui:typecheck`, `task ui:build`, and `task smoke` still passed.
- Verified. After the websocket and docs cleanup, the dashboard typecheck and build still pass.
- Verified. Live preflight against `/api/v1/apis/test-connection` now returns `Access-Control-Allow-Headers: Origin,Content-Type,Accept,Authorization,X-API-Key,Idempotency-Key`, confirming the browser can send the mutating POST.
- Verified. The Node SDK test suite and the Python SDK test suite passed after removing the legacy wire events.
- Verified. `task ui:typecheck` and `task ui:build` passed after the login/email-handle and API-create contract sync patch.
- Verified. Live smoke passed after the schema migration restored the missing user geo columns: signup, login by handle, login by email, `/api/v1/apis/test-connection`, and `/api/v1/apis` create with derived slug all succeeded.
- Verified. The create wizard now passes the backend-required idempotency header on both mutating requests, and the dashboard build/typecheck pass in the current repo state.

Ordered implementation plan:
1. Define the protection boundary.
   - Apply `sdk-go` middleware to the public `/api/v1/*` surfaces that represent the control plane.
   - Keep health and bootstrap endpoints outside the protected path so the stack can still recover and report status.
2. Wire the middleware at bootstrap.
   - Register the SDK after storage and Redis are ready.
   - Keep route assembly and middleware registration explicit in `internal/app/bootstrap` or the route setup path so startup ordering stays readable.
3. Reuse the live runtime contract.
   - Keep rate limiting, circuit breaking, and token-budget semantics identical between the gateway's internal paths and the SDK behavior shipped to users.
   - Avoid adding a second gateway-specific implementation if the SDK already owns the contract.
4. Surface the loop in observability.
   - Ensure the realtime spine and dashboard can show the gateway being protected by its own middleware.
   - Keep the event envelope and metrics visible so the dogfood loop is auditable, not just implied.
5. Verify the full loop.
   - Run unit tests for the middleware path.
   - Run `task test`, `task ui:typecheck`, `task ui:build`, and `task smoke`.
   - Confirm the boot sequence still works when the middleware is enabled. This is now verified in the current snapshot.
6. Document the result.
   - Update the plan doc, README, and any launch docs so they describe the self-protection loop accurately.

Future extension:
- MCP server support is a possible follow-on layer over the same control plane API.
- Treat MCP as an expansion path for agentic integrations, not as part of the current launch-scope dogfooding work unless it is explicitly scheduled.

Release gates:
- `task test`
- `task ui:typecheck`
- `task ui:build`
- `task smoke`

Dashboard typecheck workflow:
- `task ui:typecheck` regenerates dashboard route type artifacts before running `tsc --noEmit`, so a clean checkout does not depend on stale `.next` output

Known environment caveats:
- listener-dependent tests may skip when local sockets are not available
- miniredis-dependent tests may skip when local sockets are not available
- `TEST_DATABASE_URL`-dependent tests skip when that env is missing
- `baseline-browser-mapping` emits a Next.js warning during `next build`; it is informational, not a blocker
- Grafana now defaults to host port `3300` in the local Docker stack to avoid common `3000` collisions
- the Python SDK typecheck task now runs strict mypy when available and falls back to compileall in this tool-limited container

Latest verification snapshot:
- `task test`: passed after the rateguard naming cleanup, including the new circuit-breaker cleanup, transparent proxy streaming regression tests, and the Redis limiter migration to atomic GCRA Lua
- `task test`: passed again after the Redis limiter GCRA rewrite and retry-after propagation update
- `task test`: passed again after wiring streamed SSE token accounting into the transparent proxy response path
- `task test`: passed again after replacing the queue admission polling loop with event-driven waiter wakeups and queue-completion release hooks
- `task test`: passed again after converting the circuit breaker to a rolling error-rate window and bounding the SDK hot-path caches
- `go test -tags commercial ./apps/gateway/internal/billing`: passed after centralizing user lookup and preset persistence behind shared billing helpers
- `task ui:typecheck`: passed after the active docs wording sweep and repository rename cleanup
- `task ui:typecheck`: passed after adding route type regeneration to the task so a clean checkout does not depend on stale `.next` output
- `task ui:typecheck`: passed again after the queue/circuit-breaker/cache hardening pass
- `task ui:typecheck`: passed again after the dashboard guardrail rename and realtime events screen wiring
- `task ui:typecheck`: passed again after the realtime events empty-state polish
- `task ui:typecheck`: passed again after the authenticated dashboard contract audit and webhook/account/UI drift cleanup
- `packages/sdk-node`: `bun run typecheck`, `bun run test`, and `bun run build` passed after the Node middleware SDK package was added
- `packages/sdk-python`: `task sdk-python:test` passed after adding the local editable backend and a test-only `iniconfig` shim; `task sdk-python:typecheck` runs strict mypy when available and falls back to compileall in this tool-limited container
- `task openapi:generate`: passed after switching generated URL templating from `replaceAll` to `split/join` for the current TS target
- `task dev`: passed in a normal local environment after removing the broken SQL init bind mount and moving Grafana off the conflicting host port
- `task smoke`: passed in a normal local environment against the booted stack
- `task ui:build`: passed in a normal local environment after the dashboard build and static generation completed successfully
- `task ui:build`: passed after the authenticated dashboard contract audit and webhook/account/UI drift cleanup

## Status At A Glance

Completed:
- OSS billing removal / billing-era UI cleanup
- repository identity renamed from legacy `go-*` naming to `rateguard` naming in the active tree
- archived historical docs that only repeated retired product names were pruned from the tree
- Go SDK middleware module
- Node middleware SDK package
- Python middleware SDK package
- OpenAPI generation path
- TypeScript SDK generation path
- OTEL / metrics / replay / SSE surfaces
- dashboard product copy cleanup
- landing/public shell copy cleanup
- landing social proof rewritten to factual proof points instead of fabricated testimonials
- the DwightBot landing easter egg was removed from the app tree
- the fake landing team section and dead dashboard team route were removed from the active tree
- the API auth docs page now describes the self-host/local base URL instead of a hosted-only URL
- active docs pages and docs helper components retuned toward middleware-first wording, with no active compatibility wording left in the live docs tree
- migration guide retuned to proxy-path middleware-first wording
- generated docs API-spec wording cleanup
- generated checkout example retuned to a neutral billing description
- signup UI now defers to the backend default policy preset instead of hardcoding the previous plan vocabulary
- dashboard stats now expose `preset` only
- API limit responses now expose `current_preset` only
- auth signup/login/me payloads now expose `handle` and `preset`, and handle availability/update routes are restored
- OpenAPI generation and the generated TS SDK no longer rely on `replaceAll`, so the emitted client stays compatible with the current dashboard TypeScript target
- the Node SDK package is wired into the workspace and Taskfile, with dedicated `test`, `build`, and `typecheck` tasks
- backend composition root extraction
- gateway request-shaping extraction
- HTTP adapter extraction for retry/parsing/streaming/transport dispatch
- queue admission extraction
- shared proxy success-response helpers
- shared proxy tracking-header helper for forwarded and streaming responses
- shared proxy request-forwarding helper for user/template proxy paths
- transparent proxy request shaping extracted into a dedicated helper
- transparent proxy streaming body handling extracted into a dedicated helper
- shared proxy request error handling for rate-limit, not-found, disabled, and generic failure cases
- shared queue response helpers for limit and timeout cases
- queue-side rate-limit observation persistence extracted into a dedicated helper
- queue service wording aligned with policy preset terminology
- commercial token quota checking now uses the live preset layer instead of the retired `PlanChecker` wrapper
- commercial checkout copy and subscription sync now speak preset language; `plan_tier` is only a storage-column detail behind the billing boundary
- commercial billing checkout requests and responses now use `preset` only; `plan_tier` remains storage-only in the database
- commercial checkout service request shaping now uses `preset` directly and persists it to the legacy `plan_tier` column behind the storage boundary
- commercial billing now reuses shared storage helpers for user lookup and preset persistence instead of duplicating SQL across services
- refresh token rotation now requires the token to exist in storage; the legacy grace fallback was removed
- active user-facing middleware and proxy code now consume the user's canonical `preset` field directly
- active signup handling now requires `preset` and normalizes it internally
- active signup request shaping now reads `req.Preset` directly instead of branching on a legacy alias
- Redis rate limiting now uses an atomic GCRA Lua path instead of the old fixed-window counter script, and the global middleware surfaces retry-after metadata
- streaming token accounting now accumulates streamed SSE chunks, extracts the final completion usage, and records streamed LLM metrics
- the circuit breaker now uses a rolling outcome window with configurable error-rate thresholding instead of consecutive-failure-only triggering
- the SDK limiter and token-budget manager now use bounded caches instead of unbounded per-key maps
- circuit-breaker cleanup is wired into the runtime lifecycle with a conservative inactive-threshold policy
- stale duplicate `apps/gateway/internal/policy/*` package removed; `internal/domain/policy` is now the only live policy package
- stale `internal/models.RateLimits` / `GetRateLimits` helper removed; policy limits live exclusively in `internal/domain/policy`
- the docs source of truth now records the current competitive landscape and algorithmic gap map so future changes stay aligned with the real market position

In progress:
- post-launch cleanup is now mostly limited to archived docs/examples and small wording polish
- remaining frontend cleanup is now mostly optional team/org UX polish and any archival-only docs/examples that still need wording cleanup
- bounded-context extraction is complete for the launch-critical surfaces; any further slicing is optional
- residual compatibility is now storage-only
- algorithmic hardening is complete for the current launch scope; the remaining work is release validation and small UI/docs polish

Next:
- keep backend pieces thin and policy-driven
- keep frontend aligned with the runtime contract
- keep generated dashboard docs examples on the self-host/local URL story rather than the hosted-only URL
- keep release gates boring and green
- keep archived or historical docs/examples clearly labeled so they do not read as live product copy
- preserve the storage-only legacy columns for now until a future schema migration is explicitly scheduled
- schedule any schema migration or storage cleanup as a separate post-launch workstream only if the team decides the compatibility cost is worth removing
- if the team resumes feature work before launch validation, keep it limited to polish and any newly discovered correctness issues

## Launch Readiness Audit

This workstream exists to answer a simple question: is the repo ready to be shown to strangers, not just to the current maintainers?

Audit focus:
- SDK developer experience
- core runtime correctness
- architecture and contract integrity
- token budget end-to-end behavior
- self-host onboarding
- test and release gate health
- OSS launch readiness
- competitive positioning
- OSS scaffolding expected for public launch:
  - license
  - contributing guide
  - code of conduct
  - issue templates
  - at least one end-to-end example app

Audit rules:
- inspect the live repo state, not aspirational docs
- keep this plan updated as findings are confirmed
- do not introduce schema migrations in this workstream; storage-only legacy columns stay deferred
- call out blockers with file paths and concrete fixes
- separate release blockers from post-launch improvements

Audit deliverables:
- a scorecard for each audit domain
- a list of critical blockers, if any
- a list of high-priority improvements
- a launch confidence score with justification
- a short answer on whether the repo is launch-ready now or only after specific fixes
- an explicit callout of any missing OSS scaffolding that would block a public launch

Confirmed audit findings so far:
- the repo now contains the standard OSS launch scaffolding files (`LICENSE`, `CONTRIBUTING.md`, `CODE_OF_CONDUCT.md`, GitHub issue templates)
- the repository now contains a complete end-to-end example app under `examples/http-middleware-demo`
- the repository now contains a working `packages/sdk-node` middleware package for Express, Fastify, Hono, and Next.js route handlers
- the repository now contains a scaffolded `packages/sdk-python` middleware package for FastAPI, Flask, Django, raw WSGI/ASGI, and decorators
- the root README previously overstated the TypeScript package as Node middleware; it is now corrected to a generated client surface
- mutating API routes now enforce an `Idempotency-Key` contract on the advertised mutating surfaces
- queue config now enforces `max_queue_length` at admission time and returns a clean 429 when capacity is exhausted
- streaming token extraction still exists as a helper, but the proxy streaming path does not wire it end-to-end yet; streaming metrics are recorded, token budgets are not
- the logged-in dashboard now has a live `/dashboard/events` realtime screen in the nav, so the frontend gap has been closed
- dashboard usage stats now expose `monthly_request_limit` in the backend model and frontend contract; the active UI copy uses guardrail/preset language end to end
- the dashboard guardrail components now use `UsageGuardrailsBanner` and `UsageGuardrailsCard`
- the architecture docs page still contains an over-strong claim about "unbounded goroutines" on the middleware path; that wording is product-copy debt rather than a runtime claim

## Phase Ledger

### Phase 0: Strip Billing, Fix Tests, Rewrite README

Status:
- Completed on 2026-03-20

What landed:
- billing-specific runtime behavior is gated or removed from the OSS path
- budget/guardrail surfaces are framed without pricing language
- tests are stabilized around the current repo layout
- README/docs/nav reflect the middleware-first shape

### Phase 1: Go SDK Middleware Package

Status:
- Completed in practice

Current state:
- `packages/sdk-go` is a standalone module
- HTTP and chi middleware are implemented
- token budgets and event emission exist
- OpenTelemetry hooks exist

### Phase 2: LLM Token Budgets

Status:
- Implemented

Current state:
- token-aware events are emitted
- hard-stop and soft-stop budget behavior exist
- dashboard contract surfaces exist for token metrics

### Phase 3: OpenAPI / TypeScript SDK

Status:
- Implemented

Current state:
- live OpenAPI generation exists
- generated TS client exists
- dashboard contract bridge is aligned to generated shapes

### Phase 4: Realtime Event Spine

Status:
- Implemented

Current state:
- SSE stream and replay are present
- websocket delivery normalizes the event envelope
- Redis stream append and fallback archive are in place

### Phase 5: Queueing / Admission / Guardrails

Status:
- Implemented with remaining orchestration cleanup

Current state:
- queueing exists
- policy preset checks exist
- queue admission now has a dedicated helper

### Phase 6: Dashboard / Control Plane

Status:
- Implemented with remaining cleanup

Current state:
- dashboard uses generated contract bridges
- product copy is middleware-first
- plan/pricing language has been removed from active operator surfaces
- landing/public-facing copy is aligned with the middleware-first story

### Launch Readiness Audit

Status:
- Completed on 2026-03-22

Current state:
- the plan doc is the source of truth for the audit scope and completed deliverables
- release validation passed in a normal local environment
- schema migration is explicitly deferred for this workstream
- GitHub Actions CI is still absent; the badge is a post-launch polish item, not a launch blocker
- audit findings should be reflected back into this file as post-launch cleanup or future work

## Immediate Next Actions

1. Keep the dashboard contract bridge thin and generated-code-backed; active API payloads now carry `preset` only.
- The dashboard stats payload now carries `preset` only, and the live token widget reads it directly.
- Auth signup/login/me payloads now carry `handle` and `preset`, and the handle availability/update contract is back on the auth surface.
2. Continue backend bounded-context extraction into `internal/domain/*`, `internal/app/*`, and `internal/adapters/*` only where it still adds value.
   - The first bootstrap seam is extracted into `internal/app/bootstrap` for startup banners, migrations, and Fiber error handling.
   - The service assembly and lifecycle live in `internal/app/runtime`; `cmd/main.go` is launch-only orchestration.
   - Gateway request-shaping helpers live in `internal/domain/gateway` for target URL assembly, outbound auth, API config validation, and proxy request IDs.
   - HTTP retry policy, circuit-breaker-wrapped execution, response parsing, streaming classification, and transport method dispatch live in `internal/adapters/http`.
   - Rate-limit observation persistence lives in storage.
   - API response header forwarding uses a shared helper so the proxy handlers stay thin and consistent.
   - Queue admission lives in a dedicated helper so the main queue proxy path is orchestration-only before execution.
   - The user/template proxy handlers now share a forwarding helper so only endpoint-specific auth/header differences remain.
   - The proxy response layer now owns shared RateGuard tracking headers for forwarded and streaming responses, so the remaining handler logic is mostly route-specific auth and body handling.
   - Transparent proxy request shaping now lives in a helper, which keeps the handler focused on auth, orchestration, and streaming.
   - Transparent proxy streaming body handling now lives in a dedicated helper, and the async stream metrics path no longer depends on the live Fiber request context.
   - Shared proxy request error handling now owns the rate-limit, not-found, disabled, and generic failure branches for the proxy entrypoints.
   - Queue-side rate-limit observation persistence now lives behind a dedicated helper, so the queue path no longer owns the async storage write branch inline.
   - Queue limit and timeout responses now use shared helpers, which removes the last large inline response-shaping block from the queue admission path.
   - Circuit-breaker cleanup now starts with the runtime lifecycle and uses the shared shutdown channel, so the circuit-breaker manager tail is now just maintenance rather than dormant code.
   - Remaining cleanup is mostly archive-only wording or small edge-case polish.
3. Keep the runtime contract canonical. Any remaining storage-only legacy columns should stay behind storage helpers until a schema migration is scheduled.
4. Keep `task test`, `task ui:typecheck`, `task ui:build`, and `task smoke` as the regression gates for repo-level changes.
5. Keep `CORS_ALLOWED_ORIGINS` and `WS_ALLOWED_ORIGINS` explicit in env examples so browser and websocket clients stay reproducible across local and staging runs.
6. Keep active docs and generated examples aligned with the runtime contract; reserve legacy wording for archived material only.
7. Expand the examples area only after the core contracts are stable enough to teach from.

## Current Contract Boundaries

### `internal/domain/gateway`

Owns:
- target URL assembly
- outbound auth wiring
- API config validation
- proxy request IDs

### `internal/domain/policy`

Owns:
- preset vocabulary
- preset normalization
- token budget policy
- priority / plan-style policy translation where needed

### `internal/billing` commercial surface

Owns:
- Stripe and Razorpay integration details
- commercial subscription lifecycle
- shared storage helpers for user lookup and preset persistence
- persisted `plan_tier` columns for legacy billing records
- token quota checks that reuse the live preset policy layer

### `internal/models.User`

Owns:
- the canonical `preset` field for runtime consumers
- the persisted `plan` column mapping used by storage

### `internal/adapters/http`

Owns:
- retry/backoff
- circuit-breaker-wrapped execution
- response header parsing
- stream classification
- transport dispatch

### `internal/storage`

Owns:
- rate-limit observation persistence
- usage and analytics writes

### `internal/proxy`

Owns:
- proxy orchestration
- queueing orchestration
- circuit breaker wiring
- request/response shaping that is still not shared

### `api/*`

Owns:
- Fiber handlers
- request parsing
- response mapping
- shared header forwarding helpers
- streaming response plumbing

## Current Release Notes

Latest verified state:
- `task test` passes
- `task ui:typecheck` passes
- mutating routes enforce `Idempotency-Key` on the advertised mutating surfaces
- queue admission enforces `max_queue_length` and returns a 429 when capacity is exhausted
- the Redis websocket listener exits cleanly on closed channels and tolerates nil logger / nil context during tests and shutdown
- `task ui:build` passes in a normal local environment; the `baseline-browser-mapping` warning is informational
- `task smoke` passes against the real booted stack; sandbox networking is the only reason it previously failed here
- listener-dependent, miniredis-dependent, and `TEST_DATABASE_URL`-dependent tests skip when the environment does not provide the required local resources
- refresh-token rotation is now strict: missing DB state returns unauthorized instead of continuing in a grace mode
- launch gate status: reached
- the live dashboard now has a real `/dashboard/events` realtime screen and the stats contract uses `monthly_request_limit`
- the repo still does not ship a GitHub Actions workflow, so the CI badge remains a post-launch polish item

## Capacity Plan

The repo's real bottlenecks are the same hot paths the audit surfaced, so the capacity plan should stay focused on them rather than on external benchmark claims.

Current hot paths:
- Redis rate-limit checks are the first request-path bottleneck because every protected request hits the counter layer.
- WebSocket/SSE fanout is the first realtime bottleneck because dashboard sessions hold open connections and consume pubsub resources.
- Postgres async writes are the first durability bottleneck because analytics and usage writes are buffered rather than fully in-memory.
- Queue admission is the first pressure-release bottleneck because it is the explicit backpressure path when traffic exceeds a preset.

Current mitigation posture:
- keep Redis counters isolated from event-stream workloads
- keep queue caps enforced and observable
- keep websocket consumers closed cleanly on disconnect
- keep Postgres writes batched or buffered where possible
- measure saturation with release validation rather than relying on theoretical ceilings
- benchmark the queue admission lock path and websocket fanout path in-package so regressions show up before release validation

What not to do:
- do not add schema migrations in this workstream
- do not turn the proxy mode back into the product center
- do not rely on marketing benchmarks as a substitute for local/staging proof

## Final Principle

The pivot is not "middleware instead of gateway."

The pivot is:
- control plane first
- middleware first
- gateway optional
- truthful contracts before distributed-system theatrics

That is the version of RateGuard worth shipping.
