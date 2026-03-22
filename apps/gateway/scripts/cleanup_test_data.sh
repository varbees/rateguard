#!/bin/bash

# Cleanup script for Rate Limit Discovery test data

set -e

# Colors
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
NC='\033[0m'

# Configuration
DB_CONTAINER="${DB_CONTAINER:-rateguard-postgres}"
DB_NAME="${DB_NAME:-rateguard}"
DB_USER="${DB_USER:-postgres}"

echo -e "${YELLOW}🧹 Cleaning up test data...${NC}"

# Delete test observations
OBS_DELETED=$(docker exec $DB_CONTAINER psql -U $DB_USER -d $DB_NAME -tAc \
    "DELETE FROM rate_limit_observations 
     WHERE user_id IN (SELECT id FROM users WHERE email = 'test-rld@example.com')
     RETURNING id" | wc -l | tr -d ' ')

echo -e "${GREEN}✓${NC} Deleted $OBS_DELETED observations"

# Delete test API configs
API_DELETED=$(docker exec $DB_CONTAINER psql -U $DB_USER -d $DB_NAME -tAc \
    "DELETE FROM api_configs 
     WHERE user_id IN (SELECT id FROM users WHERE email = 'test-rld@example.com')
     RETURNING id" | wc -l | tr -d ' ')

echo -e "${GREEN}✓${NC} Deleted $API_DELETED API configs"

# Delete test user
USER_DELETED=$(docker exec $DB_CONTAINER psql -U $DB_USER -d $DB_NAME -tAc \
    "DELETE FROM users WHERE email = 'test-rld@example.com'
     RETURNING id" | wc -l | tr -d ' ')

echo -e "${GREEN}✓${NC} Deleted $USER_DELETED test users"

echo -e "${GREEN}✅ Cleanup complete!${NC}"
