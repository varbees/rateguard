# Kubernetes Deployment Guide

## Overview

This guide provides step-by-step instructions for deploying RateGuard to Kubernetes with production-ready configuration including resource limits, health checks, and graceful shutdown.

## Prerequisites

- Kubernetes 1.20+
- kubectl configured
- Docker image built and pushed to registry
- PostgreSQL database accessible from cluster
- Redis instance accessible from cluster

## Files Included

- `deployment.yaml` - Main deployment with resource limits and probes
- `service.yaml` - ClusterIP service for internal routing
- `configmap.yaml` - Non-sensitive configuration
- `secrets-template.yaml` - Template for sensitive data (MUST be customized)
- `rbac.yaml` - ServiceAccount and RBAC roles
- `pdb.yaml` - PodDisruptionBudget for high availability

## Deployment Steps

### 1. Create Namespace (Optional)

```bash
kubectl create namespace rateguard
```

### 2. Create Secrets

**IMPORTANT**: Never commit actual secrets to git!

```bash
# Generate JWT secret
JWT_SECRET=$(openssl rand -hex 32)

# Generate encryption key
ENCRYPTION_KEY=$(openssl rand -base64 32)

# Create secret from template
kubectl create secret generic rateguard-secrets \
  --from-literal=db.user=rateguard \
  --from-literal=db.password=YOUR_DB_PASSWORD \
  --from-literal=redis.password="" \
  --from-literal=jwt.secret=$JWT_SECRET \
  --from-literal=encryption.key=$ENCRYPTION_KEY \
  --from-literal=razorpay.key_id="" \
  --from-literal=razorpay.key_secret="" \
  --from-literal=razorpay.webhook_secret="" \
  --from-literal=stripe.secret_key="" \
  --from-literal=stripe.publishable_key="" \
  --from-literal=stripe.webhook_secret="" \
  -n default
```

Or use sealed-secrets for GitOps:

```bash
# Install sealed-secrets controller
kubectl apply -f https://github.com/bitnami-labs/sealed-secrets/releases/download/v0.18.0/controller.yaml

# Seal the secrets
kubeseal -f secrets-template.yaml -w sealed-secrets.yaml

# Apply sealed secrets
kubectl apply -f sealed-secrets.yaml
```

### 3. Create ConfigMap

```bash
kubectl apply -f configmap.yaml
```

### 4. Create RBAC Resources

```bash
kubectl apply -f rbac.yaml
```

### 5. Create Deployment

```bash
# Update image reference in deployment.yaml
sed -i 's|rateguard:2.0.0|your-registry/rateguard:2.0.0|g' deployment.yaml

# Apply deployment
kubectl apply -f deployment.yaml
```

### 6. Create Service

```bash
kubectl apply -f service.yaml
```

### 7. Create PodDisruptionBudget

```bash
kubectl apply -f pdb.yaml
```

### 8. Verify Deployment

```bash
# Check deployment status
kubectl get deployment rateguard
kubectl get pods -l app=rateguard

# Check pod logs
kubectl logs -f deployment/rateguard

# Check service
kubectl get service rateguard

# Port forward for testing
kubectl port-forward service/rateguard 8008:80
```

## Health Checks

The deployment includes three types of health checks:

### Liveness Probe

- **Endpoint**: `/health`
- **Purpose**: Checks if the service is running
- **Failure Action**: Pod restart
- **Schedule**: Every 10 seconds after 10 second delay

### Readiness Probe

- **Endpoint**: `/ready`
- **Purpose**: Checks if service is ready to accept traffic
- **Checks**:
  - Database connectivity
  - Redis connectivity
  - Service initialization
- **Failure Action**: Remove from load balancer
- **Schedule**: Every 5 seconds after 5 second delay

### Startup Probe

- **Endpoint**: `/health`
- **Purpose**: Gives service time to start up
- **Failure Action**: Pod restart if not ready after 150 seconds
- **Schedule**: Every 5 seconds for up to 30 attempts

## Resource Limits

The deployment specifies resource requests and limits:

```yaml
resources:
  requests:
    memory: "256Mi"
    cpu: "250m"
  limits:
    memory: "512Mi"
    cpu: "500m"
```

### Tuning for Your Environment

**Light Load** (< 100 req/s):

```yaml
requests:
  memory: "128Mi"
  cpu: "100m"
limits:
  memory: "256Mi"
  cpu: "250m"
```

**Medium Load** (100-1000 req/s):

```yaml
requests:
  memory: "256Mi"
  cpu: "250m"
limits:
  memory: "512Mi"
  cpu: "500m"
```

**Heavy Load** (> 1000 req/s):

```yaml
requests:
  memory: "512Mi"
  cpu: "500m"
limits:
  memory: "1Gi"
  cpu: "1000m"
```

## Graceful Shutdown

The deployment configures graceful shutdown:

1. **PreStop Hook**: Waits 15 seconds before terminating
2. **Termination Grace Period**: 45 seconds total
3. **Server Shutdown**: Stops accepting new requests
4. **Request Draining**: Waits for in-flight requests to complete
5. **Connection Cleanup**: Closes database and Redis connections

## Scaling

### Horizontal Scaling

```bash
# Scale to 5 replicas
kubectl scale deployment rateguard --replicas=5

# Auto-scale based on CPU
kubectl autoscale deployment rateguard --min=3 --max=10 --cpu-percent=70
```

### Pod Disruption Budget

The deployment includes a PodDisruptionBudget that ensures at least 2 pods are always running during voluntary disruptions (node maintenance, etc.).

## Monitoring

### Prometheus Metrics

The deployment is annotated for Prometheus scraping:

```yaml
annotations:
  prometheus.io/scrape: "true"
  prometheus.io/port: "8008"
  prometheus.io/path: "/metrics"
```

### Log Aggregation

Logs are output in JSON format for easy parsing:

```bash
# View structured logs
kubectl logs -f deployment/rateguard | jq .

# Filter by log level
kubectl logs -f deployment/rateguard | jq 'select(.level=="error")'

# Filter by request ID
kubectl logs -f deployment/rateguard | jq 'select(.request_id=="550e8400-e29b-41d4-a716-446655440000")'
```

## Troubleshooting

### Pod Not Starting

```bash
# Check pod events
kubectl describe pod <pod-name>

# Check logs
kubectl logs <pod-name>

# Check resource availability
kubectl top nodes
kubectl top pods
```

### Readiness Probe Failing

```bash
# Test readiness endpoint
kubectl exec -it <pod-name> -- curl http://localhost:8008/ready

# Check database connectivity
kubectl exec -it <pod-name> -- env | grep DB_

# Check Redis connectivity
kubectl exec -it <pod-name> -- env | grep REDIS_
```

### High Memory Usage

```bash
# Check memory usage
kubectl top pods -l app=rateguard

# Adjust limits in deployment.yaml
# Redeploy with new limits
kubectl apply -f deployment.yaml
```

## Production Checklist

- [ ] Secrets created and secured (use sealed-secrets or external secret manager)
- [ ] Database credentials configured
- [ ] Redis credentials configured
- [ ] JWT_SECRET generated and set
- [ ] ENCRYPTION_KEY generated and set
- [ ] Image registry configured
- [ ] Resource limits tuned for your load
- [ ] Monitoring and alerting configured
- [ ] Log aggregation configured
- [ ] Backup strategy for database
- [ ] Disaster recovery plan documented
- [ ] Load testing completed
- [ ] Security scanning completed

## Rollback

```bash
# View rollout history
kubectl rollout history deployment/rateguard

# Rollback to previous version
kubectl rollout undo deployment/rateguard

# Rollback to specific revision
kubectl rollout undo deployment/rateguard --to-revision=2
```

## Cleanup

```bash
# Delete all resources
kubectl delete -f deployment.yaml
kubectl delete -f service.yaml
kubectl delete -f configmap.yaml
kubectl delete -f rbac.yaml
kubectl delete -f pdb.yaml
kubectl delete secret rateguard-secrets

# Delete namespace
kubectl delete namespace rateguard
```

## Additional Resources

- [Kubernetes Documentation](https://kubernetes.io/docs/)
- [Pod Disruption Budgets](https://kubernetes.io/docs/tasks/run-application/configure-pdb/)
- [Resource Requests and Limits](https://kubernetes.io/docs/concepts/configuration/manage-resources-containers/)
- [Liveness and Readiness Probes](https://kubernetes.io/docs/tasks/configure-pod-container/configure-liveness-readiness-startup-probes/)
