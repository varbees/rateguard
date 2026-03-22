#!/bin/bash

# Test script for per-API CORS whitelisting
# Tests CORS headers with allowed and disallowed origins

set -e

echo "🌐 Testing Per-API CORS Whitelisting"
echo "====================================="
echo ""

# Colors
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m'

BASE_URL="${BASE_URL:-http://localhost:8008}"
TEST_EMAIL="${TEST_EMAIL:-test-cors-$(date +%s)@example.com}"
TEST_PASSWORD="${TEST_PASSWORD:-TestPass123!}"

echo "Configuration:"
echo "  Base URL: $BASE_URL"
echo "  Test Email: $TEST_EMAIL"
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

# Create API with CORS whitelist
echo -e "${BLUE}📝 Step 2: Create API with CORS Whitelist${NC}"
echo "-------------------------------------------"

RESPONSE=$(curl -s -X POST "$BASE_URL/api/v1/apis" \
  -H "X-API-Key: $API_KEY" \
  -H "Content-Type: application/json" \
  -d '{
    "name": "CORS Test API",
    "target_url": "https://jsonplaceholder.typicode.com",
    "rate_limit_per_second": 10,
    "burst_size": 20,
    "allowed_origins": [
      "https://example.com",
      "http://localhost:3000",
      "https://app.rateguard.com"
    ],
    "auth_type": "none"
  }')

if echo "$RESPONSE" | grep -q "error"; then
    echo -e "${RED}❌ Failed to create API${NC}"
    echo "$RESPONSE" | jq '.'
    exit 1
fi

API_ID=$(echo "$RESPONSE" | jq -r '.id')
API_NAME=$(echo "$RESPONSE" | jq -r '.name')

echo -e "${GREEN}✅ API created${NC}"
echo "  ID: $API_ID"
echo "  Name: $API_NAME"
echo "  Allowed Origins:"
echo "$RESPONSE" | jq -r '.allowed_origins[]' | while read origin; do
    echo "    - $origin"
done
echo ""

# Test 1: Request with allowed origin
echo -e "${BLUE}🧪 Test 1: Request with Allowed Origin${NC}"
echo "-------------------------------------------"
echo "Testing: https://example.com"

RESPONSE=$(curl -s -i -X GET "$BASE_URL/proxy/$API_NAME/posts/1" \
  -H "X-API-Key: $API_KEY" \
  -H "Origin: https://example.com")

# Check if Access-Control-Allow-Origin header is present
if echo "$RESPONSE" | grep -qi "Access-Control-Allow-Origin: https://example.com"; then
    echo -e "${GREEN}✅ CORS headers set correctly for allowed origin${NC}"
    echo "  Access-Control-Allow-Origin: https://example.com"
else
    echo -e "${RED}❌ CORS headers missing or incorrect${NC}"
    echo "$RESPONSE" | grep -i "Access-Control"
    exit 1
fi
echo ""

# Test 2: Request with another allowed origin
echo -e "${BLUE}🧪 Test 2: Request with Another Allowed Origin${NC}"
echo "-------------------------------------------"
echo "Testing: http://localhost:3000"

RESPONSE=$(curl -s -i -X GET "$BASE_URL/proxy/$API_NAME/posts/1" \
  -H "X-API-Key: $API_KEY" \
  -H "Origin: http://localhost:3000")

if echo "$RESPONSE" | grep -qi "Access-Control-Allow-Origin: http://localhost:3000"; then
    echo -e "${GREEN}✅ CORS headers set correctly for localhost:3000${NC}"
    echo "  Access-Control-Allow-Origin: http://localhost:3000"
else
    echo -e "${RED}❌ CORS headers missing or incorrect${NC}"
    echo "$RESPONSE" | grep -i "Access-Control"
    exit 1
fi
echo ""

# Test 3: Request with disallowed origin
echo -e "${BLUE}🧪 Test 3: Request with Disallowed Origin${NC}"
echo "-------------------------------------------"
echo "Testing: https://evil.com (should be blocked)"

HTTP_CODE=$(curl -s -o /dev/null -w "%{http_code}" -X GET "$BASE_URL/proxy/$API_NAME/posts/1" \
  -H "X-API-Key: $API_KEY" \
  -H "Origin: https://evil.com")

if [ "$HTTP_CODE" = "403" ]; then
    echo -e "${GREEN}✅ Disallowed origin correctly blocked${NC}"
    echo "  HTTP Status: 403 Forbidden"
else
    echo -e "${RED}❌ Disallowed origin not blocked (got HTTP $HTTP_CODE)${NC}"
    exit 1
fi
echo ""

# Test 4: Preflight OPTIONS request
echo -e "${BLUE}🧪 Test 4: Preflight OPTIONS Request${NC}"
echo "-------------------------------------------"

RESPONSE=$(curl -s -i -X OPTIONS "$BASE_URL/proxy/$API_NAME/posts/1" \
  -H "X-API-Key: $API_KEY" \
  -H "Origin: https://example.com" \
  -H "Access-Control-Request-Method: POST")

if echo "$RESPONSE" | grep -qi "Access-Control-Allow-Origin: https://example.com"; then
    echo -e "${GREEN}✅ Preflight request handled correctly${NC}"
    HTTP_CODE=$(echo "$RESPONSE" | grep "HTTP" | awk '{print $2}')
    echo "  HTTP Status: $HTTP_CODE"
    echo "  Access-Control-Allow-Origin: https://example.com"
else
    echo -e "${RED}❌ Preflight request failed${NC}"
    echo "$RESPONSE" | head -20
    exit 1
fi
echo ""

# Test 5: Update API to add wildcard origin
echo -e "${BLUE}📝 Step 5: Update API with Wildcard Origin${NC}"
echo "-------------------------------------------"

RESPONSE=$(curl -s -X PUT "$BASE_URL/api/v1/apis/$API_ID" \
  -H "X-API-Key: $API_KEY" \
  -H "Content-Type: application/json" \
  -d '{
    "allowed_origins": [
      "https://example.com",
      "http://localhost:3000",
      "*.rateguard.com"
    ]
  }')

if echo "$RESPONSE" | grep -q "error"; then
    echo -e "${RED}❌ Failed to update API${NC}"
    echo "$RESPONSE" | jq '.'
    exit 1
fi

echo -e "${GREEN}✅ API updated with wildcard origin${NC}"
echo "  Added: *.rateguard.com"
echo ""

# Test 6: Test wildcard origin
echo -e "${BLUE}🧪 Test 6: Request with Wildcard Match${NC}"
echo "-------------------------------------------"
echo "Testing: https://app.rateguard.com (should match *.rateguard.com)"

RESPONSE=$(curl -s -i -X GET "$BASE_URL/proxy/$API_NAME/posts/1" \
  -H "X-API-Key: $API_KEY" \
  -H "Origin: https://app.rateguard.com")

if echo "$RESPONSE" | grep -qi "Access-Control-Allow-Origin: https://app.rateguard.com"; then
    echo -e "${GREEN}✅ Wildcard origin matched correctly${NC}"
    echo "  Access-Control-Allow-Origin: https://app.rateguard.com"
else
    echo -e "${RED}❌ Wildcard origin not matched${NC}"
    echo "$RESPONSE" | grep -i "Access-Control"
    exit 1
fi
echo ""

# Test 7: Non-proxy routes (should allow all origins)
echo -e "${BLUE}🧪 Test 7: Non-Proxy Routes (Global CORS)${NC}"
echo "-------------------------------------------"
echo "Testing: Dashboard endpoint (should allow any origin)"

RESPONSE=$(curl -s -i -X GET "$BASE_URL/api/v1/dashboard/stats" \
  -H "X-API-Key: $API_KEY" \
  -H "Origin: https://any-origin.com")

if echo "$RESPONSE" | grep -qi "Access-Control-Allow-Origin: https://any-origin.com"; then
    echo -e "${GREEN}✅ Non-proxy routes allow all origins${NC}"
    echo "  Access-Control-Allow-Origin: https://any-origin.com"
else
    echo -e "${RED}❌ Non-proxy routes CORS not working${NC}"
    echo "$RESPONSE" | grep -i "Access-Control"
    exit 1
fi
echo ""

# Test 8: Empty allowed_origins (should deny all)
echo -e "${BLUE}📝 Step 8: Update API with Empty Origins${NC}"
echo "-------------------------------------------"

RESPONSE=$(curl -s -X PUT "$BASE_URL/api/v1/apis/$API_ID" \
  -H "X-API-Key: $API_KEY" \
  -H "Content-Type: application/json" \
  -d '{
    "allowed_origins": []
  }')

echo -e "${GREEN}✅ API updated with empty origins${NC}"
echo ""

echo -e "${BLUE}🧪 Test 9: Request with Empty Whitelist${NC}"
echo "-------------------------------------------"
echo "Testing: All origins should be blocked"

HTTP_CODE=$(curl -s -o /dev/null -w "%{http_code}" -X GET "$BASE_URL/proxy/$API_NAME/posts/1" \
  -H "X-API-Key: $API_KEY" \
  -H "Origin: https://example.com")

if [ "$HTTP_CODE" = "403" ]; then
    echo -e "${GREEN}✅ Empty whitelist blocks all origins${NC}"
    echo "  HTTP Status: 403 Forbidden"
else
    echo -e "${RED}❌ Empty whitelist should block all (got HTTP $HTTP_CODE)${NC}"
    exit 1
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
echo -e "${GREEN}🎉 All CORS Tests Passed!${NC}"
echo "=========================================="
echo ""
echo "Summary of tested scenarios:"
echo "  ✅ Allowed origin (exact match)"
echo "  ✅ Multiple allowed origins"
echo "  ✅ Disallowed origin blocked (403)"
echo "  ✅ Preflight OPTIONS request"
echo "  ✅ Wildcard origin (*.domain.com)"
echo "  ✅ Non-proxy routes (global CORS)"
echo "  ✅ Empty whitelist blocks all"
echo ""
echo "🔐 CORS Security Status:"
echo "  ✅ Per-API origin whitelisting enabled"
echo "  ✅ Secure by default (empty list = deny all)"
echo "  ✅ Wildcard support for subdomains"
echo "  ✅ Backward compatible (non-proxy routes allow all)"
echo ""
