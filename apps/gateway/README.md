# RateGuard Gateway Runtime

This directory contains the current Go control plane/runtime for RateGuard.

Today it still serves multiple roles:

- gateway or proxy execution
- policy enforcement
- queueing and circuit breaking
- realtime event fanout
- metrics and analytics
- control-plane APIs

The product direction is middleware-first:

- middleware-first is the primary product model
- sidecar is the secondary model
- gateway mode remains supported as a tertiary runtime option

## What This Runtime Already Does Well

- distributed rate limiting with Redis
- queue-aware request handling
- circuit breakers
- websocket-based realtime updates
- Prometheus metrics and Grafana dashboards
- Postgres-backed control-plane state

## What Is Changing

The OSS default build is being cleaned up to remove:

- billing-coupled runtime paths from the OSS default build
- subscription-driven entitlement logic from the active product surface
- legacy wording from the live dashboard/docs surfaces
- Stripe and Razorpay handlers from the default build via commercial build tags

And it is being refactored toward:

- `internal/domain/*` bounded contexts
- `internal/app/*` orchestration layers
- `internal/adapters/*` framework and storage implementations
- `internal/storage/*` persistence helpers

## Local Development

Prerequisites:

- Go 1.24+
- PostgreSQL
- Redis

Quickstart:

```bash
task dev
```

That task runs the root Docker compose stack from `deploy/docker/` and starts the gateway on `http://localhost:8008` alongside Postgres, Redis, Prometheus, Grafana, and the OTEL collector.
The stack layout, ports, and env override flow are documented in `../../deploy/docker/README.md`.
The dashboard portion of the workflow is Bun-backed through the root `task` runner via `task ui:dev`.

Or run directly:

```bash
go build -o /tmp/rateguard-gateway ./cmd/main.go
go run ./cmd/main.go
```

Run the OSS-default test suite:

```bash
task backend:test
```

To run the dashboard against the local backend, use:

```bash
task ui:dev
```

The dashboard reads `NEXT_PUBLIC_API_URL=http://localhost:8008` and `NEXT_PUBLIC_WS_URL=ws://localhost:8008` by default through the root task workflow.
The Bun dashboard dev server runs on `http://localhost:3003`.
The backend CORS and websocket allowlists are controlled with `CORS_ALLOWED_ORIGINS` and `WS_ALLOWED_ORIGINS`; the bundled env examples default to the dashboard port above.

Useful endpoints:

- health: `GET /health`
- readiness: `GET /ready`
- metrics: `GET /metrics`
- keda metrics: `GET /metrics/keda`
- openapi: `GET /api/v1/openapi.json`
- websocket: `GET /ws`
- realtime replay: `GET /api/v1/events/replay`
- realtime SSE: `GET /api/v1/events/stream`

Regenerate the committed OpenAPI and TypeScript artifacts from this runtime with:

```bash
task openapi:generate
```

## Current Role In The Repo

Until the monorepo migration is complete, this directory remains the main Go execution base for:

- local docker bootstrap
- proxy mode
- realtime dashboard feeds
- control-plane experimentation

The SDK lives separately in `packages/sdk-go` and imports this runtime only through HTTP/event contracts, not as a package dependency.
The generated TypeScript SDK in `packages/sdk-ts/` follows the same contract and is emitted from the backend manifest.
Realtime recovery uses the `/api/v1/events/replay` window plus `/api/v1/events/stream` for live SSE consumers.
KEDA scaling manifests live under `deploy/keda/` and use the `/metrics/keda` exposition path plus Prometheus queries for gateway and worker autoscaling.

## Docs

See:

- `../../README.md`
- `../../docs/RATEGUARD_MIDDLEWARE_FIRST_EXECUTION_PLAN.md`
