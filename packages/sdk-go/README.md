# RateGuard Go SDK

RateGuard's Go SDK is an in-process middleware package for `net/http` and chi.

Standalone mode is the default:

- no Redis is required for the default preset
- no external service is required for local enforcement
- the SDK still emits the same request events when you do wire up a backend
- if your app already uses chi, `go get github.com/rateguard/sdk-go` is the only new RateGuard dependency

## Install

```bash
go get github.com/rateguard/sdk-go
```

## Quick Start

```go
package main

import (
	"net/http"

	"github.com/go-chi/chi/v5"
	rateguard "github.com/rateguard/sdk-go"
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
- `Retry-After` on 429 responses

GCRA in one sentence:

- It is a rate limiter that refills at a constant rate instead of resetting all at once every minute.
