#!/bin/bash

# RateGuard Test Data Cleanup Script
# Removes test users and their associated data from the database

set -e

# Colors
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
RED='\033[0;31m'
BLUE='\033[0;34m'
NC='\033[0m'

# Database configuration (from environment or defaults)
DB_HOST="${DB_HOST:-localhost}"
DB_PORT="${DB_PORT:-5432}"
DB_USER="${DB_USER:-rateguard}"
DB_NAME="${DB_NAME:-rateguard}"

echo -e "${BLUE}🧹 RateGuard Test Data Cleanup${NC}"
echo -e "${BLUE}===============================${NC}"
echo ""

# Check if PostgreSQL is accessible
if ! PGPASSWORD="$DB_PASSWORD" psql -h "$DB_HOST" -p "$DB_PORT" -U "$DB_USER" -d "$DB_NAME" -c "SELECT 1;" > /dev/null 2>&1; then
    echo -e "${RED}✗${NC} Cannot connect to database"
    echo "  Host: $DB_HOST:$DB_PORT"
    echo "  Database: $DB_NAME"
    echo "  User: $DB_USER"
    echo ""
    echo "Make sure:"
    echo "  1. PostgreSQL is running"
    echo "  2. DB_PASSWORD environment variable is set"
    echo "  3. Database credentials are correct"
    exit 1
fi

echo -e "${GREEN}✓${NC} Connected to database: $DB_NAME@$DB_HOST"
echo ""

# Count test users
TEST_USER_COUNT=$(PGPASSWORD="$DB_PASSWORD" psql -h "$DB_HOST" -p "$DB_PORT" -U "$DB_USER" -d "$DB_NAME" -t -c "
    SELECT COUNT(*) 
    FROM users 
    WHERE email LIKE '%_test_%@rateguard.test';
" | xargs)

if [ "$TEST_USER_COUNT" == "0" ]; then
    echo -e "${YELLOW}ℹ${NC} No test users found"
    exit 0
fi

echo -e "${YELLOW}→${NC} Found $TEST_USER_COUNT test user(s)"
echo ""

# List test users
echo "Test users to be deleted:"
PGPASSWORD="$DB_PASSWORD" psql -h "$DB_HOST" -p "$DB_PORT" -U "$DB_USER" -d "$DB_NAME" -c "
    SELECT 
        email,
        plan,
        created_at
    FROM users 
    WHERE email LIKE '%_test_%@rateguard.test'
    ORDER BY created_at DESC;
"

echo ""
read -p "Delete all test users and their data? [y/N] " -n 1 -r
echo ""

if [[ ! $REPLY =~ ^[Yy]$ ]]; then
    echo -e "${YELLOW}Cancelled${NC}"
    exit 0
fi

echo ""
echo -e "${YELLOW}→${NC} Deleting test users and cascading data..."

# Delete test users (cascades to api_configs and usage_logs due to foreign keys)
DELETED_COUNT=$(PGPASSWORD="$DB_PASSWORD" psql -h "$DB_HOST" -p "$DB_PORT" -U "$DB_USER" -d "$DB_NAME" -t -c "
    WITH deleted AS (
        DELETE FROM users 
        WHERE email LIKE '%_test_%@rateguard.test'
        RETURNING id
    )
    SELECT COUNT(*) FROM deleted;
" | xargs)

echo -e "${GREEN}✓${NC} Deleted $DELETED_COUNT test user(s)"

# Clean up test result files
if [ -d "test-results" ]; then
    echo -e "${YELLOW}→${NC} Cleaning up test result files..."
    find test-results -type f -name "*.json" -delete 2>/dev/null || true
    find test-results -type f -name "*.txt" -delete 2>/dev/null || true
    echo -e "${GREEN}✓${NC} Test result files cleaned"
fi

echo ""
echo -e "${GREEN}✓ Cleanup complete!${NC}"
echo ""
