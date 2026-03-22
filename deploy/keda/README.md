# KEDA Deployment

This directory contains the autoscaling contract for RateGuard OSS.

Apply the resources with:

```bash
kubectl apply -k deploy/keda
```

What is included:

- `ServiceMonitor` for `/metrics/keda`
- gateway `ScaledObject` driven by queue depth and latency
- analytics worker `ScaledObject` driven by Redis Streams lag

Notes:

- The gateway target is the `rateguard` deployment already present under `apps/gateway/k8s/`.
- The analytics worker target is a separate deployment name reserved for the worker-only runtime cut.
