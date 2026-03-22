#!/bin/bash

# Health Check Monitoring Script
# Checks if the aggregator service is healthy and sends alerts if not

# Configuration
SERVICE_URL="${AGG_SERVICE_URL:-http://localhost:8008}"
ALERT_EMAIL="${AGG_ALERT_EMAIL:-}"
SLACK_WEBHOOK="${AGG_SLACK_WEBHOOK:-}"

# Check health endpoint
STATUS=$(curl -sf "${SERVICE_URL}/health" | jq -r '.status' 2>/dev/null)

if [ "$STATUS" != "healthy" ]; then
    MESSAGE="🔴 ALERT: Aggregator service is UNHEALTHY at $(date)"
    
    echo "$MESSAGE"
    
    # Send email alert if configured
    if [ -n "$ALERT_EMAIL" ]; then
        echo "$MESSAGE" | mail -s "Aggregator Health Alert" "$ALERT_EMAIL"
    fi
    
    # Send Slack alert if configured
    if [ -n "$SLACK_WEBHOOK" ]; then
        curl -X POST "$SLACK_WEBHOOK" \
            -H 'Content-Type: application/json' \
            -d "{\"text\": \"$MESSAGE\"}" \
            2>/dev/null
    fi
    
    exit 1
else
    echo "✅ Service is healthy (checked at $(date))"
    exit 0
fi
