#!/bin/bash

# Test Rate Limit Discovery Feature
# This script tests the complete rate limit discovery flow

set -e

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
NC='\033[0m' # No Color

# Configuration
BASE_URL="${BASE_URL:-http://localhost:8080}"
API_TOKEN="${API_TOKEN:-}"

echo -e "${GREEN}━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━${NC}"
echo -e "${GREEN}  Rate Limit Discovery Test Suite${NC}"
echo -e "${GREEN}━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━${NC}"
echo ""

# Check if API token is set
if [ -z "$API_TOKEN" ]; then
    echo -e "${RED}❌ API_TOKEN environment variable not set${NC}"
    echo -e "${YELLOW}Usage: API_TOKEN=your_token ./test_rate_limit_discovery.sh${NC}"
    exit 1
fi

# Test 1: Check if backend is running
echo -e "${YELLOW}[Test 1]${NC} Checking backend health..."
if curl -s "$BASE_URL/health" > /dev/null; then
    echo -e "${GREEN}✓${NC} Backend is running"
else
    echo -e "${RED}✗${NC} Backend is not running"
    exit 1
fi

# Test 2: List APIs
echo -e "\n${YELLOW}[Test 2]${NC} Listing API configurations..."
APIS=$(curl -s -H "Authorization: Bearer $API_TOKEN" "$BASE_URL/api/v1/apis")
API_COUNT=$(echo "$APIS" | jq '. | length' 2>/dev/null || echo "0")
echo -e "${GREEN}✓${NC} Found $API_COUNT API configuration(s)"

# Extract first API ID for testing
if [ "$API_COUNT" -gt 0 ]; then
    API_ID=$(echo "$APIS" | jq -r '.[0].id')
    API_NAME=$(echo "$APIS" | jq -r '.[0].name')
    echo -e "  Using API: ${YELLOW}$API_NAME${NC} (ID: $API_ID)"
else
    echo -e "${RED}✗${NC} No APIs found. Please create an API first."
    exit 1
fi

# Test 3: Get rate limit observations
echo -e "\n${YELLOW}[Test 3]${NC} Fetching rate limit observations..."
OBSERVATIONS=$(curl -s -H "Authorization: Bearer $API_TOKEN" \
    "$BASE_URL/api/v1/apis/$API_ID/rate-limit/observations")
OBS_COUNT=$(echo "$OBSERVATIONS" | jq '. | length' 2>/dev/null || echo "0")
echo -e "${GREEN}✓${NC} Found $OBS_COUNT observation(s)"

if [ "$OBS_COUNT" -gt 0 ]; then
    echo -e "  Latest observation:"
    echo "$OBSERVATIONS" | jq '.[0]' | sed 's/^/    /'
fi

# Test 4: Get rate limit suggestions
echo -e "\n${YELLOW}[Test 4]${NC} Fetching rate limit suggestions..."
SUGGESTIONS=$(curl -s -H "Authorization: Bearer $API_TOKEN" \
    "$BASE_URL/api/v1/apis/$API_ID/rate-limit/suggestions")

# Check if suggestion exists
HAS_SUGGESTION=$(echo "$SUGGESTIONS" | jq -r '.suggestion != null' 2>/dev/null || echo "false")

if [ "$HAS_SUGGESTION" = "true" ]; then
    CONFIDENCE=$(echo "$SUGGESTIONS" | jq -r '.suggestion.confidence_score' 2>/dev/null || echo "0")
    echo -e "${GREEN}✓${NC} Suggestions available (Confidence: ${CONFIDENCE}%)"
    echo -e "  Suggestion details:"
    echo "$SUGGESTIONS" | jq '.suggestion | {
        suggested_per_second,
        suggested_per_hour,
        current_per_second,
        confidence_score,
        observation_count,
        recommendation_reason
    }' | sed 's/^/    /'
else
    echo -e "${YELLOW}⚠${NC}  No suggestions available yet"
    echo -e "  ${YELLOW}Note:${NC} Suggestions require at least 3 observations within 30 days"
fi

# Test 5: Check database table
echo -e "\n${YELLOW}[Test 5]${NC} Verifying database table..."
if command -v psql &> /dev/null; then
    DB_CHECK=$(psql -U postgres -d rateguard -tAc \
        "SELECT COUNT(*) FROM rate_limit_observations" 2>/dev/null || echo "0")
    echo -e "${GREEN}✓${NC} Database has $DB_CHECK total observation(s)"
else
    echo -e "${YELLOW}⚠${NC}  psql not available, skipping database check"
fi

# Test 6: Test apply endpoint (dry run check)
if [ "$HAS_SUGGESTION" = "true" ]; then
    echo -e "\n${YELLOW}[Test 6]${NC} Testing apply endpoint (not actually applying)..."
    echo -e "${YELLOW}⚠${NC}  To apply suggestions, run:"
    echo -e "  ${GREEN}curl -X POST -H \"Authorization: Bearer \$API_TOKEN\" \\${NC}"
    echo -e "    ${GREEN}$BASE_URL/api/v1/apis/$API_ID/rate-limit/apply${NC}"
else
    echo -e "\n${YELLOW}[Test 6]${NC} Skipping apply test (no suggestions available)"
fi

# Summary
echo -e "\n${GREEN}━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━${NC}"
echo -e "${GREEN}  Test Summary${NC}"
echo -e "${GREEN}━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━${NC}"
echo -e "Backend Status:    ${GREEN}✓ Running${NC}"
echo -e "APIs Found:        ${GREEN}$API_COUNT${NC}"
echo -e "Observations:      ${GREEN}$OBS_COUNT${NC}"
echo -e "Suggestions:       $([ "$HAS_SUGGESTION" = "true" ] && echo -e "${GREEN}✓ Available${NC}" || echo -e "${YELLOW}⚠ Not yet${NC}")"

if [ "$OBS_COUNT" -eq 0 ]; then
    echo -e "\n${YELLOW}📝 Next Steps:${NC}"
    echo -e "  1. Make requests through the proxy that trigger 429 responses"
    echo -e "  2. Ensure upstream APIs return rate limit headers"
    echo -e "  3. Wait for observations to accumulate (need 3+)"
    echo -e "  4. Run this script again to see suggestions"
fi

echo -e "\n${GREEN}✅ All tests completed!${NC}"
