# Migration 015 Testing Guide

## Migration Files Created

✅ `migrations/015_add_api_keys_table.up.sql`  
✅ `migrations/015_add_api_keys_table.down.sql`

---

## What the Migration Does

### Creates `api_keys` Table
```sql
CREATE TABLE api_keys (
    id UUID PRIMARY KEY,
    user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    key_name VARCHAR(255) NOT NULL,
    api_key VARCHAR(64) UNIQUE NOT NULL,
    created_at TIMESTAMP NOT NULL DEFAULT NOW(),
    last_used_at TIMESTAMP,
    revoked_at TIMESTAMP,
    CONSTRAINT unique_user_key_name UNIQUE(user_id, key_name)
);
```

### Adds Performance Indexes
- `idx_api_keys_user_id` - Fast user lookup
- `idx_api_keys_key` - Fast auth (WHERE revoked_at IS NULL)
- `idx_api_keys_user_active` - Fast active keys per user

### Migrates Existing Data
```sql
INSERT INTO api_keys (user_id, key_name, api_key, created_at)
SELECT id, 'Primary Key', api_key, created_at
FROM users
WHERE api_key IS NOT NULL AND api_key != '';
```

### Preserves Backwards Compatibility
- ✅ `users.api_key` column **NOT dropped**
- ✅ Existing API keys continue working
- ✅ Safe rollback available

---

## Testing Locally

### Option 1: Using golang-migrate CLI

```bash
# Install migrate if not already installed
brew install golang-migrate  # macOS
# or
go install -tags 'postgres' github.com/golang-migrate/migrate/v4/cmd/migrate@latest

# Run migration
migrate -path ./migrations -database "postgresql://user:pass@localhost:5432/dbname?sslmode=disable" up 1

# Verify
psql -d dbname -c "\d api_keys"
psql -d dbname -c "SELECT COUNT(*) FROM api_keys;"

# Test rollback
migrate -path ./migrations -database "postgresql://user:pass@localhost:5432/dbname?sslmode=disable" down 1
```

### Option 2: Manual SQL Execution

```bash
# Connect to database
psql -d your_database_name

# Run migration
\i migrations/015_add_api_keys_table.up.sql

# Verify table created
\d api_keys

# Check data migrated
SELECT user_id, key_name, LEFT(api_key, 10) as key_preview, created_at 
FROM api_keys;

# Test rollback
\i migrations/015_add_api_keys_table.down.sql
```

### Option 3: Using Docker Compose

```bash
# If using docker-compose with postgres
docker-compose exec postgres psql -U postgres -d rateguard

# Then run migration SQL manually
\i /path/to/migrations/015_add_api_keys_table.up.sql
```

---

## Verification Checklist

After running migration:

- [ ] Table `api_keys` exists
- [ ] Indexes created (3 total)
- [ ] Existing users' API keys migrated
- [ ] `users.api_key` column still exists
- [ ] Unique constraints work (try duplicate key_name)
- [ ] Foreign key cascade works (delete user → keys deleted)

**SQL Verification**:
```sql
-- Check table structure
\d api_keys

-- Count migrated keys
SELECT COUNT(*) FROM api_keys;

-- Verify all users have keys
SELECT u.email, ak.key_name, LEFT(ak.api_key, 10) as preview
FROM users u
LEFT JOIN api_keys ak ON u.id = ak.user_id
WHERE u.api_key IS NOT NULL;

-- Check indexes
\di api_keys*
```

---

## Rollback Test

```bash
# Run down migration
migrate -path ./migrations -database $DATABASE_URL down 1

# Verify
psql -d dbname -c "\d api_keys"  # Should not exist
psql -d dbname -c "SELECT api_key FROM users LIMIT 1;"  # Should still exist
```

---

## Production Deployment

### Pre-Deployment
1. Backup database
2. Test migration on staging
3. Verify rollback works on staging

### Deployment Steps
```bash
# On production server
migrate -path ./migrations -database $DATABASE_URL up 1

# Monitor logs
tail -f /var/log/postgres/postgres.log

# Verify
psql $DATABASE_URL -c "SELECT COUNT(*) FROM api_keys;"
```

### Post-Deployment
- Monitor authentication errors
- Check `last_used_at` updates
- Verify no performance degradation

---

## Phase 2 Complete ✅

Migration files ready for deployment. Next: **Phase 3 - Backend Models & Storage**
