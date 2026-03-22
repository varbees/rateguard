# RateGuard Monitoring Helpers

These scripts are for manual cron or systemd-style checks.
The Docker dev stack already runs Prometheus and Grafana; use this directory when you want lightweight shell-based alerts outside the compose workflow.

## Quick Setup

```bash
chmod +x monitoring/*.sh
./monitoring/check-health.sh
./monitoring/check-stats.sh
```

## Scripts

### `check-health.sh`

Checks the backend health endpoint and alerts if the service is unhealthy.

### `check-stats.sh`

Checks `/api/v1/stats` and alerts when the success rate drops below configured thresholds.

## Configuration

The scripts use these environment variables:

| Variable | Default | Description |
| --- | --- | --- |
| `AGG_SERVICE_URL` | `http://localhost:8008` | Backend URL |
| `AGG_WARNING_THRESHOLD` | `80` | Warning threshold for success rate |
| `AGG_CRITICAL_THRESHOLD` | `75` | Critical threshold for success rate |
| `AGG_ALERT_EMAIL` | unset | Optional email alert destination |
| `AGG_SLACK_WEBHOOK` | unset | Optional Slack webhook |

## Cron Example

Copy from:

```bash
cat monitoring/crontab.example
```

The example uses the backend health endpoint and the `/api/v1/stats` payload that the current gateway exposes.
