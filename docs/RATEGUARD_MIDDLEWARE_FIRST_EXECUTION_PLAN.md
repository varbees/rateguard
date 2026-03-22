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

## Repository Reality

Active paths:
- `apps/gateway/`
- `apps/dashboard/`
- `packages/sdk-go/`
- `packages/sdk-ts/`
- `packages/openapi/`
- `deploy/docker/`
- `docs/`

Local bootstrap split:
- `task dev` starts the backend runtime and infrastructure only
- `task ui:dev` runs the dashboard separately against the local backend
- gateway startup applies database migrations; Docker Compose does not rely on a SQL init bind mount

Transitional paths still in tree but no longer product-center:
- legacy billing handlers and `internal/billing/*`
- docs demo helpers and generated examples that are now archival-only or intentionally historical
- storage-only legacy schema fields (`users.plan`, `plan_tier`) that remain in place until a future schema migration is explicitly scheduled

Release gates:
- `task test`
- `task ui:typecheck`
- `task ui:build`
- `task smoke`

Known environment caveats:
- listener-dependent tests may skip when local sockets are not available
- miniredis-dependent tests may skip when local sockets are not available
- `TEST_DATABASE_URL`-dependent tests skip when that env is missing
- `baseline-browser-mapping` emits a Next.js warning during `next build`; it is informational, not a blocker
- Grafana now defaults to host port `3300` in the local Docker stack to avoid common `3000` collisions

Latest verification snapshot:
- `task test`: passed after the rateguard naming cleanup, including the new circuit-breaker cleanup and transparent proxy streaming regression tests
- `go test -tags commercial ./apps/gateway/internal/billing`: passed after centralizing user lookup and preset persistence behind shared billing helpers
- `task ui:typecheck`: passed after the active docs wording sweep and repository rename cleanup
- `task openapi:generate`: passed after switching generated URL templating from `replaceAll` to `split/join` for the current TS target
- `task dev`: passed in a normal local environment after removing the broken SQL init bind mount and moving Grafana off the conflicting host port
- `task smoke`: passed in a normal local environment against the booted stack
- `task ui:build`: passed in a normal local environment after the dashboard build and static generation completed successfully

## Status At A Glance

Completed:
- OSS billing removal / billing-era UI cleanup
- repository identity renamed from legacy `go-*` naming to `rateguard` naming in the active tree
- archived historical docs that only repeated retired product names were pruned from the tree
- Go SDK middleware module
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
- circuit-breaker cleanup is wired into the runtime lifecycle with a conservative inactive-threshold policy
- stale duplicate `apps/gateway/internal/policy/*` package removed; `internal/domain/policy` is now the only live policy package
- stale `internal/models.RateLimits` / `GetRateLimits` helper removed; policy limits live exclusively in `internal/domain/policy`

In progress:
- post-launch cleanup is now mostly limited to archived docs/examples and small wording polish
- remaining frontend cleanup is now mostly optional team/org UX polish and any archival-only docs/examples that still need wording cleanup
- bounded-context extraction is complete for the launch-critical surfaces; any further slicing is optional
- residual compatibility is now storage-only: the persisted user preset field in the commercial billing surface and the persisted `plan_tier` billing column

Next:
- keep backend pieces thin and policy-driven
- keep frontend aligned with the runtime contract
- keep generated dashboard docs examples on the self-host/local URL story rather than the hosted-only URL
- keep release gates boring and green
- keep archived or historical docs/examples clearly labeled so they do not read as live product copy
- preserve the storage-only legacy columns for now until a future schema migration is explicitly scheduled
- schedule any schema migration or storage cleanup as a separate post-launch workstream only if the team decides the compatibility cost is worth removing

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
- the root README previously overstated the TypeScript package as Node middleware; it is now corrected to a generated client surface
- mutating API routes now enforce an `Idempotency-Key` contract on the advertised mutating surfaces
- queue config now enforces `max_queue_length` at admission time and returns a clean 429 when capacity is exhausted

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
