# RateGuard

RateGuard is a middleware-first API protection and observability stack.

It gives an existing API:

- rate limiting
- token budgets
- circuit breaking
- queue-aware guardrails
- live observability signals

without forcing a traffic reroute or a full architecture change.

## Install

Go middleware:

```bash
go get github.com/varbees/rateguard/sdk-go
```

Node middleware:

```bash
bun add @rateguard/node
```

Python middleware:

```bash
pip install -e packages/sdk-python
```

Generated TypeScript client:

```bash
task openapi:generate
```

## Product Truth

Primary deployment model:

- embed RateGuard as middleware inside your existing API

Secondary deployment model:

- sidecar in Kubernetes

Tertiary deployment model:

- gateway or proxy mode

The current Go runtime still powers the control plane, dashboard APIs, realtime feeds, and self-hosted deployments.
Middleware-first is the product center of gravity.

## Quickstart Today

The fastest working local path in the current repo is the Docker dev stack:

```bash
task dev
```

Once the stack is healthy:

- API runtime: `http://localhost:8008`
- Prometheus: `http://localhost:9090`
- Grafana: `http://localhost:3300`
- Dashboard (separate `task ui:dev`): `http://localhost:3003`
- OpenAPI: `http://localhost:8008/api/v1/openapi.json`
- KEDA metrics: `http://localhost:8008/metrics/keda`
- realtime replay: `http://localhost:8008/api/v1/events/replay`
- realtime SSE: `http://localhost:8008/api/v1/events/stream`

`task dev` is backed by the root Docker compose stack in `deploy/docker/` and brings up Postgres, Redis, the Go control plane, Prometheus, Grafana, and the OTEL collector.
If you want to override ports, browser origins, or credentials, copy `deploy/docker/.env.example` to `deploy/docker/.env` and edit that file.
Stack details live in [`deploy/docker/README.md`](./deploy/docker/README.md).

If you want the dashboard, run in another terminal:

```bash
task ui:dev
```

The dashboard package is driven by Bun through the root task workflow.
The dashboard talks to the local API at `http://localhost:8008`.
The dashboard dev server runs on `http://localhost:3003` so it does not collide with Grafana.
The backend allowlist includes that origin by default.

This is the current local bootstrap while the repo is being reorganized toward the target monorepo layout.

If you need to refresh the generated contract artifacts, run:

```bash
task openapi:generate
```

The autoscaling contract lives in `deploy/keda/` and is driven by the same runtime metrics exposed by the local stack.

## Example

Run the minimal Go middleware demo:

```bash
go run ./examples/http-middleware-demo
```

The example wraps a small `net/http` app with RateGuard middleware and exposes:

- `GET /healthz`
- `GET /hello`

## Verify The Backend

From the repo root:

```bash
task test
```

This runs the current Go test suite without requiring a manually started local server.

## How The Pieces Connect

`packages/sdk-go` is a separate Go module in the root `go.work`. It is the embeddable middleware SDK, not the control plane runtime.
`packages/sdk-node` is the Node.js middleware SDK package in the workspace. It is the embeddable middleware SDK for Express, Fastify, Hono, and Next.js routes.
`packages/sdk-python` is the Python middleware SDK package in the repo. It is the embeddable middleware SDK for FastAPI, Flask, Django, raw WSGI/ASGI, and decorators.

`apps/gateway` is the self-hosted control plane and gateway runtime. It receives events, serves the dashboard APIs, exposes OTEL metrics, and remains the backend service that the SDK reports into.

The backend also serves the live OpenAPI document that powers the generated TypeScript SDK in `packages/sdk-ts/`.
It now also exposes the durable realtime replay endpoint and SSE stream that keep dashboard sessions recoverable after disconnects.

The connection is simple:

- the SDK runs inside the user’s API process
- it enforces local policy and emits structured events
- it reports to the backend control plane and OTEL collector
- the backend feeds the dashboard, SSE stream, and replay surface

Browser-origin CORS and websocket allowlists are controlled with `CORS_ALLOWED_ORIGINS` and `WS_ALLOWED_ORIGINS`. The root Docker env example and the gateway env template both default to the local dashboard ports.

## Where The Project Is Going

RateGuard is being steered toward:

- `apps/gateway/` for the Go control-plane and gateway runtime
- `apps/dashboard/` for the Next.js operator UI
- `packages/sdk-go/` for Go middleware
- `packages/sdk-node/` for Node.js middleware
- `packages/sdk-python/` for Python middleware
- `packages/sdk-ts/` for the generated TypeScript client surface
- `packages/openapi/` for generated contract artifacts
- `deploy/` for Docker, Helm, and KEDA assets
- `apps/gateway/.env.example` for manual backend runs

The execution plan for that pivot is documented here:

- [Middleware-First Execution Plan](./docs/RATEGUARD_MIDDLEWARE_FIRST_EXECUTION_PLAN.md)

## Current Repo Layout

```text
apps/gateway/               current Go runtime
apps/dashboard/             current Next.js dashboard
examples/                   runnable example apps
docs/                       architecture and planning docs
packages/                   generated contracts and SDKs
deploy/                     docker, helm, and keda assets
```

## What Is Explicitly Out For OSS V1

- Stripe and Razorpay in the default build
- subscription-driven entitlements
- legacy plan/billing docs and nav flows
- unsupported scale claims

## One-Line Product Truth

RateGuard gives any existing API rate limiting, token budgets, circuit breaking, and live observability as middleware, without rerouting traffic or changing your architecture.
