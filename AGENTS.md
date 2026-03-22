# RateGuard Agent Contract

Source of truth: `docs/RATEGUARD_MIDDLEWARE_FIRST_EXECUTION_PLAN.md`
If code and plan disagree, investigate and update the plan in the same workstream.

## Codebase Map

| Path | Purpose |
|---|---|
| `apps/gateway/` | Go control plane, proxy, realtime, and API runtime |
| `apps/dashboard/` | Next.js operator UI |
| `packages/sdk-go/` | Go in-process middleware SDK |
| `packages/sdk-node/` | Node.js in-process middleware SDK |
| `packages/sdk-python/` | Python in-process middleware SDK |
| `packages/sdk-ts/` | Generated TypeScript control-plane client |
| `packages/openapi/` | OpenAPI source and generated artifacts |
| `deploy/docker/` | Local and staging Docker Compose stacks |
| `deploy/keda/` | Autoscaling manifests |
| `examples/` | Runnable demos |

## The 5 Rules

1. Read before writing. Inspect the repo layout and relevant files first.
2. Make the smallest correct change. No drive-by refactors.
3. Keep the source doc in sync after every meaningful milestone.
4. Preserve middleware-first architecture and SDK parity.
5. Commit in coherent batches. Keep code, docs, and cleanup separate when sensible.

## Skill Selection

Use installed skills when they match the task. Say why you are using them.
Prefer `context-map` before large changes, `get-shit-done` for structured execution,
and domain skills when the task matches.

## Deep Docs

| File | Read when... |
|---|---|
| `agent_docs/stack.md` | You need the repo map, task runner, entrypoints, or environment basics |
| `agent_docs/product.md` | You need product truth, copy rules, or launch positioning |
| `agent_docs/algorithms.md` | You are changing rate limiting, queues, breakers, or token budgets |
| `agent_docs/sdk-contracts.md` | You are changing Go, Node, Python, or generated SDK behavior |
| `agent_docs/verification.md` | You are running tests, builds, typechecks, smoke, or CI wiring |
| `agent_docs/architecture.md` | You need domain boundaries, storage ownership, or event contracts |
| `agent_docs/post-launch.md` | You are looking at deferred or explicitly out-of-scope work |

## Commit Format

```text
type(scope): description
```

Types: `feat` `fix` `refactor` `test` `docs` `chore` `perf`
Scopes: `gateway` `dashboard` `sdk-go` `sdk-node` `sdk-python` `deploy` `docs`

One commit per logical unit. Code, docs, and cleanup should stay reviewable.

## Handoff Format

After every session, state:
- What shipped
- What was verified
- What is still pending
- Any environment-blocked verification
