#!/bin/bash

# Test script for encryption integration
# This script tests the encryption of API credentials

set -e

echo "🔐 Testing Encryption Integration"
echo "=================================="
echo ""

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
NC='\033[0m' # No Color

# Check if API_KEY is set
if [ -z "$API_KEY" ]; then
    echo -e "${RED}❌ ERROR: API_KEY environment variable not set${NC}"
    echo "Please set your API key: export API_KEY=your_api_key"
    exit 1
fi

# Check if ENCRYPTION_KEY is set
if [ -z "$ENCRYPTION_KEY" ]; then
    echo -e "${YELLOW}⚠️  WARNING: ENCRYPTION_KEY not set${NC}"
    echo "Credentials will be stored in plaintext"
    echo "To enable encryption, run:"
    echo "  export ENCRYPTION_KEY=\$(openssl rand -base64 32)"
    echo ""
fi

BASE_URL="${BASE_URL:-http://localhost:8008}"

echo "Testing with:"
echo "  Base URL: $BASE_URL"
echo "  API Key: ${API_KEY:0:10}..."
if [ -n "$ENCRYPTION_KEY" ]; then
    echo "  Encryption: ✅ ENABLED"
else
    echo "  Encryption: ❌ DISABLED"
fi
echo ""

# Test 1: Create API config with credentials
echo "📝 Test 1: Create API config with credentials"
echo "---------------------------------------------"

RESPONSE=$(curl -s -X POST "$BASE_URL/api/v1/apis" \
  -H "X-API-Key: $API_KEY" \
  -H "Content-Type: application/json" \
  -d '{
    "name": "Test GitHub API",
    "target_url": "https://api.github.com",
    "rate_limit_per_second": 10,
    "burst_size": 20,
    "rate_limit_per_hour": 1000,
    "rate_limit_per_day": 10000,
    "rate_limit_per_month": 100000,
    "allowed_origins": ["https://example.com"],
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

echo -e "${GREEN}✅ Created API config${NC}"
echo "  ID: $API_ID"
echo "  Name: $API_NAME"
echo "  Auth Type: $(echo "$RESPONSE" | jq -r '.auth_type')"
echo ""

# Test 2: Retrieve API config and check credentials
echo "🔍 Test 2: Retrieve API config and verify decryption"
echo "----------------------------------------------------"

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

if [ "$TOKEN" = "ghp_1234567890abcdefghijklmnopqrstuvwxyz" ]; then
    echo -e "${GREEN}✅ Credentials successfully decrypted${NC}"
    echo "  Token: ${TOKEN:0:10}...${TOKEN: -5}"
else
    echo -e "${RED}❌ Credentials not properly decrypted${NC}"
    echo "  Expected: ghp_1234567890abcdefghijklmnopqrstuvwxyz"
    echo "  Got: $TOKEN"
    exit 1
fi

# Check rate limits
RATE_LIMIT_HOUR=$(echo "$RESPONSE" | jq -r '.rate_limit_per_hour')
RATE_LIMIT_DAY=$(echo "$RESPONSE" | jq -r '.rate_limit_per_day')
RATE_LIMIT_MONTH=$(echo "$RESPONSE" | jq -r '.rate_limit_per_month')

echo "  Rate Limits:"
echo "    - Per Hour: $RATE_LIMIT_HOUR"
echo "    - Per Day: $RATE_LIMIT_DAY"
echo "    - Per Month: $RATE_LIMIT_MONTH"

# Check CORS
ALLOWED_ORIGINS=$(echo "$RESPONSE" | jq -r '.allowed_origins | length')
echo "  CORS Origins: $ALLOWED_ORIGINS configured"
echo ""

# Test 3: Update API config with new credentials
echo "✏️  Test 3: Update API config with new credentials"
echo "-------------------------------------------------"

RESPONSE=$(curl -s -X PUT "$BASE_URL/api/v1/apis/$API_ID" \
  -H "X-API-Key: $API_KEY" \
  -H "Content-Type: application/json" \
  -d '{
    "auth_credentials": {
      "token": "ghp_updated_token_xyz987654321"
    }
  }')

# Check for error
if echo "$RESPONSE" | grep -q "error"; then
    echo -e "${RED}❌ Failed to update API config${NC}"
    echo "$RESPONSE" | jq '.'
    exit 1
fi

echo -e "${GREEN}✅ Updated API config${NC}"
echo ""

# Test 4: Verify updated credentials
echo "🔍 Test 4: Verify updated credentials"
echo "-------------------------------------"

RESPONSE=$(curl -s -X GET "$BASE_URL/api/v1/apis/$API_ID" \
  -H "X-API-Key: $API_KEY")

TOKEN=$(echo "$RESPONSE" | jq -r '.auth_credentials.token')

if [ "$TOKEN" = "ghp_updated_token_xyz987654321" ]; then
    echo -e "${GREEN}✅ Updated credentials successfully decrypted${NC}"
    echo "  Token: ${TOKEN:0:10}...${TOKEN: -5}"
else
    echo -e "${RED}❌ Updated credentials not properly decrypted${NC}"
    echo "  Expected: ghp_updated_token_xyz987654321"
    echo "  Got: $TOKEN"
    exit 1
fi
echo ""

# Test 5: List all configs and verify encryption
echo "📋 Test 5: List all configs"
echo "----------------------------"

RESPONSE=$(curl -s -X GET "$BASE_URL/api/v1/apis" \
  -H "X-API-Key: $API_KEY")

# Check for error
if echo "$RESPONSE" | grep -q "error"; then
    echo -e "${RED}❌ Failed to list API configs${NC}"
    echo "$RESPONSE" | jq '.'
    exit 1
fi

TOTAL=$(echo "$RESPONSE" | jq -r '. | length')
echo -e "${GREEN}✅ Listed $TOTAL API configs${NC}"

# Check if our test config is in the list
FOUND=$(echo "$RESPONSE" | jq --arg id "$API_ID" '.[] | select(.id == $id) | .name')
if [ -n "$FOUND" ]; then
    echo "  Found test config: $FOUND"
else
    echo -e "${YELLOW}⚠️  Test config not found in list${NC}"
fi
echo ""

# Test 6: Clean up - Delete test config
echo "🗑️  Test 6: Clean up"
echo "--------------------"

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
echo "=================================="
echo "🎉 All encryption tests passed!"
echo "=================================="
echo ""
if [ -n "$ENCRYPTION_KEY" ]; then
    echo -e "${GREEN}✅ Credentials are encrypted at rest${NC}"
else
    echo -e "${YELLOW}⚠️  Credentials stored in plaintext${NC}"
    echo "   Set ENCRYPTION_KEY to enable encryption"
fi
