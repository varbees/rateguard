# RateGuard Middleware

RateGuard is a small SDK-only middleware repo for services that need local
traffic protection inside their application runtime.

It provides:

- rate limiting
- token budgets for LLM-heavy paths
- circuit breakers
- request events
- OpenTelemetry attributes where supported

## Packages

| Package | Path | Status |
| --- | --- | --- |
| Go SDK | `packages/sdk-go` | `net/http` and chi middleware |
| Node SDK | `packages/sdk-node` | Express, Fastify, Hono, and Next route handlers |
| Python SDK | `packages/sdk-python` | ASGI, WSGI, decorators, and budget helpers |

## Go

```bash
go get github.com/varbees/rateguard/packages/sdk-go
```

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
	r.Get("/health", func(w http.ResponseWriter, _ *http.Request) {
		w.Write([]byte("ok"))
	})

	http.ListenAndServe(":8080", r)
}
```

## Node

```bash
npm install @varbees/rateguard-node
```

```ts
import express from 'express';
import { RateGuard } from '@varbees/rateguard-node';

const app = express();
const rg = new RateGuard({ preset: 'standard' });

app.use(rg.middleware());
app.get('/health', (_req, res) => res.json({ ok: true }));

app.listen(3000);
```

## Python

```bash
pip install rateguard
```

```python
from fastapi import FastAPI, Request
from rateguard import RateGuard

app = FastAPI()
rg = RateGuard(preset="standard")
app.add_middleware(rg.asgi_middleware)


@app.get("/health")
async def health(_: Request):
    return {"ok": True}
```

## Verification

Run the SDKs independently:

```bash
cd packages/sdk-go
CC=/usr/bin/gcc GOWORK=off go test ./...
```

```bash
cd packages/sdk-node
bun install
bun run test
```

```bash
cd packages/sdk-python
python3 -m pip install -e '.[dev]'
python3 -m pytest -q
```

## License

MIT
