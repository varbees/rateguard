# Stack Reference

## Task Runner

```bash
task dev               # Start gateway + infra only
task ui:dev            # Start the dashboard against the local backend
task test              # Run backend + Go SDK tests
task ui:typecheck      # Regenerate route types, then run the dashboard typecheck
task ui:build          # Build the dashboard
task smoke             # Release smoke test against a booted stack
task openapi:generate  # Regenerate OpenAPI + generated TypeScript client artifacts
task sdk-node:test     # Run Node SDK tests
task sdk-node:build    # Build the Node SDK
task sdk-node:typecheck # Type-check the Node SDK
task sdk-python:test   # Run Python SDK tests
task sdk-python:typecheck # Strict mypy when available; fallback in this repo when not
```

## Current Boot Flow

- `task dev` starts the backend runtime and local infrastructure only.
- `task ui:dev` runs the dashboard separately on port `3003`.
- Grafana is intentionally on port `3300` to avoid `3000` collisions.
- Gateway startup applies migrations; the Docker stack does not rely on a SQL init bind mount.

## Repository Layout

- `apps/gateway/` is the Go control plane and proxy runtime.
- `apps/dashboard/` is the Next.js operator UI.
- `packages/sdk-go/` is the Go middleware SDK.
- `packages/sdk-node/` is the Node.js middleware SDK.
- `packages/sdk-python/` is the Python middleware SDK.
- `packages/sdk-ts/` is the generated TypeScript control-plane client.

## Environment Variables

Required for a full local stack:

```text
DATABASE_URL
REDIS_URL
JWT_SECRET
CORS_ALLOWED_ORIGINS
WS_ALLOWED_ORIGINS
```

## Known Environment Caveats

- Listener-dependent tests may skip when local sockets are unavailable.
- `miniredis`-dependent tests may skip when local sockets are unavailable.
- `TEST_DATABASE_URL`-dependent tests skip when that env is missing.
- `baseline-browser-mapping` is an informational Next.js warning, not a blocker.
- `task sdk-python:typecheck` uses strict mypy when available and compileall fallback when not.
