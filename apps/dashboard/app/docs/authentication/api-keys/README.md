# API Keys & Authentication Documentation

This directory contains the Next.js docs page for RateGuard API key and bearer-token authentication.

It documents the current dashboard and gateway auth surface:

- API keys for server-to-server access
- bearer tokens for development and local tooling
- key rotation and revocation workflows
- current request/response examples from `lib/docs/code-examples.ts`

## File Structure

```
app/docs/authentication/api-keys/
├── page.tsx
└── README.md

components/docs/
├── ApiKeyDemo.tsx
├── CallOut.tsx
├── CodeTabs.tsx
├── CopyButton.tsx
└── index.ts

lib/docs/
└── code-examples.ts
```

## Accessing the Page

Navigate to: `/docs/authentication/api-keys`

## Notes

- This is documentation for the current dashboard and gateway auth contract, not a separate backend package.
- Update `lib/docs/code-examples.ts` when request/response shapes change.
- Update `page.tsx` when the docs copy changes.
- The current auth flow is preset-aware and uses the backend gateway endpoints exposed in the generated OpenAPI spec.
