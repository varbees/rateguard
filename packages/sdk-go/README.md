# RateGuard Go SDK

RateGuard's Go SDK is an in-process middleware package for `net/http` and chi.

Standalone mode is the default:

- rate limiting, token budgets, and circuit breaking run locally
- no Redis is required for the default preset
- no external service is required for local enforcement
- request events can be delivered to an HTTP endpoint when configured
- if your app already uses chi, this is the only new RateGuard dependency

## Install

```bash
go get github.com/varbees/rateguard/packages/sdk-go
```

## Quick Start

```go
package main

import (
	"net/http"

	"github.com/go-chi/chi/v5"
	rateguard "github.com/varbees/rateguard/packages/sdk-go"
)

func main() {
	rg := rateguard.New(rateguard.Config{Preset: "standard"})

	r := chi.NewRouter()
	r.Use(rg.Middleware())
	r.Get("/hello", func(w http.ResponseWriter, _ *http.Request) {
		w.Write([]byte("hello"))
	})

	http.ListenAndServe(":8080", r)
}
```

Use `rg.Middleware()` or `rg.ChiMiddleware()` to protect the whole handler tree. Every response gets the standard headers:

- `X-RateGuard-Preset`
- `X-RateGuard-Limit`
- `X-RateGuard-Burst`
- `X-RateGuard-Remaining`
- `Retry-After` on 429 and circuit-open responses

Rate limiting modes:

- local mode uses an in-process token bucket per key
- Redis mode uses GCRA for distributed enforcement
