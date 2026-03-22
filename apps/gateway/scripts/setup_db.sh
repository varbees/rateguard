#!/bin/bash

# RateGuard Database Setup Script
# This script initializes PostgreSQL database for RateGuard

set -e

# Configuration
DB_NAME="${RATEGUARD_DB_NAME:-rateguard}"
DB_USER="${RATEGUARD_DB_USER:-rateguard}"
DB_PASSWORD="${RATEGUARD_DB_PASSWORD:-rateguard_dev_password}"
DB_HOST="${RATEGUARD_DB_HOST:-localhost}"
DB_PORT="${RATEGUARD_DB_PORT:-5432}"

echo "🚀 RateGuard Database Setup"
echo "================================"
echo "Database: $DB_NAME"
echo "User: $DB_USER"
echo "Host: $DB_HOST:$DB_PORT"
echo ""

# Check if PostgreSQL is running
if ! pg_isready -h "$DB_HOST" -p "$DB_PORT" > /dev/null 2>&1; then
    echo "❌ PostgreSQL is not running on $DB_HOST:$DB_PORT"
    echo "Please start PostgreSQL and try again."
    exit 1
fi

echo "✅ PostgreSQL is running"

# Create database and user (requires postgres superuser)
echo "📦 Creating database and user..."

PGPASSWORD="${POSTGRES_PASSWORD:-postgres}" psql -h "$DB_HOST" -p "$DB_PORT" -U postgres -c "CREATE DATABASE $DB_NAME;" 2>/dev/null || echo "Database already exists"
PGPASSWORD="${POSTGRES_PASSWORD:-postgres}" psql -h "$DB_HOST" -p "$DB_PORT" -U postgres -c "CREATE USER $DB_USER WITH PASSWORD '$DB_PASSWORD';" 2>/dev/null || echo "User already exists"
PGPASSWORD="${POSTGRES_PASSWORD:-postgres}" psql -h "$DB_HOST" -p "$DB_PORT" -U postgres -c "GRANT ALL PRIVILEGES ON DATABASE $DB_NAME TO $DB_USER;"
PGPASSWORD="${POSTGRES_PASSWORD:-postgres}" psql -h "$DB_HOST" -p "$DB_PORT" -U postgres -d "$DB_NAME" -c "GRANT ALL ON SCHEMA public TO $DB_USER;"

echo "✅ Database and user created"

# Run migrations
echo "🔄 Running migrations..."

MIGRATIONS_DIR="$(dirname "$0")/../migrations"

for migration in "$MIGRATIONS_DIR"/*.sql; do
    if [ -f "$migration" ]; then
        echo "  📄 Running: $(basename "$migration")"
        PGPASSWORD="$DB_PASSWORD" psql -h "$DB_HOST" -p "$DB_PORT" -U "$DB_USER" -d "$DB_NAME" -f "$migration"
    fi
done

echo "✅ Migrations completed"

# Verify setup
echo "🔍 Verifying setup..."

TABLE_COUNT=$(PGPASSWORD="$DB_PASSWORD" psql -h "$DB_HOST" -p "$DB_PORT" -U "$DB_USER" -d "$DB_NAME" -t -c "SELECT COUNT(*) FROM information_schema.tables WHERE table_schema = 'public' AND table_type = 'BASE TABLE';")

echo "✅ Found $TABLE_COUNT tables"

# Display connection string
echo ""
echo "🎉 Database setup complete!"
echo ""
echo "Connection string:"
echo "postgresql://$DB_USER:$DB_PASSWORD@$DB_HOST:$DB_PORT/$DB_NAME?sslmode=disable"
echo ""
echo "Environment variables:"
echo "export RATEGUARD_DB_HOST=$DB_HOST"
echo "export RATEGUARD_DB_PORT=$DB_PORT"
echo "export RATEGUARD_DB_NAME=$DB_NAME"
echo "export RATEGUARD_DB_USER=$DB_USER"
echo "export RATEGUARD_DB_PASSWORD=$DB_PASSWORD"
