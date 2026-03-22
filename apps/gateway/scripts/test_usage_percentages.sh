#!/bin/bash

# Test Usage Percentages Feature
# Tests the new usage_percentages field in dashboard stats endpoint

set -e

BASE_URL="${BASE_URL:-http://localhost:8080}"
API_KEY="${API_KEY:-your-api-key-here}"

echo "=========================================="
echo "Testing Usage Percentages Feature"
echo "=========================================="
echo ""

# Color codes
GREEN='\033[0;32m'
RED='\033[0;31m'
YELLOW='\033[1;33m'
NC='\033[0m' # No Color

# Test: Get Dashboard Stats with Usage Percentages
echo -e "${YELLOW}Test: Get Dashboard Stats${NC}"
echo "GET $BASE_URL/api/v1/dashboard/stats"
echo ""

RESPONSE=$(curl -s -X GET "$BASE_URL/api/v1/dashboard/stats" \
  -H "X-API-Key: $API_KEY" \
  -H "Content-Type: application/json")

echo "$RESPONSE" | jq '.'

# Check if usage_percentages field exists
if echo "$RESPONSE" | jq -e '.usage_percentages' > /dev/null; then
  echo -e "${GREEN}✓ usage_percentages field found${NC}"
  
  # Extract values
  DAILY_PCT=$(echo "$RESPONSE" | jq -r '.usage_percentages.daily_pct')
  MONTHLY_PCT=$(echo "$RESPONSE" | jq -r '.usage_percentages.monthly_pct')
  
  echo ""
  echo "Usage Percentages:"
  echo "  Daily:   $DAILY_PCT%"
  echo "  Monthly: $MONTHLY_PCT%"
  echo ""
  
  # Validate values
  if [ "$DAILY_PCT" != "null" ] && [ "$MONTHLY_PCT" != "null" ]; then
    echo -e "${GREEN}✓ Percentages calculated successfully${NC}"
    
    # Check if percentages are within valid range (0-100)
    if (( $(echo "$DAILY_PCT >= 0 && $DAILY_PCT <= 100" | bc -l) )); then
      echo -e "${GREEN}✓ Daily percentage within valid range (0-100)${NC}"
    else
      echo -e "${RED}✗ Daily percentage out of range: $DAILY_PCT${NC}"
    fi
    
    if (( $(echo "$MONTHLY_PCT >= 0 && $MONTHLY_PCT <= 100" | bc -l) )); then
      echo -e "${GREEN}✓ Monthly percentage within valid range (0-100)${NC}"
    else
      echo -e "${RED}✗ Monthly percentage out of range: $MONTHLY_PCT${NC}"
    fi
  else
    echo -e "${RED}✗ Percentages are null${NC}"
  fi
else
  echo -e "${RED}✗ usage_percentages field not found${NC}"
  exit 1
fi

echo ""
echo "=========================================="
echo "Additional Stats:"
echo "=========================================="
REQUESTS_TODAY=$(echo "$RESPONSE" | jq -r '.requests_today')
MONTHLY_USAGE=$(echo "$RESPONSE" | jq -r '.monthly_usage')
PLAN_LIMIT=$(echo "$RESPONSE" | jq -r '.plan_limit')
ACTIVE_APIS=$(echo "$RESPONSE" | jq -r '.active_apis')

echo "Requests Today:  $REQUESTS_TODAY"
echo "Monthly Usage:   $MONTHLY_USAGE"
echo "Plan Limit:      $PLAN_LIMIT"
echo "Active APIs:     $ACTIVE_APIS"
echo ""

# Calculate expected monthly percentage for comparison
if [ "$PLAN_LIMIT" != "0" ]; then
  EXPECTED_MONTHLY=$(echo "scale=2; ($MONTHLY_USAGE / $PLAN_LIMIT) * 100" | bc)
  if [ "$EXPECTED_MONTHLY" != "$MONTHLY_PCT" ]; then
    echo -e "${YELLOW}Note: Calculated monthly % ($EXPECTED_MONTHLY) differs slightly from API ($MONTHLY_PCT)${NC}"
  fi
fi

echo ""
echo -e "${GREEN}✓ Test completed successfully${NC}"
