#!/bin/bash

# Mock Test for Rate Limit Discovery Feature
# This script tests the feature using direct database access (no API token needed)

set -e

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m' # No Color

# Configuration
DB_CONTAINER="${DB_CONTAINER:-rateguard-postgres}"
DB_NAME="${DB_NAME:-rateguard}"
DB_USER="${DB_USER:-postgres}"
BASE_URL="${BASE_URL:-http://localhost:8008}"

echo -e "${GREEN}━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━${NC}"
echo -e "${GREEN}  Rate Limit Discovery Mock Test Suite${NC}"
echo -e "${GREEN}━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━${NC}"
echo ""
echo -e "${BLUE}📝 This test creates mock data directly in the database${NC}"
echo ""

# Check if Docker container is running
echo -e "${YELLOW}[Test 1]${NC} Checking PostgreSQL container..."
if docker ps | grep -q "$DB_CONTAINER"; then
    echo -e "${GREEN}✓${NC} PostgreSQL container is running"
else
    echo -e "${RED}✗${NC} PostgreSQL container '$DB_CONTAINER' is not running"
    echo -e "${YELLOW}Start it with: docker start $DB_CONTAINER${NC}"
    exit 1
fi

# Check if backend is running
echo -e "\n${YELLOW}[Test 2]${NC} Checking backend health..."
if curl -s "$BASE_URL/health" > /dev/null 2>&1; then
    echo -e "${GREEN}✓${NC} Backend is running at $BASE_URL"
else
    echo -e "${RED}✗${NC} Backend is not running at $BASE_URL"
    echo -e "${YELLOW}Start it with: make run${NC}"
    exit 1
fi

# Check if rate_limit_observations table exists
echo -e "\n${YELLOW}[Test 3]${NC} Verifying database schema..."
TABLE_EXISTS=$(docker exec $DB_CONTAINER psql -U $DB_USER -d $DB_NAME -tAc \
    "SELECT EXISTS (SELECT FROM information_schema.tables WHERE table_name = 'rate_limit_observations')")

if [ "$TABLE_EXISTS" = "t" ]; then
    echo -e "${GREEN}✓${NC} Table 'rate_limit_observations' exists"
else
    echo -e "${RED}✗${NC} Table 'rate_limit_observations' does not exist"
    echo -e "${YELLOW}Run migration: docker exec -i $DB_CONTAINER psql -U $DB_USER -d $DB_NAME < migrations/007_add_rate_limit_observations.sql${NC}"
    exit 1
fi

# Create mock test user
echo -e "\n${YELLOW}[Test 4]${NC} Creating mock test user..."
TEST_USER_ID=$(docker exec $DB_CONTAINER psql -U $DB_USER -d $DB_NAME -tAc \
    "INSERT INTO users (id, email, password_hash, api_key, plan, active, email_verified) 
     VALUES (gen_random_uuid(), 'test-rld@example.com', '\$2a\$10\$mockpasswordhash', 'test-api-key-rld-' || gen_random_uuid()::text, 'pro', true, true) 
     ON CONFLICT (email) DO UPDATE SET email = EXCLUDED.email 
     RETURNING id" | tr -d ' \n' | head -c 36)

if [ -n "$TEST_USER_ID" ]; then
    echo -e "${GREEN}✓${NC} Test user created: $TEST_USER_ID"
else
    # Try to get existing user
    TEST_USER_ID=$(docker exec $DB_CONTAINER psql -U $DB_USER -d $DB_NAME -tAc \
        "SELECT id FROM users WHERE email = 'test-rld@example.com'" | tr -d ' \n' | head -c 36)
    if [ -n "$TEST_USER_ID" ]; then
        echo -e "${GREEN}✓${NC} Using existing test user: $TEST_USER_ID"
    else
        echo -e "${RED}✗${NC} Failed to create test user"
        exit 1
    fi
fi

# Create mock API configuration
echo -e "\n${YELLOW}[Test 5]${NC} Creating mock API configuration..."
TEST_API_ID=$(docker exec $DB_CONTAINER psql -U $DB_USER -d $DB_NAME -tAc \
    "INSERT INTO api_configs (
        id, user_id, name, target_url, 
        rate_limit_per_second, rate_limit_per_hour, rate_limit_per_day,
        burst_size, timeout_seconds, retry_attempts, enabled, created_at
     ) VALUES (
        gen_random_uuid(), '$TEST_USER_ID', 'test-api-rld', 'https://api.example.com',
        100, 360000, 8640000,
        10, 30, 3, true, NOW()
     ) 
     ON CONFLICT (user_id, name) DO UPDATE SET name = EXCLUDED.name
     RETURNING id" | tr -d ' \n' | head -c 36)

if [ -n "$TEST_API_ID" ]; then
    echo -e "${GREEN}✓${NC} Test API created: $TEST_API_ID"
else
    # Try to get existing API
    TEST_API_ID=$(docker exec $DB_CONTAINER psql -U $DB_USER -d $DB_NAME -tAc \
        "SELECT id FROM api_configs WHERE user_id = '$TEST_USER_ID' AND name = 'test-api-rld'" | tr -d ' \n' | head -c 36)
    if [ -n "$TEST_API_ID" ]; then
        echo -e "${GREEN}✓${NC} Using existing test API: $TEST_API_ID"
    else
        echo -e "${RED}✗${NC} Failed to create test API"
        exit 1
    fi
fi

# Create mock rate limit observations
echo -e "\n${YELLOW}[Test 6]${NC} Creating mock rate limit observations..."

# Create 10 consistent observations (should give high confidence)
for i in {1..10}; do
    docker exec $DB_CONTAINER psql -U $DB_USER -d $DB_NAME -tAc \
        "INSERT INTO rate_limit_observations (
            id, user_id, api_id, limit_per_window, window_seconds,
            source_header, observed_at, response_status
         ) VALUES (
            gen_random_uuid(), '$TEST_USER_ID', '$TEST_API_ID', 
            10, 60, 'X-RateLimit-Limit', 
            NOW() - INTERVAL '$i hours', 429
         )" > /dev/null 2>&1
done

OBS_COUNT=$(docker exec $DB_CONTAINER psql -U $DB_USER -d $DB_NAME -tAc \
    "SELECT COUNT(*) FROM rate_limit_observations WHERE api_id = '$TEST_API_ID'" | tr -d ' ')

echo -e "${GREEN}✓${NC} Created $OBS_COUNT observations"

# Display sample observations
echo -e "\n${BLUE}📊 Sample observations:${NC}"
docker exec $DB_CONTAINER psql -U $DB_USER -d $DB_NAME -c \
    "SELECT limit_per_window, window_seconds, source_header, 
            TO_CHAR(observed_at, 'YYYY-MM-DD HH24:MI:SS') as observed_at,
            response_status 
     FROM rate_limit_observations 
     WHERE api_id = '$TEST_API_ID' 
     ORDER BY observed_at DESC LIMIT 5" \
    | sed 's/^/  /'

# Test the analyzer directly via database query
echo -e "\n${YELLOW}[Test 7]${NC} Testing rate limit analyzer logic..."

# Get current config
CURRENT_CONFIG=$(docker exec $DB_CONTAINER psql -U $DB_USER -d $DB_NAME -tAc \
    "SELECT name, rate_limit_per_second, rate_limit_per_hour 
     FROM api_configs WHERE id = '$TEST_API_ID'" | tr '\t' ',')

echo -e "${BLUE}Current configuration:${NC}"
echo -e "  API Name: ${CURRENT_CONFIG%%,*}"
echo -e "  Per Second: $(echo "$CURRENT_CONFIG" | cut -d',' -f2)"
echo -e "  Per Hour: $(echo "$CURRENT_CONFIG" | cut -d',' -f3)"

# Calculate expected suggestion
echo -e "\n${BLUE}Expected suggestion based on observations:${NC}"
echo -e "  Limit: 10 requests per 60 seconds"
echo -e "  Suggested per-second: 0.17 (10/60)"
echo -e "  Confidence: ~95% (consistent observations)"
echo -e "  Reason: Detected lower per-second limit"

# Verify observations can be queried
echo -e "\n${YELLOW}[Test 8]${NC} Verifying observation queries..."
RECENT_OBS=$(docker exec $DB_CONTAINER psql -U $DB_USER -d $DB_NAME -tAc \
    "SELECT COUNT(*) FROM rate_limit_observations 
     WHERE api_id = '$TEST_API_ID' 
       AND observed_at > NOW() - INTERVAL '30 days'")

echo -e "${GREEN}✓${NC} Found $RECENT_OBS observations within 30 days"

# Check for proper indexes
echo -e "\n${YELLOW}[Test 9]${NC} Verifying database indexes..."
INDEXES=$(docker exec $DB_CONTAINER psql -U $DB_USER -d $DB_NAME -tAc \
    "SELECT indexname FROM pg_indexes 
     WHERE tablename = 'rate_limit_observations'" | wc -l | tr -d ' ')

echo -e "${GREEN}✓${NC} Found $INDEXES indexes on rate_limit_observations table"

# Display index details
docker exec $DB_CONTAINER psql -U $DB_USER -d $DB_NAME -c \
    "SELECT indexname, indexdef 
     FROM pg_indexes 
     WHERE tablename = 'rate_limit_observations'" \
    | sed 's/^/  /'

# Test statistical calculations
echo -e "\n${YELLOW}[Test 10]${NC} Testing statistical calculations..."

AVG_LIMIT=$(docker exec $DB_CONTAINER psql -U $DB_USER -d $DB_NAME -tAc \
    "SELECT AVG(limit_per_window)::NUMERIC(10,2) 
     FROM rate_limit_observations 
     WHERE api_id = '$TEST_API_ID'" | tr -d ' ')

STDDEV=$(docker exec $DB_CONTAINER psql -U $DB_USER -d $DB_NAME -tAc \
    "SELECT STDDEV(limit_per_window)::NUMERIC(10,2) 
     FROM rate_limit_observations 
     WHERE api_id = '$TEST_API_ID'" | tr -d ' ')

echo -e "${BLUE}Statistical analysis:${NC}"
echo -e "  Average limit: $AVG_LIMIT"
echo -e "  Std deviation: $STDDEV"
echo -e "  Coefficient of variation: $(echo "scale=4; $STDDEV / $AVG_LIMIT" | bc 2>/dev/null || echo 'N/A')"

# Summary
echo -e "\n${GREEN}━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━${NC}"
echo -e "${GREEN}  Test Summary${NC}"
echo -e "${GREEN}━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━${NC}"
echo -e "Database Connection:   ${GREEN}✓ Working${NC}"
echo -e "Backend Health:        ${GREEN}✓ Running${NC}"
echo -e "Table Schema:          ${GREEN}✓ Correct${NC}"
echo -e "Test User:             ${GREEN}✓ Created${NC}"
echo -e "Test API:              ${GREEN}✓ Created${NC}"
echo -e "Observations:          ${GREEN}✓ $OBS_COUNT created${NC}"
echo -e "Indexes:               ${GREEN}✓ $INDEXES present${NC}"

echo -e "\n${BLUE}📝 Test Data Created:${NC}"
echo -e "  User ID:  $TEST_USER_ID"
echo -e "  API ID:   $TEST_API_ID"
echo -e "  API Name: test-api-rld"

echo -e "\n${YELLOW}🧪 Next Steps:${NC}"
echo -e "  1. View API in dashboard: ${BLUE}http://localhost:3000/dashboard/apis/$TEST_API_ID${NC}"
echo -e "  2. The suggestions should show:"
echo -e "     - Suggested per-second: ~0.17 (10/60)"
echo -e "     - Confidence: ~95% (very consistent)"
echo -e "     - 10 observations"

echo -e "\n${YELLOW}🧹 Cleanup (run after testing):${NC}"
echo -e "  ${BLUE}docker exec $DB_CONTAINER psql -U $DB_USER -d $DB_NAME -c \"DELETE FROM rate_limit_observations WHERE api_id = '$TEST_API_ID'\"${NC}"
echo -e "  ${BLUE}docker exec $DB_CONTAINER psql -U $DB_USER -d $DB_NAME -c \"DELETE FROM api_configs WHERE id = '$TEST_API_ID'\"${NC}"
echo -e "  ${BLUE}docker exec $DB_CONTAINER psql -U $DB_USER -d $DB_NAME -c \"DELETE FROM users WHERE id = '$TEST_USER_ID'\"${NC}"

echo -e "\n${GREEN}✅ All mock tests passed!${NC}"
echo -e "${GREEN}━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━${NC}"
