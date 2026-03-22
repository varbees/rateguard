# RateGuard: System Architecture & Design

## Technical Deep Dive - Proxy, Rate Limiting, CORS, Link Generation

**Version:** 2.0  
**Last Updated:** November 25, 2025  
**Status:** Production-Ready with Settings & Billing Integration

---

## TABLE OF CONTENTS

1. [Architecture Overview](#architecture-overview)
2. [User Management & Authentication](#user-management--authentication)
3. [Settings & Preferences System](#settings--preferences-system)
4. [Billing System Integration](#billing-system-integration)
5. [Link Generation System](#link-generation-system)
6. [Proxy Request Handler](#proxy-request-handler)
7. [Rate Limiting Engine](#rate-limiting-engine)
8. [CORS Handling System](#cors-handling-system)
9. [Security Architecture](#security-architecture)
10. [Scalability Strategy](#scalability-strategy)

---

## ARCHITECTURE OVERVIEW

### High-Level System Diagram

```
┌──────────────────────────────────────────────────────────────────┐
│                     USER'S APPLICATION                            │
│           (React, Vue, Mobile, Backend Service)                   │
└──────────────────────┬───────────────────────────────────────────┘
                       │
                       │ API Request
                       │ GET/POST/PUT https://rateguard.domain/p/{projectId}/{provider}/{endpoint}
                       │ Headers: Authorization: Bearer rg_token_xyz
                       │
                       ▼
┌──────────────────────────────────────────────────────────────────┐
│                     RATEGUARD PLATFORM                            │
│  ┌────────────────────────────────────────────────────────────┐  │
│  │              1. INGRESS LAYER (Load Balancer)              │  │
│  │  - TLS termination                                         │  │
│  │  - DDoS protection (Cloudflare/Railway)                    │  │
│  │  - Request routing                                         │  │
│  └──────────────────────────┬─────────────────────────────────┘  │
│                             │                                     │
│                             ▼                                     │
│  ┌────────────────────────────────────────────────────────────┐  │
│  │           2. PROXY HANDLER (Node.js/Go)                    │  │
│  │  ┌────────────────────────────────────────────────────┐   │  │
│  │  │ a. URL Parser                                       │   │  │
│  │  │    - Extract: /p/{projectId}/{provider}/{endpoint} │   │  │
│  │  │    - Validate projectId format                      │   │  │
│  │  │    - Map provider to target URL                     │   │  │
│  │  └────────────────────────────────────────────────────┘   │  │
│  │  ┌────────────────────────────────────────────────────┐   │  │
│  │  │ b. CORS Preflight Handler                          │   │  │
│  │  │    - Check Origin header                            │   │  │
│  │  │    - Fetch project's whitelist from cache/DB        │   │  │
│  │  │    - Set Access-Control-* headers                   │   │  │
│  │  │    - Return 204 for OPTIONS requests                │   │  │
│  │  └────────────────────────────────────────────────────┘   │  │
│  │  ┌────────────────────────────────────────────────────┐   │  │
│  │  │ c. Auth & Project Lookup                           │   │  │
│  │  │    - Extract RG token from Authorization header    │   │  │
│  │  │    - Validate token (JWT or API key)               │   │  │
│  │  │    - Fetch project config from database            │   │  │
│  │  │    - Check project status (active/suspended)        │   │  │
│  │  └────────────────────────────────────────────────────┘   │  │
│  └──────────────────────────┬─────────────────────────────────┘  │
│                             │                                     │
│                             ▼                                     │
│  ┌────────────────────────────────────────────────────────────┐  │
│  │           3. RATE LIMITER (Redis + Algorithm)              │  │
│  │  ┌────────────────────────────────────────────────────┐   │  │
│  │  │ a. Request Counter                                  │   │  │
│  │  │    - Key: project:{id}:minute:{timestamp}           │   │  │
│  │  │    - INCR counter atomically                        │   │  │
│  │  │    - Check current count vs limit                   │   │  │
│  │  └────────────────────────────────────────────────────┘   │  │
│  │  ┌────────────────────────────────────────────────────┐   │  │
│  │  │ b. Limit Enforcement                               │   │  │
│  │  │    - If under limit: allow request                  │   │  │
│  │  │    - If over limit: return 429 (Too Many Requests)  │   │  │
│  │  │    - Include Retry-After header                     │   │  │
│  │  └────────────────────────────────────────────────────┘   │  │
│  │  ┌────────────────────────────────────────────────────┐   │  │
│  │  │ c. Multi-Tier Limits                               │   │  │
│  │  │    - Per-minute limit (burst protection)            │   │  │
│  │  │    - Per-hour limit (sustained usage)               │   │  │
│  │  │    - Per-day limit (cost control)                   │   │  │
│  │  └────────────────────────────────────────────────────┘   │  │
│  └──────────────────────────┬─────────────────────────────────┘  │
│                             │                                     │
│                             ▼                                     │
│  ┌────────────────────────────────────────────────────────────┐  │
│  │           4. CREDENTIALS INJECTOR                          │  │
│  │  - Fetch encrypted API key from database                  │  │
│  │  - Decrypt in memory (AES-256-GCM)                         │  │
│  │  - Replace/add Authorization header                        │  │
│  │  - Never log plaintext key                                 │  │
│  └──────────────────────────┬─────────────────────────────────┘  │
│                             │                                     │
│                             ▼                                     │
│  ┌────────────────────────────────────────────────────────────┐  │
│  │           5. PROXY FORWARDER (HTTP Client)                 │  │
│  │  - Build target URL (provider base + endpoint)             │  │
│  │  - Copy request body, headers, query params                │  │
│  │  - Forward to target API                                   │  │
│  │  - Stream response back to client                          │  │
│  │  - Preserve status codes, headers (except hop-by-hop)      │  │
│  └──────────────────────────┬─────────────────────────────────┘  │
│                             │                                     │
│                             ▼                                     │
│  ┌────────────────────────────────────────────────────────────┐  │
│  │           6. USAGE TRACKER & ANALYTICS                     │  │
│  │  - Log request metadata (async, non-blocking)              │  │
│  │  - Increment counters (requests, bytes, cost)              │  │
│  │  - Update dashboard metrics (real-time)                    │  │
│  │  - Check budget alerts                                     │  │
│  └────────────────────────────────────────────────────────────┘  │
│                             │                                     │
│                             ▼                                     │
│  ┌────────────────────────────────────────────────────────────┐  │
│  │           7. SETTINGS & PREFERENCES LAYER                  │  │
│  │  - User profile management                                 │  │
│  │  - Notification preferences (email, alerts, reports)       │  │
│  │  - API key regeneration with secure random generation      │  │
│  │  - Password change with verification                       │  │
│  │  - Account settings and preferences                        │  │
│  └────────────────────────────────────────────────────────────┘  │
│                             │                                     │
│                             ▼                                     │
│  ┌────────────────────────────────────────────────────────────┐  │
│  │           8. BILLING & SUBSCRIPTION LAYER                  │  │
│  │  - Plan management (Free, Pro, Enterprise)                 │  │
│  │  - Payment processing (Razorpay for India, Stripe global)  │  │
│  │  - Usage-based billing and cost tracking                   │  │
│  │  - Webhook event handling for payment updates              │  │
│  │  - Subscription lifecycle management                       │  │
│  └────────────────────────────────────────────────────────────┘  │
└──────────────────────────────────────────────────────────────────┘
                             │
                             │ Proxied Response
                             │ Status: 200, Body: {...}, Headers: {...}
                             │
                             ▼
┌──────────────────────────────────────────────────────────────────┐
│           TARGET API (OpenAI, Stripe, Google, etc.)              │
└──────────────────────────────────────────────────────────────────┘
```

---

## USER MANAGEMENT & AUTHENTICATION

### JWT-Based Authentication Flow

**User Registration & Login:**

```
1. User signs up with email/password
2. Backend validates and hashes password (bcrypt)
3. JWT token generated with 24-hour expiry
4. Token stored in httpOnly cookie (secure, SameSite)
5. API key generated for programmatic access (rg_* format)
6. User can regenerate API key anytime
```

**Authentication Middleware:**

```go
// All protected endpoints require valid JWT in httpOnly cookie
// Middleware validates token and extracts user context
// User info attached to request for downstream handlers
```

### API Key Management

**Secure API Key Generation:**

- Uses `crypto/rand` for cryptographic randomness
- Format: `rg_` prefix + 48 hex characters (192 bits entropy)
- Stored hashed in database (never plaintext)
- Can be regenerated anytime (old key invalidated immediately)
- Used for programmatic access and rate limiting

---

## SETTINGS & PREFERENCES SYSTEM

### User Settings Endpoints

**GET `/api/v1/dashboard/settings`**

- Returns user profile (email, plan, country, currency)
- Returns notification preferences
- Requires JWT authentication

**PUT `/api/v1/dashboard/settings`**

- Updates notification preferences
- Supports partial updates
- Validates threshold percentages (0-100)

**POST `/api/v1/dashboard/settings/password`**

- Change password with current password verification
- Validates new password (minimum 8 characters)
- Uses bcrypt for hashing
- Returns clear error messages

**POST `/api/v1/dashboard/api-key/regenerate`**

- Generates new secure API key
- Invalidates old key immediately
- Returns new key to user (only time it's shown)
- Logs key regeneration event

### Notification Preferences

**Database Schema:**

```sql
notification_preferences (
  id UUID PRIMARY KEY,
  user_id UUID UNIQUE,
  email_alerts BOOLEAN DEFAULT true,
  usage_threshold_percent INTEGER DEFAULT 80,
  error_alerts BOOLEAN DEFAULT true,
  weekly_report BOOLEAN DEFAULT false,
  created_at TIMESTAMP,
  updated_at TIMESTAMP
)
```

**Supported Preferences:**

- Email alerts for usage thresholds
- Configurable threshold percentage (0-100%)
- Error notifications
- Weekly usage reports
- Budget alerts

---

## BILLING SYSTEM INTEGRATION

### Multi-Provider Payment Processing

**Razorpay (India Market):**

- Handles INR payments
- Webhook integration for payment events
- Subscription management
- Refund handling

**Stripe (Global Market):**

- Handles USD and international payments
- Webhook integration for payment events
- Subscription management
- Refund handling

### Plan Structure

**Free Plan:**

- 10 requests/second
- 20 burst size
- 3 APIs max
- 10,000 requests/month
- $0/month

**Pro Plan:**

- 100 requests/second
- 200 burst size
- 20 APIs max
- 1,000,000 requests/month
- $99/month

**Enterprise Plan:**

- 1000 requests/second
- 2000 burst size
- Unlimited APIs
- Unlimited requests
- Custom pricing

### Usage-Based Billing

**Cost Calculation:**

- Tracks requests per API
- Estimates costs based on provider pricing
- Supports multiple pricing models (per-request, per-token, etc.)
- Real-time cost tracking

**Billing Events:**

- Payment successful
- Payment failed
- Subscription created
- Subscription updated
- Subscription cancelled
- Refund issued

---

## LINK GENERATION SYSTEM

### Problem Statement

**How do we give each user/project a unique proxy URL that:**

1. Routes correctly to their project configuration
2. Is easy to copy/paste into their code
3. Doesn't expose sensitive IDs or leak data
4. Works with existing API client libraries (no custom SDK needed)
5. Supports multiple API providers from one domain

### Solution: Path-Based Project Routing

**Format:**

```
https://rateguard.yourdomain.com/p/{projectId}/{provider}/{endpoint}

Examples:
https://rateguard.yourdomain.com/p/abc123xyz/openai/v1/chat/completions
https://rateguard.yourdomain.com/p/def456uvw/stripe/v1/charges
https://rateguard.yourdomain.com/p/ghi789rst/google/v1/speech:recognize
```

**Why this format:**

- ✅ **Human-readable:** User sees provider name in URL
- ✅ **API-agnostic:** Works with any REST API
- ✅ **Client-library compatible:** No special client needed
- ✅ **Easy to debug:** Clear what's being called
- ✅ **Secure:** Project ID is opaque (not sequential)

### Implementation: Project Creation Flow

**Step 1: User Creates Project (Frontend)**

```typescript
// Frontend: Project creation form
interface CreateProjectInput {
  name: string;
  provider: 'openai' | 'stripe' | 'google' | 'anthropic' | 'custom';
  apiKey: string;
  rateLimits: {
    perMinute: number;
    perHour: number;
    perDay: number;
  };
  corsWhitelist: string[]; // ['https://myapp.com', 'http://localhost:3000']
  callbackUrls?: string[]; // For OAuth flows
}

async function createProject(input: CreateProjectInput) {
  const response = await fetch('/api/projects', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${userToken}`
    },
    body: JSON.stringify(input)
  });

  const project = await response.json();
  return project;
}

// Response:
{
  id: 'uuid-here',
  name: 'My SaaS App',
  provider: 'openai',
  proxyUrl: 'https://rateguard.yourdomain.com/p/abc123xyz',
  apiToken: 'rg_live_xxxxxxxxxxxxxxxx', // For Authorization header
  rateLimits: { perMinute: 60, perHour: 3000, perDay: 50000 },
  status: 'active',
  createdAt: '2025-11-22T17:00:00Z'
}
```

**Step 2: Backend Generates Short ID**

```javascript
// Backend: Generate short, collision-resistant ID
const crypto = require("crypto");

function generateProjectShortId() {
  // Generate random bytes, encode as URL-safe base64
  const bytes = crypto.randomBytes(9); // 72 bits
  const shortId = bytes
    .toString("base64")
    .replace(/\+/g, "-")
    .replace(/\//g, "_")
    .replace(/=/g, ""); // Remove padding

  return shortId; // e.g., "abc123xyz" (12 chars)
}

// Usage:
const shortId = generateProjectShortId();
const proxyUrl = `https://rateguard.yourdomain.com/p/${shortId}`;

// Store mapping in database:
await db.projects.create({
  id: uuid(),
  user_id: userId,
  short_id: shortId, // Indexed for fast lookup
  name: input.name,
  provider: input.provider,
  encrypted_api_key: encryptAES256(input.apiKey),
  rate_limit_per_minute: input.rateLimits.perMinute,
  rate_limit_per_hour: input.rateLimits.perHour,
  rate_limit_per_day: input.rateLimits.perDay,
  cors_whitelist: JSON.stringify(input.corsWhitelist),
  callback_urls: JSON.stringify(input.callbackUrls || []),
  status: "active",
});
```

**Step 3: Generate API Token for User**

```javascript
// Backend: Generate API token for Authorization header
// This token identifies the project and is used for rate limiting

function generateAPIToken(projectId, userId) {
  const payload = {
    projectId: projectId,
    userId: userId,
    iat: Math.floor(Date.now() / 1000),
    exp: Math.floor(Date.now() / 1000) + 365 * 24 * 60 * 60, // 1 year
  };

  const token = jwt.sign(payload, process.env.JWT_SECRET);
  return `rg_live_${token}`;
}

// Store token in database:
await db.api_tokens.create({
  id: uuid(),
  project_id: projectId,
  user_id: userId,
  token: tokenHash(token), // Store hashed version
  prefix: "rg_live_", // For display/revocation
  last_4: token.slice(-4), // For user identification
  status: "active",
  created_at: new Date(),
});
```

**Step 4: User Sees Proxy URL + Instructions**

```jsx
// Frontend: Display generated URL with copy button
function ProjectDetailPage({ project }) {
  const proxyBaseUrl = `${RATEGUARD_DOMAIN}/p/${project.short_id}`;

  const exampleCode = `
// Replace your original API endpoint with RateGuard proxy:
// Before:
const response = await fetch('https://api.openai.com/v1/chat/completions', {
  headers: { 'Authorization': 'Bearer sk-...' }
});

// After:
const response = await fetch('${proxyBaseUrl}/openai/v1/chat/completions', {
  headers: { 'Authorization': 'Bearer ${project.api_token}' }
});
  `.trim();

  return (
    <div className="project-detail">
      <h2>{project.name}</h2>

      <div className="proxy-url-section">
        <label>Your Proxy URL:</label>
        <div className="url-display">
          <code>{proxyBaseUrl}</code>
          <button onClick={() => copyToClipboard(proxyBaseUrl)}>Copy</button>
        </div>
        <p className="help-text">
          Use this as the base URL for all API calls. Append the provider and
          endpoint path.
        </p>
      </div>

      <div className="api-token-section">
        <label>Your API Token:</label>
        <div className="token-display">
          <code>{project.api_token}</code>
          <button onClick={() => copyToClipboard(project.api_token)}>
            Copy
          </button>
        </div>
        <p className="help-text">
          Use this in the Authorization header. We manage your actual API key
          securely.
        </p>
      </div>

      <div className="code-example">
        <h3>Integration Example:</h3>
        <pre>
          <code>{exampleCode}</code>
        </pre>
      </div>

      <div className="usage-stats">
        <h3>Usage Today:</h3>
        <p>
          {project.requests_today} / {project.rate_limit_per_day} requests
        </p>
        <ProgressBar
          current={project.requests_today}
          max={project.rate_limit_per_day}
        />
      </div>
    </div>
  );
}
```

---

## PROXY REQUEST HANDLER

### Request Flow Implementation

**Step 1: Parse Incoming Request**

```javascript
// Express route handler
app.all("/p/:projectShortId/:provider/*", async (req, res) => {
  const startTime = Date.now();

  try {
    // 1. Extract parameters from URL
    const { projectShortId, provider } = req.params;
    const endpoint = req.params[0]; // Wildcard captures rest of path

    // Full incoming URL:
    // /p/abc123xyz/openai/v1/chat/completions?stream=true
    //    ^shortId  ^provider ^endpoint         ^query

    console.log("Proxy request:", {
      projectShortId,
      provider,
      endpoint,
      method: req.method,
      origin: req.headers.origin,
    });

    // 2. Validate project short ID format
    if (!/^[A-Za-z0-9_-]{12}$/.test(projectShortId)) {
      return res.status(400).json({ error: "Invalid project ID format" });
    }

    // Continue to next step...
  } catch (error) {
    console.error("Proxy error:", error);
    res.status(500).json({ error: "Internal proxy error" });
  }
});
```

**Step 2: CORS Preflight Handling**

```javascript
// CORS middleware (runs before main handler)
async function handleCORS(req, res, next) {
  const { projectShortId } = req.params;
  const origin = req.headers.origin;

  // Fetch project config (with caching)
  const project = await getProjectByShortId(projectShortId); // Cache hit likely

  if (!project) {
    return res.status(404).json({ error: "Project not found" });
  }

  // Check if origin is whitelisted
  const whitelist = JSON.parse(project.cors_whitelist || "[]");
  const isWhitelisted = whitelist.includes(origin) || whitelist.includes("*");

  if (isWhitelisted || !origin) {
    // Set CORS headers
    res.setHeader("Access-Control-Allow-Origin", origin || "*");
    res.setHeader(
      "Access-Control-Allow-Methods",
      "GET, POST, PUT, DELETE, PATCH, OPTIONS"
    );
    res.setHeader(
      "Access-Control-Allow-Headers",
      "Content-Type, Authorization, X-Requested-With"
    );
    res.setHeader("Access-Control-Allow-Credentials", "true");
    res.setHeader("Access-Control-Max-Age", "86400"); // Cache preflight for 24h
  } else {
    return res.status(403).json({
      error: "CORS policy violation",
      message: `Origin ${origin} not whitelisted for this project`,
    });
  }

  // Handle preflight OPTIONS request
  if (req.method === "OPTIONS") {
    return res.status(204).end(); // No content, just headers
  }

  // Attach project to request for next middleware
  req.project = project;
  next();
}

app.use("/p/:projectShortId/*", handleCORS);
```

**Step 3: Authentication & Authorization**

```javascript
// Auth middleware (runs after CORS)
async function authenticateRequest(req, res, next) {
  const authHeader = req.headers.authorization;

  if (!authHeader || !authHeader.startsWith("Bearer ")) {
    return res
      .status(401)
      .json({ error: "Missing or invalid Authorization header" });
  }

  const token = authHeader.substring(7); // Remove 'Bearer '

  if (!token.startsWith("rg_live_") && !token.startsWith("rg_test_")) {
    return res.status(401).json({ error: "Invalid RateGuard token format" });
  }

  // Validate token
  try {
    const tokenData = jwt.verify(token.substring(8), process.env.JWT_SECRET);

    // Check token matches project
    if (tokenData.projectId !== req.project.id) {
      return res.status(403).json({ error: "Token does not match project" });
    }

    // Check project status
    if (req.project.status !== "active") {
      return res.status(403).json({
        error: "Project suspended",
        reason: req.project.status_reason || "Payment failed or usage exceeded",
      });
    }

    // Attach user info for logging
    req.userId = tokenData.userId;
    req.projectId = req.project.id;

    next();
  } catch (error) {
    return res.status(401).json({ error: "Invalid or expired token" });
  }
}

app.use("/p/:projectShortId/*", authenticateRequest);
```

**Step 4: Rate Limiting Check**

```javascript
// Rate limiter middleware (runs after auth)
const Redis = require("ioredis");
const redis = new Redis(process.env.REDIS_URL);

async function rateLimitCheck(req, res, next) {
  const { projectId } = req;
  const now = Date.now();
  const minute = Math.floor(now / 60000); // Current minute timestamp
  const hour = Math.floor(now / 3600000); // Current hour timestamp
  const day = Math.floor(now / 86400000); // Current day timestamp

  // Redis keys for different time windows
  const minuteKey = `ratelimit:project:${projectId}:minute:${minute}`;
  const hourKey = `ratelimit:project:${projectId}:hour:${hour}`;
  const dayKey = `ratelimit:project:${projectId}:day:${day}`;

  try {
    // Atomic increment with pipeline
    const pipeline = redis.pipeline();
    pipeline.incr(minuteKey);
    pipeline.expire(minuteKey, 120); // Expire after 2 minutes
    pipeline.incr(hourKey);
    pipeline.expire(hourKey, 7200); // Expire after 2 hours
    pipeline.incr(dayKey);
    pipeline.expire(dayKey, 172800); // Expire after 2 days

    const results = await pipeline.exec();

    const minuteCount = results[0][1];
    const hourCount = results[2][1];
    const dayCount = results[4][1];

    // Check against limits
    const { rate_limit_per_minute, rate_limit_per_hour, rate_limit_per_day } =
      req.project;

    if (minuteCount > rate_limit_per_minute) {
      const retryAfter = 60 - (now % 60000) / 1000; // Seconds until next minute
      res.setHeader("Retry-After", Math.ceil(retryAfter));
      res.setHeader("X-RateLimit-Limit", rate_limit_per_minute);
      res.setHeader("X-RateLimit-Remaining", "0");
      res.setHeader(
        "X-RateLimit-Reset",
        Math.floor(now / 1000) + Math.ceil(retryAfter)
      );

      return res.status(429).json({
        error: "Rate limit exceeded",
        message: `You have exceeded ${rate_limit_per_minute} requests per minute`,
        retryAfter: Math.ceil(retryAfter),
      });
    }

    if (hourCount > rate_limit_per_hour) {
      return res.status(429).json({
        error: "Hourly rate limit exceeded",
        message: `You have exceeded ${rate_limit_per_hour} requests per hour`,
      });
    }

    if (dayCount > rate_limit_per_day) {
      return res.status(429).json({
        error: "Daily rate limit exceeded",
        message: `You have exceeded ${rate_limit_per_day} requests per day`,
      });
    }

    // Set rate limit headers (informational)
    res.setHeader("X-RateLimit-Limit", rate_limit_per_minute);
    res.setHeader("X-RateLimit-Remaining", rate_limit_per_minute - minuteCount);
    res.setHeader("X-RateLimit-Reset", Math.floor((minute + 1) * 60));

    // Attach counts for analytics
    req.rateLimitCounts = { minuteCount, hourCount, dayCount };

    next();
  } catch (error) {
    console.error("Rate limit check error:", error);
    // Fail open (allow request) on Redis errors
    next();
  }
}

app.use("/p/:projectShortId/*", rateLimitCheck);
```

**Step 5: Decrypt & Inject API Key**

```javascript
// Credentials injector
const crypto = require("crypto");

function decryptAPIKey(encryptedKey) {
  const algorithm = "aes-256-gcm";
  const key = Buffer.from(process.env.ENCRYPTION_KEY, "base64"); // 32 bytes

  const parts = encryptedKey.split(":");
  const iv = Buffer.from(parts[0], "hex");
  const tag = Buffer.from(parts[1], "hex");
  const encrypted = Buffer.from(parts[2], "hex");

  const decipher = crypto.createDecipheriv(algorithm, key, iv);
  decipher.setAuthTag(tag);

  let decrypted = decipher.update(encrypted);
  decrypted = Buffer.concat([decrypted, decipher.final()]);

  return decrypted.toString("utf8");
}

async function injectCredentials(req, res, next) {
  const { project } = req;

  try {
    // Decrypt user's API key (only in memory, never logged)
    const apiKey = decryptAPIKey(project.encrypted_api_key);

    // Inject into request headers based on provider
    switch (project.provider) {
      case "openai":
        req.headers.authorization = `Bearer ${apiKey}`;
        break;
      case "anthropic":
        req.headers["x-api-key"] = apiKey;
        req.headers["anthropic-version"] = "2023-06-01";
        break;
      case "google":
        req.headers.authorization = `Bearer ${apiKey}`;
        break;
      case "stripe":
        req.headers.authorization = `Bearer ${apiKey}`;
        break;
      default:
        req.headers.authorization = `Bearer ${apiKey}`;
    }

    // Remove RateGuard token (don't forward to target API)
    delete req.headers["authorization"];
    req.headers.authorization = `Bearer ${apiKey}`; // Replace with real key

    next();
  } catch (error) {
    console.error("Credentials injection error:", error);
    return res.status(500).json({ error: "Failed to decrypt API key" });
  }
}

app.use("/p/:projectShortId/*", injectCredentials);
```

**Step 6: Forward Request to Target API**

```javascript
// Proxy forwarder
const axios = require("axios");

// Provider base URLs
const PROVIDER_BASE_URLS = {
  openai: "https://api.openai.com",
  anthropic: "https://api.anthropic.com",
  google: "https://generativelanguage.googleapis.com",
  stripe: "https://api.stripe.com",
};

async function forwardRequest(req, res) {
  const { provider } = req.params;
  const endpoint = req.params[0];

  const targetBaseUrl = PROVIDER_BASE_URLS[provider];
  if (!targetBaseUrl) {
    return res.status(400).json({ error: `Unknown provider: ${provider}` });
  }

  const targetUrl = `${targetBaseUrl}/${endpoint}${
    req._parsedUrl.search || ""
  }`;

  try {
    // Forward request with streaming support
    const response = await axios({
      method: req.method,
      url: targetUrl,
      headers: {
        ...req.headers,
        host: new URL(targetBaseUrl).host, // Set correct Host header
        "x-forwarded-for": req.ip, // Preserve client IP
        "x-forwarded-proto": req.protocol,
      },
      data: req.body,
      responseType: "stream", // Enable streaming responses
      validateStatus: () => true, // Accept all status codes
    });

    // Copy status code
    res.status(response.status);

    // Copy response headers (except hop-by-hop headers)
    const hopByHopHeaders = [
      "connection",
      "keep-alive",
      "transfer-encoding",
      "upgrade",
    ];
    Object.entries(response.headers).forEach(([key, value]) => {
      if (!hopByHopHeaders.includes(key.toLowerCase())) {
        res.setHeader(key, value);
      }
    });

    // Add RateGuard headers
    res.setHeader("X-RateGuard-Project", req.project.short_id);
    res.setHeader("X-RateGuard-Provider", provider);

    // Stream response body
    response.data.pipe(res);

    // Log usage (async, non-blocking)
    logUsage(req, response).catch(console.error);
  } catch (error) {
    console.error("Proxy forward error:", error);
    res.status(502).json({
      error: "Bad Gateway",
      message: "Failed to connect to target API",
    });
  }
}

app.all("/p/:projectShortId/:provider/*", forwardRequest);
```

**Step 7: Log Usage & Analytics**

```javascript
// Usage logging (async)
async function logUsage(req, response) {
  const { projectId, userId } = req;
  const { provider } = req.params;
  const endpoint = req.params[0];

  // Calculate cost based on provider pricing
  const cost = estimateAPIcost(provider, endpoint, req.body, response.data);

  // Log to database (background job)
  await db.usage_logs.create({
    id: uuid(),
    user_id: userId,
    project_id: projectId,
    provider: provider,
    endpoint: endpoint,
    method: req.method,
    status_code: response.status,
    request_size_bytes: JSON.stringify(req.body).length,
    response_size_bytes: response.headers["content-length"] || 0,
    estimated_cost_usd: cost,
    duration_ms: Date.now() - req.startTime,
    ip_address: req.ip,
    user_agent: req.headers["user-agent"],
    created_at: new Date(),
  });

  // Update real-time counters
  await redis.incr(`usage:project:${projectId}:requests:today`);
  await redis.incrbyfloat(`usage:project:${projectId}:cost:today`, cost);

  // Check budget alerts
  const todayCost = await redis.get(`usage:project:${projectId}:cost:today`);
  const budget = await db.projects
    .findOne({ id: projectId })
    .select("budget_limit");

  if (todayCost > budget * 0.8) {
    // Send alert email
    sendBudgetAlert(userId, projectId, todayCost, budget).catch(console.error);
  }
}

function estimateAPIcost(provider, endpoint, requestBody, responseData) {
  // Provider-specific cost estimation
  switch (provider) {
    case "openai":
      if (endpoint.includes("chat/completions")) {
        const model = requestBody.model || "gpt-3.5-turbo";
        const inputTokens = estimateTokens(requestBody.messages);
        const outputTokens = estimateTokens(
          responseData.choices?.[0]?.message?.content
        );

        // GPT-4 Turbo pricing: $0.01/1K input, $0.03/1K output
        const inputCost = (inputTokens / 1000) * 0.01;
        const outputCost = (outputTokens / 1000) * 0.03;

        return inputCost + outputCost;
      }
      break;
    case "stripe":
      // Stripe has no per-request cost, return 0
      return 0;
    default:
      return 0;
  }
}
```

---

## CORS HANDLING SYSTEM

### Problem: Cross-Origin Requests from User's App

**Scenario:**

```
User's React app (https://myapp.com)
  → RateGuard proxy (https://rateguard.domain/p/abc123/openai/...)
    → OpenAI API (https://api.openai.com/v1/...)
```

Browser blocks the request because:

1. Different origins (myapp.com → rateguard.domain)
2. No `Access-Control-Allow-Origin` header from RateGuard

### Solution 1: Per-Project CORS Whitelist (Recommended)

**User Configuration in Dashboard:**

```jsx
function CORSSettings({ project }) {
  const [whitelist, setWhitelist] = useState(project.cors_whitelist);

  const addOrigin = () => {
    const newOrigin = prompt("Enter origin (e.g., https://myapp.com)");
    if (newOrigin && isValidOrigin(newOrigin)) {
      setWhitelist([...whitelist, newOrigin]);
    }
  };

  const saveSettings = async () => {
    await fetch(`/api/projects/${project.id}/cors`, {
      method: "PUT",
      body: JSON.stringify({ whitelist }),
    });
  };

  return (
    <div>
      <h3>CORS Whitelist</h3>
      <p>Add domains that are allowed to make requests to your proxy.</p>

      <ul>
        {whitelist.map((origin) => (
          <li key={origin}>
            {origin}
            <button
              onClick={() =>
                setWhitelist(whitelist.filter((o) => o !== origin))
              }
            >
              Remove
            </button>
          </li>
        ))}
      </ul>

      <button onClick={addOrigin}>Add Origin</button>
      <button onClick={saveSettings}>Save</button>

      <div className="help">
        <h4>Common Origins:</h4>
        <ul>
          <li>Production: https://myapp.com</li>
          <li>Staging: https://staging.myapp.com</li>
          <li>Development: http://localhost:3000</li>
        </ul>
      </div>
    </div>
  );
}
```

**Backend Enforcement (Already Shown in handleCORS Function Above)**

### Solution 2: Wildcard for Development (Use Carefully)

```javascript
// Allow wildcard for specific environments
if (project.environment === "development") {
  res.setHeader("Access-Control-Allow-Origin", "*");
} else {
  // Use whitelist for production
}
```

**⚠️ Security Warning:** Never use `*` in production. Always whitelist specific origins.

### Solution 3: OAuth Callback URL Proxying

**Problem:** OAuth flows like Google Sign-In require exact callback URL match.

**User Flow:**

```
1. User's app redirects to Google:
   https://accounts.google.com/o/oauth2/auth?
     client_id=xxx&
     redirect_uri=https://rateguard.domain/p/abc123/google/callback

2. Google redirects to RateGuard callback:
   https://rateguard.domain/p/abc123/google/callback?code=xyz123&state=abc

3. RateGuard exchanges code for token (using user's client secret)

4. RateGuard redirects to user's registered callback:
   https://myapp.com/auth/callback?access_token=...&state=abc
```

**Implementation:**

```javascript
// OAuth callback handler
app.get("/p/:projectShortId/:provider/callback", async (req, res) => {
  const { projectShortId, provider } = req.params;
  const { code, state, error } = req.query;

  // Fetch project config
  const project = await getProjectByShortId(projectShortId);

  if (!project) {
    return res.status(404).send("Project not found");
  }

  // Validate state (CSRF protection)
  const storedState = await redis.get(`oauth:state:${state}`);
  if (!storedState || storedState !== projectShortId) {
    return res.status(403).send("Invalid state parameter");
  }

  if (error) {
    // OAuth error from provider
    const userCallback = JSON.parse(project.callback_urls)[0];
    return res.redirect(`${userCallback}?error=${error}`);
  }

  try {
    // Exchange authorization code for access token
    const tokenResponse = await exchangeCodeForToken(provider, code, project);

    // Redirect to user's callback with token
    const userCallback = JSON.parse(project.callback_urls)[0];
    res.redirect(
      `${userCallback}?access_token=${tokenResponse.access_token}&token_type=${tokenResponse.token_type}&state=${state}`
    );
  } catch (error) {
    console.error("OAuth callback error:", error);
    res.status(500).send("OAuth exchange failed");
  }
});

async function exchangeCodeForToken(provider, code, project) {
  // Provider-specific token exchange
  switch (provider) {
    case "google":
      return await axios.post("https://oauth2.googleapis.com/token", {
        code,
        client_id: decryptAPIKey(project.encrypted_client_id),
        client_secret: decryptAPIKey(project.encrypted_client_secret),
        redirect_uri: `https://rateguard.domain/p/${project.short_id}/google/callback`,
        grant_type: "authorization_code",
      });
    // Add other providers...
  }
}
```

**Continue to Part 2 of Architecture doc...**
