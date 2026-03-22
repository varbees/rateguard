# Kubernetes Quick Start Guide

## Health Check Endpoints

```bash
# Liveness Probe (always returns 200 if running)
curl http://localhost:8008/health

# Readiness Probe (checks DB & Redis)
curl http://localhost:8008/ready
```

---

## Kubernetes Deployment

### Basic Deployment

```yaml
apiVersion: apps/v1
kind: Deployment
metadata:
  name: rateguard
spec:
  replicas: 3
  selector:
    matchLabels:
      app: rateguard
  template:
    metadata:
      labels:
        app: rateguard
    spec:
      containers:
        - name: rateguard
          image: rateguard:latest
          ports:
            - containerPort: 8008

          livenessProbe:
            httpGet:
              path: /health
              port: 8008
            initialDelaySeconds: 10
            periodSeconds: 10
            failureThreshold: 3

          readinessProbe:
            httpGet:
              path: /ready
              port: 8008
            initialDelaySeconds: 5
            periodSeconds: 5
            failureThreshold: 2

          lifecycle:
            preStop:
              exec:
                command: ["/bin/sh", "-c", "sleep 5"]

          env:
            - name: RATELIMIT_BACKEND
              value: "redis"
            - name: REDIS_HOST
              value: "redis-service"
            - name: DATABASE_HOST
              valueFrom:
                secretKeyRef:
                  name: db-secret
                  key: host
```

---

## Test Commands

```bash
# Build
go build -o rateguard ./cmd/main.go

# Run locally
./rateguard

# Test health endpoints
./test-health-endpoints.sh

# Test graceful shutdown
# Terminal 1: Start server
./rateguard

# Terminal 2: Send requests
for i in {1..10}; do curl -X POST http://localhost:8008/api/v1/proxy/test-api & done

# Terminal 1: Press Ctrl+C to trigger graceful shutdown
```

---

## Configuration

```yaml
# config/config.yaml
server:
  shutdown_timeout_sec: 30

rateguard:
  ratelimit_backend: "redis" # Enable distributed rate limiting
```

---

## Expected Behavior

### Healthy State

- `/health` → 200 OK
- `/ready` → 200 OK
- Pod status: Ready

### Database Down

- `/health` → 200 OK (still alive)
- `/ready` → 503 Service Unavailable
- Pod status: Not Ready
- Traffic stops → No requests fail

### Shutdown

```
1. SIGTERM received
2. Stop accepting new requests
3. Drain in-flight requests (30s max)
4. Close connections
5. Exit cleanly
```

---

## Quick Reference

| Endpoint  | Purpose   | Success | Failure         |
| --------- | --------- | ------- | --------------- |
| `/health` | Liveness  | 200 OK  | No response     |
| `/ready`  | Readiness | 200 OK  | 503 Unavailable |

| Signal  | Action                          |
| ------- | ------------------------------- |
| SIGTERM | Graceful shutdown (30s timeout) |
| SIGINT  | Graceful shutdown (Ctrl+C)      |
| SIGKILL | Force kill (no cleanup)         |

---

## Distributed Rate Limiting Status

✅ **Already Implemented**

- Redis-backed distributed rate limiting
- Multi-tier limits (second/hour/day/month)
- Automatic fallback to in-memory
- Horizontal scaling ready

See: `DISTRIBUTED_RATE_LIMITING_SUMMARY.md`
