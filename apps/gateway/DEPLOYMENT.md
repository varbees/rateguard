# Deployment Guide for Render

This guide details how to deploy `rateguard` to Render using the Docker runtime.

## 1. Service Configuration

Use the following settings on the "New Web Service" page:

| Setting | Value | Notes |
|---------|-------|-------|
| **Source Code** | `varbees/rateguard` | Your repository |
| **Name** | `rateguard` | Or your preferred name |
| **Language** | **Docker** | **IMPORTANT:** Select Docker, not Go |
| **Branch** | `main` | Or your production branch |
| **Region** | `Singapore (Southeast Asia)` | Close to your database |
| **Dockerfile Path** | `./Dockerfile` | Default is correct |
| **Context Directory** | `.` | Default is correct |

## 2. Environment Variables

Copy these values from your updated `.env.example` file. 

**Critical Variables:**

| Key | Value / Source |
|-----|----------------|
| `SERVER_PORT` | `8080` (Matches Dockerfile EXPOSE) |
| `DB_HOST` | `dpg-d4jgkj6mcj7s73bhqasg-a.singapore-postgres.render.com` |
| `DB_PORT` | `5432` |
| `DB_USER` | `rateguard` |
| `DB_PASSWORD` | `LWRk2DJbckj14OpGAnjryCzYzUBhOzVn` |
| `DB_NAME` | `rateguard` |
| `DB_SSL_MODE` | `require` |
| `REDIS_HOST` | `red-d4jgjg6r433s739cnd4g` |
| `REDIS_PORT` | `6379` |
| `JWT_SECRET` | *(Copy from .env.example)* |
| `API_KEY_ADMIN` | *(Copy from .env.example)* |
| `ENCRYPTION_KEY` | *(Copy from .env.example)* |

**Performance Tuning (Production):**

| Key | Value |
|-----|-------|
| `AGG_WORKER_POOL_WORKER_COUNT` | `50` |
| `AGG_LOGGING_LEVEL` | `info` |
| `AGG_LOGGING_FORMAT` | `json` |

## 3. Database Migrations

**IMPORTANT:** You must run migrations on the fresh production database.

1.  Wait for the service to deploy successfully.
2.  Go to the **Shell** tab in your Render dashboard.
3.  Run the migration command:
    ```bash
    ./aggregator migrate up
    ```
    *Note: If the binary doesn't support direct migration commands, you may need to use a separate migration tool or connect externally.*

## 4. Instance Sizing

Based on our load tests, here are the recommended instance types:

| Plan Tier | Traffic | Recommended Instance | RAM | CPU |
|-----------|---------|----------------------|-----|-----|
| **Starter** | < 100k req/day | **Starter** | 512 MB | 0.5 CPU |
| **Growth** | ~1M req/day | **Standard** | 2 GB | 1 CPU |
| **Scale** | > 10M req/day | **Pro** | 4 GB | 2 CPU |

*Note: The application is highly efficient. Start with **Starter** and upgrade if memory usage exceeds 400MB.*

## 4. Health Check

Configure the health check to ensure zero-downtime deployments:

- **Health Check Path:** `/health`
- **Timeout:** `3s` (default)
- **Interval:** `30s` (default)

## 5. Troubleshooting

If the deployment fails:

1.  **Check Logs:** Look for "migrations failed" or "database connection error".
2.  **Verify Network:** Ensure the Render service is in the same region as the database/redis if using internal URLs.
3.  **Port Mismatch:** Ensure `SERVER_PORT` is set to `8080` (Render expects 8080 by default for Docker).

## 6. Post-Deployment Verification

After deployment is green:

1.  Visit `https://<your-app-name>.onrender.com/health` -> Should return `{"status":"ok",...}`
2.  Use your Admin API Key to configure the first service.
