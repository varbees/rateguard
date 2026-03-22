# RateGuard HTTP Middleware Demo

This example shows a tiny Go `net/http` app wrapped with RateGuard middleware.
It is the fastest way to see the middleware-first product model without booting the full Docker stack.

## What it demonstrates

- in-process request limiting
- preset-driven policy resolution
- token budget configuration
- optional event emission to a control-plane endpoint

## Run it

From the repo root:

```bash
go run ./examples/http-middleware-demo
```

Then open:

- `GET http://localhost:8080/healthz`
- `GET http://localhost:8080/hello`

## Optional environment variables

- `ADDR` - listen address, default `:8080`
- `RATEGUARD_PRESET` - preset name, default `standard`
- `RATEGUARD_REQUESTS_PER_SECOND` - request rate limit, default `5`
- `RATEGUARD_BURST` - burst limit, default `10`
- `RATEGUARD_TOKEN_BUDGET_PER_HOUR` - token budget, default `2000`
- `RATEGUARD_EVENT_ENDPOINT` - optional event emitter endpoint

## Notes

This demo works without any external services.
If you point `RATEGUARD_EVENT_ENDPOINT` at a compatible event collector, the SDK will emit structured request events as well.
The example is included in `go.work`, so `go run ./examples/http-middleware-demo` works from the repo root.
