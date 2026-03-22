# Type Safety in Dashboard

## Problem

The generated TypeScript SDK (`packages/sdk-ts/generated/rateguard.ts`) adds `[key: string]: unknown` to every interface. This catch-all index signature causes TypeScript's strict mode to treat all properties as `unknown` when types are intersected, leading to implicit `any` errors during Docker builds.

## Root Cause

The OpenAPI generator in `apps/gateway/internal/openapi/spec.go` hardcodes this index signature into every TypeScript interface definition.

## Solution

We use a `KnownProps<T>` utility type to strip the index signature before intersecting with concrete types:

```typescript
type KnownProps<T> = {
  [K in keyof T as string extends K ? never : K]: T[K];
};
```

This utility is applied in TWO layers:

1. **`apps/dashboard/lib/contracts/rateguard-sdk.ts`** - First layer of type definitions
2. **`apps/dashboard/lib/api.ts`** - Second layer that re-exports from contracts

## When Adding New Types

When adding new API endpoints that return data used in components:

1. Add the type definition to `contracts/rateguard-sdk.ts` wrapped with `KnownProps`:
   ```typescript
   export type MyNewType = KnownProps<GeneratedMyNewType> & {
     // your concrete fields
   };
   ```

2. If re-exporting in `api.ts`, also wrap with `KnownProps`:
   ```typescript
   export type MyNewType = KnownProps<ContractMyNewType> & {
     // additional fields
   };
   ```

3. For `.map()` callbacks on arrays from API data, add explicit types:
   ```typescript
   data.items.map((item: { id: string; name: string }) => ...)
   ```

4. For `Object.entries()` on data from API responses, cast the tuple and convert values to strings for rendering:
   ```typescript
   Object.entries(data.headers).map(([key, value]: [string, any]) => (
     <span>{String(value)}</span>
   ))
   ```

## Verification

Run `task ui:typecheck` locally before `task dev` to catch type errors early. The Docker build uses Next.js's stricter type checker which catches issues that `tsc --noEmit` might miss.

## Future Fix

The proper solution is to modify the OpenAPI generator to NOT add `[key: string]: unknown` to generated interfaces. This requires changes to `apps/gateway/internal/openapi/spec.go`.
