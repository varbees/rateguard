# Architecture

## Ownership Map

### `apps/gateway/internal/domain/`

- policy presets and normalization
- request-shaping and contract semantics

### `apps/gateway/internal/proxy/`

- proxy orchestration
- rate limiting
- queueing
- circuit breaker wiring
- streaming response handling

### `apps/gateway/internal/websocket/`

- realtime fanout
- replay archive
- Redis Pub/Sub bridge

### `apps/gateway/internal/storage/`

- usage persistence
- webhook persistence
- user lookup and preset persistence

### `apps/dashboard/`

- operator UI
- docs pages
- contract bridge to generated OpenAPI artifacts

## Storage Reality

- `users.plan` and `plan_tier` are storage-only legacy fields.
- Runtime code should use `preset`.
- Do not expose legacy billing vocabulary in live API responses.

## Event Envelope

The canonical realtime envelope is shared across:

- WebSocket
- SSE
- Redis Streams
- webhook relay

Keep the same field names across transports:

- `event_id`
- `event_type`
- `tenant_id`
- `route_id`
- `upstream_id`
- `trace_id`
- `occurred_at`
- `payload`

## Idempotency

- Mutating routes should enforce `Idempotency-Key`.
- Do not add mutating routes without an idempotency plan.

## Auth

- Auth payloads should expose `handle` and `preset` only.
- Refresh token rotation is strict; missing DB state should fail closed.
