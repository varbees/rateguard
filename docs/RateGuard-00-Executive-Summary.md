# RateGuard: Executive Summary & Project Overview
## API Rate Limiting SaaS Platform - MVP to Launch

**Created:** November 22, 2025  
**Current Status:** Auth working ✅ | Dashboard working ✅ | Core features needed ⚠️  
**Target:** Production-ready MVP in 1 week  
**Revenue Goal:** $2K–$5K MRR by Month 2  

---

## 🎯 PROJECT OVERVIEW

### What is RateGuard?
**RateGuard** is a plug-and-play API rate limiting service that sits between your users and third-party APIs (OpenAI, Stripe, Google, etc.), providing:
- **User/project-scoped API proxies** with unique routed links
- **Automatic rate limit management** (prevent hitting API limits)
- **Usage tracking & analytics** per user/project
- **Cost control & budget alerts**
- **One-line integration** - replace API endpoint, zero code changes

### The Problem
Developers building SaaS apps face these issues:
1. **Hit API rate limits** → service outages, angry users
2. **No per-user tracking** → can't monitor individual usage
3. **Manual rate limit management** → complex code, maintenance burden
4. **Cost overruns** → unexpected API bills from power users
5. **Integration complexity** → custom proxy code for each API

**Cost:** Downtime from rate limits = lost revenue. Manual rate limiting = 5–10 hours/week dev time.

### The Solution
RateGuard provides **instant API proxy URLs** that handle everything:

**Before (without RateGuard):**
```javascript
// Direct API call - no protection
const response = await fetch('https://api.openai.com/v1/chat/completions', {
  headers: { 'Authorization': 'Bearer sk-...' }
});
// Risk: rate limits, no per-user tracking, cost blowup
```

**After (with RateGuard):**
```javascript
// RateGuard proxy - full protection
const response = await fetch('https://rateguard.yourdomain.com/p/abc123/openai/v1/chat/completions', {
  headers: { 'Authorization': 'Bearer rg-...' } // RateGuard manages OpenAI key
});
// ✅ Rate limiting, ✅ per-user tracking, ✅ cost control, ✅ analytics
```

**One line change** = full rate limit management.

---

## 🏗️ WHAT YOU'VE BUILT SO FAR

### ✅ Working Features
1. **Auth System** - User signup/login functional
2. **Dashboard** - Basic stats displayed
3. **Database** - Users table, basic schema

### ⚠️ Critical Missing Features (Need for MVP)
1. **Proxy Link Generation System**
   - Generate unique URLs per user/project
   - Format: `https://rateguard.domain/p/{project_id}/{api_provider}/{endpoint}`
   - Store in database with API credentials

2. **Proxy Request Handler**
   - Intercept requests to generated URLs
   - Forward to real API with rate limiting
   - Track usage, enforce limits
   - Return responses transparently

3. **Rate Limit Engine**
   - Track requests per user/project
   - Implement algorithms (token bucket, sliding window)
   - Return 429 when limit exceeded
   - Reset counters on schedule

4. **API Credentials Management**
   - Encrypted storage of user's API keys
   - Per-project API key assignment
   - Secure injection into proxied requests

5. **CORS Handling System**
   - Whitelist user-specified domains
   - Handle preflight OPTIONS requests
   - Support callback URLs for OAuth flows
   - Proxy mode vs direct mode toggle

6. **Usage Analytics**
   - Request counting per user/project
   - Cost estimation per API provider
   - Real-time dashboard updates
   - Export usage reports

7. **Billing & Limits**
   - Tier-based limits (free, pro, enterprise)
   - Stripe subscription integration
   - Usage-based overage charges
   - Auto-suspend on limit exceed

---

## 🔑 CORE ARCHITECTURE: HOW RATEGUARD WORKS

### High-Level Flow

```
┌─────────────────────────────────────────────────────────────────┐
│                    USER'S APPLICATION                            │
│  (React, Vue, mobile app, etc.)                                 │
└────────────────────┬────────────────────────────────────────────┘
                     │
                     │ API call to RateGuard proxy URL:
                     │ https://rateguard.domain/p/abc123/openai/v1/chat/completions
                     │
                     ▼
┌─────────────────────────────────────────────────────────────────┐
│                    RATEGUARD PLATFORM                            │
│  ┌──────────────────────────────────────────────────────────┐  │
│  │          1. REQUEST INTERCEPTOR (Proxy Handler)          │  │
│  │  - Parse proxy URL                                       │  │
│  │  - Extract project_id, API provider, endpoint            │  │
│  │  - Validate auth token                                   │  │
│  └───────────────────────┬──────────────────────────────────┘  │
│                          │                                       │
│                          ▼                                       │
│  ┌──────────────────────────────────────────────────────────┐  │
│  │          2. RATE LIMITER (Check & Enforce)               │  │
│  │  - Check current request count                           │  │
│  │  - If under limit: allow, increment counter              │  │
│  │  - If over limit: reject with 429 (Too Many Requests)    │  │
│  └───────────────────────┬──────────────────────────────────┘  │
│                          │                                       │
│                          ▼                                       │
│  ┌──────────────────────────────────────────────────────────┐  │
│  │          3. CREDENTIALS INJECTOR                         │  │
│  │  - Fetch user's encrypted API key                        │  │
│  │  - Decrypt in memory                                     │  │
│  │  - Inject into request headers                           │  │
│  └───────────────────────┬──────────────────────────────────┘  │
│                          │                                       │
│                          ▼                                       │
│  ┌──────────────────────────────────────────────────────────┐  │
│  │          4. PROXY FORWARDER                              │  │
│  │  - Forward request to real API                           │  │
│  │  - Handle CORS (add headers, preflight)                  │  │
│  │  - Stream response back to user                          │  │
│  └───────────────────────┬──────────────────────────────────┘  │
│                          │                                       │
│                          ▼                                       │
│  ┌──────────────────────────────────────────────────────────┐  │
│  │          5. USAGE TRACKER & ANALYTICS                    │  │
│  │  - Log request (user_id, project_id, endpoint, cost)     │  │
│  │  - Update dashboard metrics                              │  │
│  │  - Check budget alerts                                   │  │
│  └──────────────────────────────────────────────────────────┘  │
└─────────────────────────────────────────────────────────────────┘
                          │
                          │ Proxied response with original headers
                          │
                          ▼
┌─────────────────────────────────────────────────────────────────┐
│                THIRD-PARTY API (OpenAI, Stripe, etc.)           │
└─────────────────────────────────────────────────────────────────┘
```

---

## 🔗 CRITICAL FEATURE: LINK GENERATION SYSTEM

### How Users Get Their Proxy Links

**User Flow:**
1. User logs in to RateGuard dashboard
2. User creates a "Project" (e.g., "My SaaS App")
3. User selects API provider (OpenAI, Stripe, Google, etc.)
4. User enters their API key (stored encrypted)
5. **RateGuard generates unique proxy URL:**
   ```
   https://rateguard.yourdomain.com/p/{project_id}/openai/v1/chat/completions
   ```
6. User copies URL and replaces original API endpoint in their code
7. Done! All requests now go through RateGuard

### Link Generation Logic

**Database Schema:**
```sql
-- Projects table
CREATE TABLE projects (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID REFERENCES users(id),
  name VARCHAR(255) NOT NULL,
  api_provider VARCHAR(50) NOT NULL, -- 'openai', 'stripe', 'google', etc.
  encrypted_api_key TEXT NOT NULL,   -- User's API key (AES-256)
  rate_limit_per_minute INT DEFAULT 60,
  rate_limit_per_day INT DEFAULT 10000,
  cors_whitelist JSONB DEFAULT '[]', -- ['https://myapp.com', 'http://localhost:3000']
  callback_urls JSONB DEFAULT '[]',  -- For OAuth flows
  status VARCHAR(20) DEFAULT 'active',
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Proxy links (generated from projects)
CREATE TABLE proxy_links (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  project_id UUID REFERENCES projects(id),
  path_prefix VARCHAR(255) UNIQUE NOT NULL, -- '/p/abc123'
  target_base_url TEXT NOT NULL,            -- 'https://api.openai.com'
  created_at TIMESTAMPTZ DEFAULT NOW()
);
```

**Link Generation Code (Backend):**
```javascript
// When user creates project:
async function createProject(userId, apiProvider, apiKey, rateLimits) {
  const projectId = generateUUID();
  const encryptedKey = encryptAES256(apiKey);
  
  // Save project
  await db.projects.create({
    id: projectId,
    user_id: userId,
    api_provider: apiProvider,
    encrypted_api_key: encryptedKey,
    rate_limit_per_minute: rateLimits.perMinute,
    rate_limit_per_day: rateLimits.perDay,
  });
  
  // Generate proxy link
  const pathPrefix = `/p/${generateShortId(projectId)}`; // e.g., /p/abc123xyz
  const targetBaseUrl = getAPIBaseURL(apiProvider); // 'https://api.openai.com'
  
  await db.proxyLinks.create({
    project_id: projectId,
    path_prefix: pathPrefix,
    target_base_url: targetBaseUrl,
  });
  
  // Return full proxy URL to user
  return {
    proxyUrl: `https://rateguard.yourdomain.com${pathPrefix}`,
    project: { id: projectId, name, provider: apiProvider }
  };
}
```

**Frontend (User sees this):**
```jsx
// Dashboard component
function ProjectCard({ project }) {
  const proxyUrl = `${RATEGUARD_URL}${project.path_prefix}`;
  
  return (
    <div>
      <h3>{project.name}</h3>
      <p>Provider: {project.api_provider}</p>
      <div>
        <label>Your Proxy URL:</label>
        <code>{proxyUrl}</code>
        <button onClick={() => copyToClipboard(proxyUrl)}>
          Copy
        </button>
      </div>
      <p>Usage: {project.requests_today} / {project.rate_limit_per_day}</p>
    </div>
  );
}
```

---

## 🌐 CRITICAL FEATURE: CORS HANDLING SYSTEM

### The Problem: CORS Restrictions

**Scenario:** User's frontend (https://myapp.com) calls RateGuard proxy (https://rateguard.domain), which then calls OpenAI API (https://api.openai.com).

**CORS Issue:**
```
Browser → https://myapp.com
  ↓ (fetch request)
RateGuard → https://rateguard.domain/p/abc123/openai/...
  ❌ BLOCKED: "No 'Access-Control-Allow-Origin' header present"
```

**Why?** Browser's same-origin policy blocks cross-origin requests unless server explicitly allows it.

### Solution 1: Dynamic CORS Whitelist

**User Configuration:**
```javascript
// In RateGuard dashboard, user adds allowed domains:
const project = {
  cors_whitelist: [
    'https://myapp.com',
    'https://app.myapp.com',
    'http://localhost:3000',  // Dev environment
    'https://staging.myapp.com'
  ]
};
```

**Backend CORS Middleware:**
```javascript
// Express middleware
function dynamicCORS(req, res, next) {
  const origin = req.headers.origin;
  const projectId = extractProjectId(req.path); // from /p/abc123/...
  
  // Fetch project's whitelist from database
  const project = await db.projects.findOne({ id: projectId });
  const whitelist = project.cors_whitelist || [];
  
  // Check if origin is whitelisted
  if (whitelist.includes(origin)) {
    res.setHeader('Access-Control-Allow-Origin', origin);
    res.setHeader('Access-Control-Allow-Methods', 'GET, POST, PUT, DELETE, OPTIONS');
    res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization');
    res.setHeader('Access-Control-Allow-Credentials', 'true');
  }
  
  // Handle preflight OPTIONS request
  if (req.method === 'OPTIONS') {
    return res.status(204).end();
  }
  
  next();
}

app.use('/p/*', dynamicCORS);
```

### Solution 2: Callback URL Support (OAuth Flows)

**Problem:** Some APIs (Google OAuth, Stripe Connect) require callback URLs that must match exactly.

**User Scenario:**
```
1. User's app redirects to Google OAuth:
   https://accounts.google.com/o/oauth2/auth?redirect_uri=https://myapp.com/callback

2. Google redirects back with code:
   https://myapp.com/callback?code=xyz123

3. User's app exchanges code for token:
   POST https://rateguard.domain/p/abc123/google/oauth/token
```

**RateGuard Configuration:**
```javascript
// User configures callback URLs in project settings
const project = {
  callback_urls: [
    'https://myapp.com/auth/callback',
    'https://myapp.com/stripe/callback',
    'http://localhost:3000/callback' // Dev
  ]
};
```

**Backend Callback Handler:**
```javascript
// Proxy OAuth callback
app.get('/p/:projectId/oauth/callback', async (req, res) => {
  const { projectId } = req.params;
  const { code, state } = req.query;
  
  // Fetch project config
  const project = await db.projects.findOne({ id: projectId });
  const callbackUrl = project.callback_urls[0]; // User's registered callback
  
  // Validate state (CSRF protection)
  if (!validateState(state, projectId)) {
    return res.status(403).send('Invalid state');
  }
  
  // Exchange code for token (proxy to real API)
  const token = await exchangeCodeForToken(code, project.encrypted_api_key);
  
  // Redirect to user's callback with token
  res.redirect(`${callbackUrl}?access_token=${token}`);
});
```

### Solution 3: Proxy Mode vs Direct Mode

**Proxy Mode (Default):**
- RateGuard acts as full proxy
- CORS headers added by RateGuard
- User's app talks to RateGuard, RateGuard talks to API

**Direct Mode (Alternative):**
- RateGuard generates signed URLs
- User's app talks directly to API with signed URL
- No CORS issues (API's own CORS policy applies)

**Implementation:**
```javascript
// Generate signed URL (for direct mode)
function generateSignedURL(projectId, endpoint, expiresIn = 3600) {
  const signature = signHMAC(projectId + endpoint + Date.now(), SECRET_KEY);
  const targetUrl = `https://api.openai.com${endpoint}`;
  
  return `${targetUrl}?rg_project=${projectId}&rg_sig=${signature}&rg_exp=${Date.now() + expiresIn}`;
}

// User uses signed URL directly (no proxy):
const signedUrl = await rateguard.generateSignedURL('/v1/chat/completions');
const response = await fetch(signedUrl, {
  method: 'POST',
  body: JSON.stringify({ prompt: '...' })
});
// Rate limits still enforced via signature validation
```

---

## 💰 BUSINESS MODEL & MONETIZATION

### Pricing Tiers

| Tier | Price | Requests/Month | Projects | APIs | Support |
|------|-------|----------------|----------|------|---------|
| **Free** | $0 | 10,000 | 1 | 2 providers | Community |
| **Pro** | $19/mo | 100,000 | 5 | All providers | Email |
| **Business** | $49/mo | 500,000 | 20 | All + webhooks | Priority |
| **Enterprise** | Custom | Unlimited | Unlimited | Custom + SLA | Dedicated |

### Revenue Model

**1. Subscription Revenue:**
- $19/mo Pro tier = primary target
- $49/mo Business tier = growing teams
- Monthly billing via Stripe

**2. Usage-Based Overage:**
- Free: 10K requests/mo included
- Overage: $0.001 per request (after limit)
- Example: 15K requests = $0 base + $5 overage = $5 total

**3. Add-Ons (Future):**
- Advanced analytics: $10/mo
- Custom rate limit algorithms: $15/mo
- White-label: $99/mo

### Revenue Projections

| Month | Free Users | Pro Users | Business Users | MRR | Notes |
|-------|------------|-----------|----------------|-----|-------|
| 1 | 50 | 5 | 0 | $95 | Beta launch, early adopters |
| 2 | 150 | 20 | 2 | $478 | ProductHunt, organic growth |
| 3 | 300 | 50 | 5 | $1,195 | **Target: $1K MRR** |
| 6 | 800 | 150 | 20 | $3,830 | **Target: $3K–$5K MRR** |

**Assumptions:**
- Free-to-pro conversion: 10–15%
- Churn: 5% monthly
- Word-of-mouth growth: 30% MoM

---

## 🎯 MVP FEATURE PRIORITY

### Week 1: Core Proxy Functionality (Must-Have)
**Goal:** Get basic proxy working with rate limiting

1. **Day 1–2: Proxy Request Handler**
   - Parse incoming requests to `/p/{projectId}/{provider}/{endpoint}`
   - Extract project ID, fetch from database
   - Forward request to target API
   - Return response transparently

2. **Day 3–4: Rate Limiting Engine**
   - Implement token bucket algorithm (Redis)
   - Track requests per project per minute/hour/day
   - Return 429 when limit exceeded
   - Reset counters on schedule

3. **Day 5: API Key Management**
   - Encrypt user's API keys (AES-256)
   - Store in database per project
   - Decrypt and inject into proxied requests
   - Never log or expose plaintext keys

4. **Day 6–7: CORS & Testing**
   - Dynamic CORS whitelist per project
   - Handle OPTIONS preflight
   - End-to-end testing with real APIs
   - Fix bugs, polish UX

**Deliverable:** Users can create projects, get proxy URLs, make requests with rate limiting.

---

### Week 2: Dashboard & Billing (Should-Have)
**Goal:** Users can track usage and pay

1. **Usage Analytics Dashboard**
   - Real-time request counts per project
   - Cost estimation per API provider
   - Charts (requests over time, top endpoints)

2. **Stripe Integration**
   - Subscription checkout for Pro/Business
   - Webhook handler for payment events
   - Auto-suspend on failed payment

3. **Tier Enforcement**
   - Check user's tier before allowing request
   - Display "Upgrade" when limit reached
   - Email alerts for 80% usage

**Deliverable:** Users can upgrade, see usage, get charged.

---

### Future Features (Nice-to-Have, Post-MVP)
- Webhook notifications for rate limit events
- Custom rate limit algorithms (per-endpoint)
- Team collaboration (shared projects)
- API provider cost optimization (cheapest endpoint routing)
- White-label (custom domain for proxy)
- Analytics API (programmatic access to usage data)

---

## 🛠️ TECH STACK

### Backend (Proxy + API)
- **Language:** Node.js + Express OR Go + Echo (Go preferred for proxy performance)
- **Database:** PostgreSQL (Supabase)
- **Rate Limiting:** Redis (Upstash or Railway Redis)
- **Encryption:** crypto (AES-256-GCM)
- **Hosting:** Railway or Render

### Frontend (Dashboard)
- **Framework:** Next.js 14 (App Router)
- **UI:** Tailwind CSS + shadcn/ui
- **State:** Zustand + TanStack Query
- **Charts:** Recharts
- **Hosting:** Vercel

### Services
- **Auth:** Supabase Auth (email/password + OAuth)
- **Payments:** Stripe (subscriptions + usage billing)
- **Monitoring:** Sentry (errors) + Axiom (logs)
- **Email:** Resend (transactional)

---

## 🚀 GO-TO-MARKET STRATEGY

### Target Audience
1. **Indie SaaS builders** (primary)
   - Building AI-powered apps (ChatGPT wrappers)
   - Need rate limiting to prevent API bill blowup
   - Don't want to build custom proxy

2. **Agencies** (secondary)
   - Managing multiple client apps
   - Need per-client API usage tracking
   - Want white-label solution

3. **Startups** (future)
   - Scaling fast, hitting rate limits
   - Need enterprise-grade API management
   - Budget for $49–$199/mo tools

### Launch Strategy (Month 1)

**Week 1: Soft Launch**
- Post on Twitter (build in public)
- Share in IndieHackers, r/SideProject
- Target: 20–30 beta users

**Week 2: ProductHunt Launch**
- Launch on ProductHunt with demo video
- Offer 50% off Pro for early adopters
- Target: 100+ signups, 10+ paid users

**Week 3–4: Content Marketing**
- Blog: "How to prevent API rate limits in your SaaS"
- Blog: "Cost optimization for OpenAI API usage"
- Dev.to: Tutorial with code examples
- Target: 200+ signups, 20+ paid users

### Marketing Channels
- **Twitter:** Build in public, share wins/learnings
- **Dev.to:** Technical tutorials
- **Reddit:** r/SideProject, r/SaaS, r/webdev
- **IndieHackers:** Case studies, revenue milestones
- **SEO:** "API rate limiting", "OpenAI proxy", "Stripe rate limiter"

---

## 📊 SUCCESS METRICS

### Technical Metrics
- [ ] Proxy latency < 50ms (p99)
- [ ] Uptime > 99.9%
- [ ] Rate limit accuracy > 99.5%
- [ ] Zero leaked API keys
- [ ] Zero CORS errors for whitelisted domains

### Business Metrics
- [ ] Month 1: 50+ signups, 5+ paid users ($95 MRR)
- [ ] Month 2: 150+ signups, 20+ paid users ($478 MRR)
- [ ] Month 3: 300+ signups, 50+ paid users ($1,195 MRR)
- [ ] Free-to-paid: 10–15%
- [ ] Churn < 5% monthly

### Product Metrics
- [ ] 80%+ users create at least 1 project
- [ ] 60%+ users make >10 proxied requests
- [ ] 40%+ users hit free tier limit (upgrade opportunity)
- [ ] NPS > 40

---

## 🔒 SECURITY CONSIDERATIONS

### API Key Protection
- **Encryption:** AES-256-GCM for all stored API keys
- **Decryption:** Only in memory during request forwarding
- **No logging:** Plaintext keys never logged or exposed
- **Rotation:** Support key rotation without downtime

### Rate Limit Bypass Prevention
- **Project ID validation:** Every request checked against DB
- **Token bucket strict enforcement:** No backdoors
- **Redis atomic operations:** Prevent race conditions
- **Signature verification:** For direct mode signed URLs

### CORS Security
- **Whitelist only:** No `Access-Control-Allow-Origin: *`
- **Per-project:** Each project has own whitelist
- **Credentials flag:** Only when needed
- **Preflight caching:** Reduce OPTIONS overhead

---

## 📝 NEXT STEPS (ACTION PLAN)

### Today (Nov 22, 5:00 PM IST)
1. ✅ Read this executive summary
2. ✅ Review system architecture (next doc: 01-System-Architecture.md)
3. ⏳ Set up development environment
4. ⏳ Create detailed database schema (02-Database-Schema.md)

### Tomorrow (Nov 23)
1. Start Day 1 of implementation plan (04-Implementation-Plan.md)
2. Build proxy request handler
3. Test with real API (OpenAI or Stripe)

### This Week (Nov 23–29)
- Complete core proxy functionality
- Implement rate limiting engine
- Add CORS handling
- End-to-end testing

### Next Week (Nov 30–Dec 6)
- Build usage analytics dashboard
- Integrate Stripe billing
- Deploy to production
- Beta launch!

---

**Continue reading:**
- **01-System-Architecture.md** - Technical deep dive
- **02-Database-Schema.md** - Complete schema + indexes
- **03-API-Specification.md** - REST endpoints
- **04-Implementation-Plan.md** - Day-by-day build plan with prompts

**Ready to build? Let's ship RateGuard MVP in 1 week! 🚀**