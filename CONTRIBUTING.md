# Contributing to RateGuard

Thanks for helping improve RateGuard.

## Before you start

- Read [README.md](./README.md) and [docs/RATEGUARD_MIDDLEWARE_FIRST_EXECUTION_PLAN.md](./docs/RATEGUARD_MIDDLEWARE_FIRST_EXECUTION_PLAN.md)
- Prefer small, focused changes
- Keep the middleware-first product direction intact
- Do not introduce schema migrations unless a change explicitly requires one

## Local checks

From the repo root:

```bash
task test
task ui:typecheck
task openapi:generate
```

For end-to-end validation:

```bash
task dev
task smoke
```

## Code review expectations

- Preserve public contracts where possible
- Add tests for behavior changes
- Update the execution plan when the repo state changes materially
- Keep docs honest about what is implemented versus planned

## Need help?

Open a GitHub issue with:

- what you tried
- what you expected
- what happened instead
- any logs, screenshots, or repro steps
