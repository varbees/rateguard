#!/bin/bash

# Stats Monitoring Script
# Monitors success rate and sends alerts if it drops below threshold

# Configuration
SERVICE_URL="${AGG_SERVICE_URL:-http://localhost:8008}"
WARNING_THRESHOLD="${AGG_WARNING_THRESHOLD:-80}"
CRITICAL_THRESHOLD="${AGG_CRITICAL_THRESHOLD:-75}"
ALERT_EMAIL="${AGG_ALERT_EMAIL:-}"
SLACK_WEBHOOK="${AGG_SLACK_WEBHOOK:-}"

# Fetch stats
STATS=$(curl -sf "${SERVICE_URL}/api/v1/stats" 2>/dev/null)

if [ -z "$STATS" ]; then
    echo "⚠️  Warning: Could not fetch stats from service"
    exit 1
fi

# Parse stats
SUCCESSFUL=$(echo "$STATS" | jq -r '.successful_fetch // 0')
FAILED=$(echo "$STATS" | jq -r '.failed_fetch // 0')
TOTAL=$((SUCCESSFUL + FAILED))

if [ "$TOTAL" -eq 0 ]; then
    echo "ℹ️  No requests processed yet"
    exit 0
fi

# Calculate success rate
SUCCESS_RATE=$(echo "scale=2; ($SUCCESSFUL / $TOTAL) * 100" | bc)
SUCCESS_RATE_INT=$(echo "$SUCCESS_RATE" | cut -d. -f1)

echo "📊 Success Rate: ${SUCCESS_RATE}% ($SUCCESSFUL/$TOTAL successful)"

# Check thresholds
if [ "$SUCCESS_RATE_INT" -lt "$CRITICAL_THRESHOLD" ]; then
    LEVEL="🔴 CRITICAL"
    MESSAGE="$LEVEL: Success rate dropped to ${SUCCESS_RATE}% (threshold: ${CRITICAL_THRESHOLD}%) at $(date)"
    
    echo "$MESSAGE"
    
    # Send alerts
    if [ -n "$ALERT_EMAIL" ]; then
        echo "$MESSAGE" | mail -s "Aggregator Critical Alert" "$ALERT_EMAIL"
    fi
    
    if [ -n "$SLACK_WEBHOOK" ]; then
        curl -X POST "$SLACK_WEBHOOK" \
            -H 'Content-Type: application/json' \
            -d "{\"text\": \"$MESSAGE\"}" \
            2>/dev/null
    fi
    
    exit 2
    
elif [ "$SUCCESS_RATE_INT" -lt "$WARNING_THRESHOLD" ]; then
    LEVEL="⚠️  WARNING"
    MESSAGE="$LEVEL: Success rate at ${SUCCESS_RATE}% (threshold: ${WARNING_THRESHOLD}%) at $(date)"
    
    echo "$MESSAGE"
    
    # Send alerts
    if [ -n "$ALERT_EMAIL" ]; then
        echo "$MESSAGE" | mail -s "Aggregator Warning Alert" "$ALERT_EMAIL"
    fi
    
    if [ -n "$SLACK_WEBHOOK" ]; then
        curl -X POST "$SLACK_WEBHOOK" \
            -H 'Content-Type: application/json' \
            -d "{\"text\": \"$MESSAGE\"}" \
            2>/dev/null
    fi
    
    exit 1
else
    echo "✅ Success rate is healthy (${SUCCESS_RATE}%)"
    exit 0
fi
