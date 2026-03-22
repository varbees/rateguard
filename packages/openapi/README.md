# RateGuard OpenAPI Artifacts

This directory contains the generated live OpenAPI document for RateGuard OSS.

- `openapi.json` is generated from the backend manifest in `internal/openapi`
- `task openapi:generate` refreshes the committed OpenAPI and TypeScript client artifacts

The backend serves the same document live at `/api/v1/openapi.json`.
