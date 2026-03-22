# RateGuard Scripts

These are low-level helper scripts for manual debugging and legacy workflows.
The canonical developer entry points are the root `task` commands:

- `task dev`
- `task ui:dev`
- `task test`
- `task smoke`
- `task openapi:generate`

Use the scripts directly only when you need to reproduce a specific backend flow outside the task runner.

## Script Index

- `run.sh` - manual Go runner for dev/prod/local Docker Compose experimentation
- `test.sh` - direct `go test` wrapper with coverage and race detection
- `setup_db.sh` - manual PostgreSQL bootstrap plus migrations
- `smoke.sh` - release smoke check against a live backend
- `cleanup-test-data.sh` / `cleanup_test_data.sh` - cleanup helpers for test fixtures
- `test_rate_limit_discovery_mock.sh` - database-seeded Rate Limit Discovery demo test
- `test_rate_limit_discovery.sh` - live Rate Limit Discovery test harness
- `test_ratelimit_multitier.sh` - multi-tier rate-limit test helper
- `test_cors.sh` - CORS validation helper
- `test_encryption.sh` - encryption validation helper
- `test_new_features.sh` - feature regression helper
- `test_usage_percentages.sh` - usage-percentage helper

## Notes

- `task dev` is the preferred way to boot the local stack.
- `task smoke` is the preferred release check.
- `run.sh` and the feature-specific helpers remain for manual inspection and regression reproduction.
