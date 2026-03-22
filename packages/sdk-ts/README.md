# RateGuard TypeScript SDK

This package is generated from the live RateGuard OpenAPI manifest.

Use it as a generated client surface for Node and browser tooling, not a middleware SDK.
Use `packages/sdk-go` for in-process Go integration.

- generate artifacts with `task openapi:generate`
- import the root entrypoint from `./index.ts`
- the generated client stays in sync with `packages/openapi/openapi.json`
