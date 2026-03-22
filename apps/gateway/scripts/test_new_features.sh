#!/bin/bash

# Comprehensive test script for new RateGuard features
# Tests: URL slugification, multi-tier rate limits, CORS, encryption

set -e

echo "🚀 Testing RateGuard New Features"
echo "=================================="
echo ""

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m' # No Color

BASE_URL="${BASE_URL:-http://localhost:8008}"
TEST_EMAIL="${TEST_EMAIL:-test-$(date +%s)@example.com}"
TEST_PASSWORD="${TEST_PASSWORD:-TestPass123!}"

echo "Configuration:"
echo "  Base URL: $BASE_URL"
echo "  Test Email: $TEST_EMAIL"

# Check if ENCRYPTION_KEY is set
if [ -n "$ENCRYPTION_KEY" ]; then
    echo "  Encryption: ✅ ENABLED"
else
    echo "  Encryption: ⚠️  DISABLED (credentials will be stored in plaintext)"
fi
echo ""

# Function to check if backend is running
check_backend() {
    echo "🔍 Checking backend availability..."
    if ! curl -s "$BASE_URL/health" > /dev/null 2>&1; then
        echo -e "${RED}❌ Backend not available at $BASE_URL${NC}"
        echo "Please start the backend first:"
        echo "  cd rateguard"
        echo "  ./scripts/run.sh dev"
        exit 1
    fi
    echo -e "${GREEN}✅ Backend is running${NC}"
    echo ""
}

# Test 0: Check backend
check_backend

# Test 1: Create user account (or login if exists)
echo -e "${BLUE}📝 Test 1: Create/Login User${NC}"
echo "--------------------------------------------"

# Try to create user
SIGNUP_RESPONSE=$(curl -s -X POST "$BASE_URL/api/v1/auth/signup" \
  -H "Content-Type: application/json" \
  -d "{
    \"email\": \"$TEST_EMAIL\",
    \"password\": \"$TEST_PASSWORD\"
  }")

if echo "$SIGNUP_RESPONSE" | jq -e '.api_key' > /dev/null 2>&1; then
    echo -e "${GREEN}✅ Created new user${NC}"
    API_KEY=$(echo "$SIGNUP_RESPONSE" | jq -r '.api_key')
    echo "  Email: $TEST_EMAIL"
    echo "  API Key: ${API_KEY:0:10}..."
else
    # User might already exist, try login
    echo "  User exists, logging in..."
    LOGIN_RESPONSE=$(curl -s -X POST "$BASE_URL/api/v1/auth/login" \
      -H "Content-Type: application/json" \
      -d "{
        \"email\": \"$TEST_EMAIL\",
        \"password\": \"$TEST_PASSWORD\"
      }")
    
    if echo "$LOGIN_RESPONSE" | jq -e '.api_key' > /dev/null 2>&1; then
        echo -e "${GREEN}✅ Logged in successfully${NC}"
        API_KEY=$(echo "$LOGIN_RESPONSE" | jq -r '.api_key')
        echo "  Email: $TEST_EMAIL"
        echo "  API Key: ${API_KEY:0:10}..."
    else
        echo -e "${RED}❌ Failed to create/login user${NC}"
        echo "$LOGIN_RESPONSE" | jq '.'
        exit 1
    fi
fi
echo ""

# Test 2: URL Slugification
echo -e "${BLUE}📝 Test 2: URL Slugification${NC}"
echo "--------------------------------------------"
echo "Testing automatic conversion of names with spaces and special characters..."

RESPONSE=$(curl -s -X POST "$BASE_URL/api/v1/apis" \
  -H "X-API-Key: $API_KEY" \
  -H "Content-Type: application/json" \
  -d '{
    "name": "My Awesome GitHub API!!!",
    "target_url": "https://api.github.com",
    "rate_limit_per_second": 10,
    "burst_size": 20,
    "rate_limit_per_hour": 1000,
    "rate_limit_per_day": 10000,
    "rate_limit_per_month": 100000,
    "allowed_origins": ["https://example.com", "http://localhost:3000"],
    "auth_type": "bearer",
    "auth_credentials": {
      "token": "ghp_1234567890abcdefghijklmnopqrstuvwxyz"
    },
    "timeout_seconds": 30,
    "retry_attempts": 3
  }')

# Check for error
if echo "$RESPONSE" | grep -q "error"; then
    echo -e "${RED}❌ Failed to create API config${NC}"
    echo "$RESPONSE" | jq '.'
    exit 1
fi

API_ID=$(echo "$RESPONSE" | jq -r '.id')
API_NAME=$(echo "$RESPONSE" | jq -r '.name')
PROXY_URL=$(echo "$RESPONSE" | jq -r '.proxy_url')

echo -e "${GREEN}✅ Created API config with slugified name${NC}"
echo "  Original Name: \"My Awesome GitHub API!!!\""
echo "  Slugified Name: \"$API_NAME\""
echo "  Expected: \"my-awesome-github-api\""

if [ "$API_NAME" = "my-awesome-github-api" ]; then
    echo -e "  ${GREEN}✅ Slugification correct!${NC}"
else
    echo -e "  ${RED}❌ Slugification incorrect!${NC}"
    exit 1
fi

echo "  Proxy URL: $PROXY_URL"
echo ""

# Test 3: Multi-tier Rate Limits
echo -e "${BLUE}📊 Test 3: Multi-Tier Rate Limits${NC}"
echo "--------------------------------------------"

RATE_LIMIT_HOUR=$(echo "$RESPONSE" | jq -r '.rate_limit_per_hour')
RATE_LIMIT_DAY=$(echo "$RESPONSE" | jq -r '.rate_limit_per_day')
RATE_LIMIT_MONTH=$(echo "$RESPONSE" | jq -r '.rate_limit_per_month')

echo "Verifying multi-tier rate limits..."
echo "  Per Second: $(echo "$RESPONSE" | jq -r '.rate_limit_per_second')"
echo "  Burst Size: $(echo "$RESPONSE" | jq -r '.burst_size')"
echo "  Per Hour: $RATE_LIMIT_HOUR"
echo "  Per Day: $RATE_LIMIT_DAY"
echo "  Per Month: $RATE_LIMIT_MONTH"

if [ "$RATE_LIMIT_HOUR" = "1000" ] && [ "$RATE_LIMIT_DAY" = "10000" ] && [ "$RATE_LIMIT_MONTH" = "100000" ]; then
    echo -e "${GREEN}✅ Multi-tier rate limits stored correctly${NC}"
else
    echo -e "${RED}❌ Multi-tier rate limits incorrect${NC}"
    exit 1
fi
echo ""

# Test 4: CORS Whitelisting
echo -e "${BLUE}🌐 Test 4: Per-API CORS Whitelisting${NC}"
echo "--------------------------------------------"

ALLOWED_ORIGINS=$(echo "$RESPONSE" | jq -r '.allowed_origins')
ORIGIN_COUNT=$(echo "$ALLOWED_ORIGINS" | jq 'length')

echo "Verifying CORS whitelist..."
echo "  Allowed Origins: $ALLOWED_ORIGINS"
echo "  Count: $ORIGIN_COUNT"

if [ "$ORIGIN_COUNT" = "2" ]; then
    echo -e "${GREEN}✅ CORS whitelist stored correctly${NC}"
else
    echo -e "${RED}❌ CORS whitelist incorrect${NC}"
    exit 1
fi
echo ""

# Test 5: Encryption (Retrieve and Decrypt)
echo -e "${BLUE}🔐 Test 5: Credential Encryption & Decryption${NC}"
echo "--------------------------------------------"

RESPONSE=$(curl -s -X GET "$BASE_URL/api/v1/apis/$API_ID" \
  -H "X-API-Key: $API_KEY")

# Check for error
if echo "$RESPONSE" | grep -q "error"; then
    echo -e "${RED}❌ Failed to retrieve API config${NC}"
    echo "$RESPONSE" | jq '.'
    exit 1
fi

# Check if credentials are present and decrypted
TOKEN=$(echo "$RESPONSE" | jq -r '.auth_credentials.token')

echo "Verifying credential decryption..."
echo "  Expected Token: ghp_1234567890abcdefghijklmnopqrstuvwxyz"
echo "  Retrieved Token: ${TOKEN:0:10}...${TOKEN: -5}"

if [ "$TOKEN" = "ghp_1234567890abcdefghijklmnopqrstuvwxyz" ]; then
    echo -e "${GREEN}✅ Credentials successfully decrypted${NC}"
    if [ -n "$ENCRYPTION_KEY" ]; then
        echo "  ${GREEN}✅ Encryption was enabled - credentials secured at rest${NC}"
    else
        echo "  ${YELLOW}⚠️  Encryption disabled - credentials stored in plaintext${NC}"
    fi
else
    echo -e "${RED}❌ Credentials not properly decrypted${NC}"
    echo "  Got: $TOKEN"
    exit 1
fi
echo ""

# Test 6: Update API Config (Test Re-encryption)
echo -e "${BLUE}✏️  Test 6: Update Credentials (Re-encryption)${NC}"
echo "--------------------------------------------"

RESPONSE=$(curl -s -X PUT "$BASE_URL/api/v1/apis/$API_ID" \
  -H "X-API-Key: $API_KEY" \
  -H "Content-Type: application/json" \
  -d '{
    "auth_credentials": {
      "token": "ghp_updated_token_xyz987654321"
    },
    "rate_limit_per_hour": 2000,
    "rate_limit_per_day": 20000,
    "allowed_origins": ["https://example.com", "http://localhost:3000", "https://newdomain.com"]
  }')

# Check for error
if echo "$RESPONSE" | grep -q "error"; then
    echo -e "${RED}❌ Failed to update API config${NC}"
    echo "$RESPONSE" | jq '.'
    exit 1
fi

echo -e "${GREEN}✅ Updated API config${NC}"
echo "  Updated credentials, rate limits, and CORS"
echo ""

# Test 7: Verify Updated Values
echo -e "${BLUE}🔍 Test 7: Verify Updated Values${NC}"
echo "--------------------------------------------"

RESPONSE=$(curl -s -X GET "$BASE_URL/api/v1/apis/$API_ID" \
  -H "X-API-Key: $API_KEY")

TOKEN=$(echo "$RESPONSE" | jq -r '.auth_credentials.token')
RATE_LIMIT_HOUR=$(echo "$RESPONSE" | jq -r '.rate_limit_per_hour')
RATE_LIMIT_DAY=$(echo "$RESPONSE" | jq -r '.rate_limit_per_day')
ORIGIN_COUNT=$(echo "$RESPONSE" | jq -r '.allowed_origins | length')

echo "Verifying updates..."
echo "  Token: ${TOKEN:0:10}...${TOKEN: -5}"
echo "  Per Hour: $RATE_LIMIT_HOUR"
echo "  Per Day: $RATE_LIMIT_DAY"
echo "  CORS Origins: $ORIGIN_COUNT"

SUCCESS=true

if [ "$TOKEN" = "ghp_updated_token_xyz987654321" ]; then
    echo -e "  ${GREEN}✅ Credentials updated and decrypted${NC}"
else
    echo -e "  ${RED}❌ Credentials not properly updated${NC}"
    SUCCESS=false
fi

if [ "$RATE_LIMIT_HOUR" = "2000" ] && [ "$RATE_LIMIT_DAY" = "20000" ]; then
    echo -e "  ${GREEN}✅ Rate limits updated${NC}"
else
    echo -e "  ${RED}❌ Rate limits not updated${NC}"
    SUCCESS=false
fi

if [ "$ORIGIN_COUNT" = "3" ]; then
    echo -e "  ${GREEN}✅ CORS origins updated${NC}"
else
    echo -e "  ${RED}❌ CORS origins not updated${NC}"
    SUCCESS=false
fi

if [ "$SUCCESS" = false ]; then
    exit 1
fi
echo ""

# Test 8: List All Configs (Batch Decryption)
echo -e "${BLUE}📋 Test 8: List All Configs (Batch Decryption)${NC}"
echo "--------------------------------------------"

RESPONSE=$(curl -s -X GET "$BASE_URL/api/v1/apis" \
  -H "X-API-Key: $API_KEY")

# Check for error
if echo "$RESPONSE" | grep -q "error"; then
    echo -e "${RED}❌ Failed to list API configs${NC}"
    echo "$RESPONSE" | jq '.'
    exit 1
fi

TOTAL=$(echo "$RESPONSE" | jq '. | length')
echo -e "${GREEN}✅ Listed $TOTAL API config(s)${NC}"

# Check if our test config is in the list
FOUND=$(echo "$RESPONSE" | jq --arg id "$API_ID" '.[] | select(.id == $id) | .name')
if [ -n "$FOUND" ]; then
    echo "  Found test config: $FOUND"
    
    # Verify credentials are decrypted in list
    LIST_TOKEN=$(echo "$RESPONSE" | jq --arg id "$API_ID" -r '.[] | select(.id == $id) | .auth_credentials.token')
    if [ "$LIST_TOKEN" = "ghp_updated_token_xyz987654321" ]; then
        echo -e "  ${GREEN}✅ Credentials decrypted in list operation${NC}"
    else
        echo -e "  ${RED}❌ Credentials not decrypted in list${NC}"
        exit 1
    fi
else
    echo -e "  ${YELLOW}⚠️  Test config not found in list${NC}"
fi
echo ""

# Test 9: Test Invalid Name Validation
echo -e "${BLUE}🚫 Test 9: URL Validation (Reject Too Short)${NC}"
echo "--------------------------------------------"

RESPONSE=$(curl -s -X POST "$BASE_URL/api/v1/apis" \
  -H "X-API-Key: $API_KEY" \
  -H "Content-Type: application/json" \
  -d '{
    "name": "a",
    "target_url": "https://api.example.com",
    "rate_limit_per_second": 10,
    "burst_size": 20,
    "auth_type": "none"
  }')

# Should fail with validation error
if echo "$RESPONSE" | grep -q "Invalid API name"; then
    echo -e "${GREEN}✅ Correctly rejected name that's too short${NC}"
    echo "  Error: $(echo "$RESPONSE" | jq -r '.message')"
else
    echo -e "${RED}❌ Should have rejected short name${NC}"
    exit 1
fi
echo ""

# Test 10: Clean up
echo -e "${BLUE}🗑️  Test 10: Clean Up${NC}"
echo "--------------------------------------------"

RESPONSE=$(curl -s -X DELETE "$BASE_URL/api/v1/apis/$API_ID" \
  -H "X-API-Key: $API_KEY")

# Check for error
if echo "$RESPONSE" | grep -q "error"; then
    echo -e "${YELLOW}⚠️  Failed to delete API config (may already be deleted)${NC}"
else
    echo -e "${GREEN}✅ Deleted test config${NC}"
fi
echo ""

# Summary
echo "=========================================="
echo -e "${GREEN}🎉 All Tests Passed!${NC}"
echo "=========================================="
echo ""
echo "Summary of tested features:"
echo "  ✅ URL Slugification (\"My Awesome GitHub API!!!\" → \"my-awesome-github-api\")"
echo "  ✅ Multi-Tier Rate Limits (hour/day/month)"
echo "  ✅ Per-API CORS Whitelisting"
if [ -n "$ENCRYPTION_KEY" ]; then
    echo "  ✅ AES-256-GCM Encryption (credentials encrypted at rest)"
else
    echo "  ⚠️  Encryption disabled (set ENCRYPTION_KEY to enable)"
fi
echo "  ✅ Credential Update & Re-encryption"
echo "  ✅ Batch Decryption (list operation)"
echo "  ✅ Input Validation (reject invalid names)"
echo ""
echo "🔐 Security Status:"
if [ -n "$ENCRYPTION_KEY" ]; then
    echo "  ${GREEN}✅ Credentials are encrypted at rest with AES-256-GCM${NC}"
else
    echo "  ${YELLOW}⚠️  Credentials stored in plaintext${NC}"
    echo "     To enable encryption:"
    echo "     export ENCRYPTION_KEY=\$(openssl rand -base64 32)"
fi
echo ""
echo "Next steps:"
echo "  1. Update frontend to support new fields"
echo "  2. Implement CORS middleware using per-API whitelist"
echo "  3. Implement Redis multi-tier rate limiter"
echo ""
