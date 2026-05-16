# RateGuard Middleware Agent Contract

This repo is SDK-only on `main`.

The previous full-stack product lives on `legacy/full-stack` and should stay
archived unless the user explicitly asks to inspect or restore it.

## Scope

| Path | Purpose |
| --- | --- |
| `packages/sdk-go/` | Go `net/http` and chi middleware |
| `packages/sdk-node/` | Node middleware/adapters for Express, Fastify, Hono, Next |
| `packages/sdk-python/` | Python ASGI, WSGI, decorator, and budget helpers |

Do not reintroduce the gateway, dashboard, proxy, billing, OpenAPI client,
Docker/KEDA deploy stack, marketplace, or SaaS docs on `main`.

## Rules

1. Keep the repo boring and SDK-focused.
2. Preserve parity across Go, Node, and Python when behavior is shared.
3. If parity is intentionally broken, document it honestly in the affected SDK.
4. Keep commits coherent and authored as `varbees`.
5. Prefer tests inside the affected SDK package over repo-wide scaffolding.

## Verification

```bash
cd packages/sdk-go && CC=/usr/bin/gcc GOWORK=off go test ./...
cd packages/sdk-node && bun run test
cd packages/sdk-python && python3 -m pytest -q
```

## Commit Format

```text
type(scope): description
```

Use scopes `sdk-go`, `sdk-node`, `sdk-python`, `repo`, or `docs`.
