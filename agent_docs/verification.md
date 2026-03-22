# Verification

## Release Gates

These are the primary gates that should stay green before a launch batch:

```bash
task test
task ui:typecheck
task ui:build
task smoke
```

## Narrower Checks

```bash
go test ./apps/gateway/internal/ratelimiter ./apps/gateway/internal/proxy ./apps/gateway/internal/websocket
task openapi:generate
task sdk-node:test
task sdk-node:build
task sdk-node:typecheck
task sdk-python:test
task sdk-python:typecheck
```

## Expected Skips

- listener-dependent Go tests may skip when local sockets are unavailable.
- `miniredis` tests may skip when local sockets are unavailable.
- `TEST_DATABASE_URL`-dependent tests may skip when the env is absent.

## Known Tooling Reality

- `task sdk-python:typecheck` uses strict mypy when available.
- In this repo environment, the Python typecheck task falls back to compileall when mypy is missing.
- The fallback is a toolchain workaround, not a replacement for real strict typechecking in a normal dev environment.

## Smoke Test Rule

`task smoke` requires a booted local stack. If the sandbox cannot bind ports,
separate transport failures from code failures.
