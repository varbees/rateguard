# RateGuard Docker Stack

This directory owns the active local and staging container workflow for RateGuard.

## Quick Start

```bash
task dev
```

That starts the backend runtime and infrastructure services:

- PostgreSQL on `localhost:5432`
- Redis on `localhost:6379`
- RateGuard gateway on `localhost:8008`
- Prometheus on `localhost:9090`
- Grafana on `localhost:3300`
- OTEL collector on `localhost:4317`

To run the dashboard locally, use:

```bash
task ui:dev
```

That runs the dashboard against the local backend on `http://localhost:3003`.

## Staging Stack

```bash
task staging
```

This uses `compose.staging.yml` for production-like runtime defaults while keeping the same local ports.

## Environment Overrides

Copy the example file and edit it:

```bash
cp deploy/docker/.env.example deploy/docker/.env
```

The compose files read `deploy/docker/.env` automatically when you run the tasks from the repo root.

## Useful Tasks

- `task dev`
- `task dev:down`
- `task dev:logs`
- `task staging`
- `task staging:down`
- `task staging:logs`
