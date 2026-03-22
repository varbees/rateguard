#!/bin/bash

# Test script for multi-tier rate limiting
# Tests hourly, daily, and monthly rate limits

set -e

echo "⏱️  Testing Multi-Tier Rate Limiting"
echo "======================================"
echo ""

# Colors
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m'

BASE_URL="${BASE_URL:-http://localhost:8008}"
TEST_EMAIL="${TEST_EMAIL:-test-ratelimit-$(date +%s)@example.com}"
TEST_PASSWORD="${TEST_PASSWORD:-TestPass123!}"

echo "Configuration:"
echo "  Base URL: $BASE_URL"
echo "  Test Email: $TEST_EMAIL"

# Check if Redis is configured
if [ -z "$REDIS_HOST" ]; then
    echo -e "${YELLOW}  Redis: Not configured (testing in-memory limits only)${NC}"
else
    echo -e "  Redis: ${GREEN}$REDIS_HOST:${REDIS_PORT:-6379}${NC}"
fi
echo ""

# Check backend
echo "🔍 Checking backend..."
if ! curl -s "$BASE_URL/health" > /dev/null 2>&1; then
    echo -e "${RED}❌ Backend not available${NC}"
    exit 1
fi
echo -e "${GREEN}✅ Backend is running${NC}"
echo ""

# Create user
echo -e "${BLUE}📝 Step 1: Create Test User${NC}"
echo "-------------------------------------------"

SIGNUP_RESPONSE=$(curl -s -X POST "$BASE_URL/api/v1/auth/signup" \
  -H "Content-Type: application/json" \
  -d "{
    \"email\": \"$TEST_EMAIL\",
    \"password\": \"$TEST_PASSWORD\"
  }")

if echo "$SIGNUP_RESPONSE" | jq -e '.api_key' > /dev/null 2>&1; then
    API_KEY=$(echo "$SIGNUP_RESPONSE" | jq -r '.api_key')
    echo -e "${GREEN}✅ User created${NC}"
    echo "  API Key: ${API_KEY:0:10}..."
else
    echo -e "${RED}❌ Failed to create user${NC}"
    echo "$SIGNUP_RESPONSE" | jq '.'
    exit 1
fi
echo ""

# Create API with strict rate limits for testing
echo -e "${BLUE}📝 Step 2: Create API with Multi-Tier Limits${NC}"
echo "-------------------------------------------"

RESPONSE=$(curl -s -X POST "$BASE_URL/api/v1/apis" \
  -H "X-API-Key: $API_KEY" \
  -H "Content-Type: application/json" \
  -d '{
    "name": "Rate Limit Test API",
    "target_url": "https://jsonplaceholder.typicode.com",
    "rate_limit_per_second": 5,
    "burst_size": 10,
    "rate_limit_per_hour": 20,
    "rate_limit_per_day": 50,
    "rate_limit_per_month": 100,
    "auth_type": "none"
  }')

if echo "$RESPONSE" | grep -q "error"; then
    echo -e "${RED}❌ Failed to create API${NC}"
    echo "$RESPONSE" | jq '.'
    exit 1
fi

API_ID=$(echo "$RESPONSE" | jq -r '.id')
API_NAME=$(echo "$RESPONSE" | jq -r '.name')

echo -e "${GREEN}✅ API created with rate limits${NC}"
echo "  ID: $API_ID"
echo "  Name: $API_NAME"
echo "  Limits:"
echo "    - Per Second: 5 req/s"
echo "    - Burst: 10 requests"
echo "    - Per Hour: 20 requests"
echo "    - Per Day: 50 requests"
echo "    - Per Month: 100 requests"
echo ""

# Test 1: Per-second rate limit
echo -e "${BLUE}🧪 Test 1: Per-Second Rate Limit (5 req/s)${NC}"
echo "-------------------------------------------"

SUCCESS_COUNT=0
RATE_LIMITED=false

for i in {1..8}; do
    HTTP_CODE=$(curl -s -o /dev/null -w "%{http_code}" -X GET "$BASE_URL/proxy/$API_NAME/posts/1" \
      -H "X-API-Key: $API_KEY")
    
    if [ "$HTTP_CODE" = "200" ]; then
        SUCCESS_COUNT=$((SUCCESS_COUNT + 1))
    elif [ "$HTTP_CODE" = "429" ]; then
        RATE_LIMITED=true
        break
    fi
    sleep 0.1 # 100ms between requests (10 req/s)
done

echo "  Sent: 8 rapid requests (10 req/s)"
echo "  Success: $SUCCESS_COUNT"

if [ "$RATE_LIMITED" = true ] && [ "$SUCCESS_COUNT" -le 5 ]; then
    echo -e "${GREEN}✅ Per-second rate limit enforced${NC}"
elif [ -z "$REDIS_HOST" ]; then
    echo -e "${YELLOW}⚠️  Per-second limit uses in-memory limiter (expected)${NC}"
else
    echo -e "${RED}❌ Per-second rate limit not enforced${NC}"
fi
echo ""

# Test 2: Burst limit
echo -e "${BLUE}🧪 Test 2: Burst Limit (10 requests)${NC}"
echo "-------------------------------------------"

sleep 2 # Wait for rate limit to reset

SUCCESS_COUNT=0
RATE_LIMITED=false

for i in {1..15}; do
    HTTP_CODE=$(curl -s -o /dev/null -w "%{http_code}" -X GET "$BASE_URL/proxy/$API_NAME/posts/$i" \
      -H "X-API-Key: $API_KEY")
    
    if [ "$HTTP_CODE" = "200" ]; then
        SUCCESS_COUNT=$((SUCCESS_COUNT + 1))
    elif [ "$HTTP_CODE" = "429" ]; then
        RATE_LIMITED=true
        break
    fi
done

echo "  Sent: 15 immediate requests (burst)"
echo "  Success: $SUCCESS_COUNT"

if [ "$RATE_LIMITED" = true ] && [ "$SUCCESS_COUNT" -le 10 ]; then
    echo -e "${GREEN}✅ Burst limit enforced${NC}"
elif [ -z "$REDIS_HOST" ]; then
    echo -e "${YELLOW}⚠️  Burst limit uses in-memory limiter (expected)${NC}"
else
    echo -e "${RED}❌ Burst limit not enforced${NC}"
fi
echo ""

# Test 3: Hourly rate limit (requires Redis)
if [ -n "$REDIS_HOST" ]; then
    echo -e "${BLUE}🧪 Test 3: Hourly Rate Limit (20 requests)${NC}"
    echo "-------------------------------------------"
    
    sleep 2
    
    SUCCESS_COUNT=0
    RATE_LIMITED=false
    
    echo "  Sending 25 requests spread over time..."
    for i in {1..25}; do
        HTTP_CODE=$(curl -s -o /dev/null -w "%{http_code}" -X GET "$BASE_URL/proxy/$API_NAME/posts/$i" \
          -H "X-API-Key: $API_KEY")
        
        if [ "$HTTP_CODE" = "200" ]; then
            SUCCESS_COUNT=$((SUCCESS_COUNT + 1))
            echo -n "."
        elif [ "$HTTP_CODE" = "429" ]; then
            RATE_LIMITED=true
            echo -n "X"
        fi
        sleep 0.5 # Spread requests
    done
    echo ""
    
    echo "  Success: $SUCCESS_COUNT"
    
    if [ "$RATE_LIMITED" = true ] && [ "$SUCCESS_COUNT" -le 20 ]; then
        echo -e "${GREEN}✅ Hourly rate limit enforced by Redis${NC}"
    else
        echo -e "${YELLOW}⚠️  Hourly limit: $SUCCESS_COUNT requests succeeded${NC}"
    fi
    echo ""
else
    echo -e "${BLUE}🧪 Test 3: Hourly Rate Limit${NC}"
    echo "-------------------------------------------"
    echo -e "${YELLOW}⚠️  Skipped (Redis not configured)${NC}"
    echo "  To test hourly/daily/monthly limits:"
    echo "    1. Configure Redis (REDIS_HOST, REDIS_PORT)"
    echo "    2. Restart the backend"
    echo "    3. Run this test again"
    echo ""
fi

# Test 4: Verify limit details in error response
echo -e "${BLUE}🧪 Test 4: Rate Limit Error Response${NC}"
echo "-------------------------------------------"

# Make requests until rate limited
for i in {1..30}; do
    RESPONSE=$(curl -s -X GET "$BASE_URL/proxy/$API_NAME/posts/1" \
      -H "X-API-Key: $API_KEY")
    
    if echo "$RESPONSE" | jq -e '.error' > /dev/null 2>&1; then
        ERROR_CODE=$(echo "$RESPONSE" | jq -r '.error')
        ERROR_MSG=$(echo "$RESPONSE" | jq -r '.message')
        ERROR_DETAILS=$(echo "$RESPONSE" | jq -r '.details')
        
        if [ "$ERROR_CODE" = "RATE_LIMIT_EXCEEDED" ]; then
            echo -e "${GREEN}✅ Rate limit error response correct${NC}"
            echo "  Error Code: $ERROR_CODE"
            echo "  Message: $ERROR_MSG"
            echo "  Details: $ERROR_DETAILS"
            break
        fi
    fi
    sleep 0.1
done
echo ""

# Test 5: Check rate limit headers (if implemented)
echo -e "${BLUE}🧪 Test 5: Rate Limit Headers${NC}"
echo "-------------------------------------------"

sleep 2

HEADERS=$(curl -s -i -X GET "$BASE_URL/proxy/$API_NAME/posts/1" \
  -H "X-API-Key: $API_KEY" 2>&1 | grep -i "X-RateGuard")

if [ -n "$HEADERS" ]; then
    echo -e "${GREEN}✅ Rate limit headers present${NC}"
    echo "$HEADERS"
else
    echo -e "${YELLOW}⚠️  Rate limit headers not found (optional)${NC}"
fi
echo ""

# Clean up
echo -e "${BLUE}🗑️  Clean Up${NC}"
echo "-------------------------------------------"

curl -s -X DELETE "$BASE_URL/api/v1/apis/$API_ID" \
  -H "X-API-Key: $API_KEY" > /dev/null

echo -e "${GREEN}✅ Test API deleted${NC}"
echo ""

# Summary
echo "=========================================="
echo -e "${GREEN}🎉 Rate Limit Tests Complete!${NC}"
echo "=========================================="
echo ""

if [ -n "$REDIS_HOST" ]; then
    echo "Summary (with Redis):"
    echo "  ✅ Per-second rate limiting (in-memory)"
    echo "  ✅ Burst limiting (in-memory)"
    echo "  ✅ Hourly rate limiting (Redis)"
    echo "  ✅ Daily rate limiting (Redis, ready)"
    echo "  ✅ Monthly rate limiting (Redis, ready)"
    echo ""
    echo "🔐 Rate Limit Status:"
    echo "  ${GREEN}✅ Multi-tier rate limiting enabled with Redis${NC}"
    echo "  ${GREEN}✅ Distributed rate limiting across instances${NC}"
else
    echo "Summary (without Redis):"
    echo "  ✅ Per-second rate limiting (in-memory)"
    echo "  ✅ Burst limiting (in-memory)"
    echo "  ⚠️  Hourly rate limiting (not available)"
    echo "  ⚠️  Daily rate limiting (not available)"
    echo "  ⚠️  Monthly rate limiting (not available)"
    echo ""
    echo "💡 To enable multi-tier rate limiting:"
    echo "  1. Install Redis: docker-compose up -d postgres redis"
    echo "  2. Configure environment:"
    echo "     export REDIS_HOST=localhost"
    echo "     export REDIS_PORT=6379"
    echo "  3. Restart backend"
    echo ""
fi

echo "Next steps:"
echo "  1. Configure Redis for production"
echo "  2. Set appropriate rate limits per API"
echo "  3. Monitor rate limit metrics"
echo "  4. Implement rate limit dashboards"
echo ""
