# Frontend Testing Guide

## Overview
This guide covers testing all new frontend features for RateGuard Dashboard.

## New Features Added

### 1. ✅ Multi-Tier Rate Limits
- Per-second rate limit
- Burst size
- **NEW:** Per-hour rate limit
- **NEW:** Per-day rate limit
- **NEW:** Per-month rate limit

### 2. ✅ CORS Allowed Origins
- Whitelist specific origins
- Support for wildcards (*.example.com)
- Empty list = deny all origins
- Use `*` to allow all origins

### 3. ✅ URL Slug Preview
- Automatic slug generation
- Real-time preview
- Matches backend slugification

## Testing Checklist

### Prerequisites
```bash
# Start backend
cd ../go-concurrent-aggregator
export ENCRYPTION_KEY=$(openssl rand -base64 32)
export REDIS_HOST=localhost
export REDIS_PORT=6379
go run cmd/main.go

# Start frontend (new terminal)
cd go-rateguard-dashboard
npm run dev
# or
bun dev
```

### Test 1: Create API with All New Fields

**Steps:**
1. Navigate to http://localhost:3000/dashboard/apis
2. Click "Add API" button
3. Fill in form:
   - **Name:** `My GitHub API!!!` (with special characters)
   - **Target URL:** `https://api.github.com`
   - **Per Second:** `10`
   - **Burst:** `20`
   - **Per Hour:** `1000`
   - **Per Day:** `10000`
   - **Per Month:** `100000`
   - **CORS Origins:**
     - Add `https://example.com`
     - Add `http://localhost:3000`
     - Add `*.mydomain.com`

**Expected Results:**
- ✅ Slug preview shows: `my-github-api`
- ✅ All fields accept input
- ✅ CORS origins can be added/removed
- ✅ API is created successfully
- ✅ Toast notification appears
- ✅ API appears in list with all limits shown

### Test 2: Slug Preview Validation

**Test Cases:**

| Input Name | Expected Slug | Valid? |
|------------|---------------|--------|
| `GitHub API` | `github-api` | ✅ |
| `My Awesome API!!!` | `my-awesome-api` | ✅ |
| `stripe_prod` | `stripe-prod` | ✅ |
| `API-2024` | `api-2024` | ✅ |
| `a` | `a` | ❌ (too short) |
| `123-api` | `123-api` | ✅ |
| `___test___` | `test` | ✅ |

**Steps:**
1. Type each name in the API Name field
2. Observe slug preview updates in real-time
3. Verify slug matches expected value

**Expected:**
- ✅ Slug preview updates instantly
- ✅ Special characters removed
- ✅ Spaces converted to hyphens
- ✅ Lowercase conversion
- ✅ Consecutive hyphens removed

### Test 3: Multi-Tier Rate Limits Display

**Steps:**
1. Create API with multi-tier limits
2. View API list page
3. Check rate limit column

**Expected:**
- ✅ Per-second shows prominently
- ✅ Burst size shows below
- ✅ Hour/day/month limits show in blue text
- ✅ Formatted with thousands separator (10,000)
- ✅ Only configured limits are shown (0 = hidden)

### Test 4: CORS Origins Management

**Steps:**
1. Click "Add API"
2. Add CORS origin: `https://example.com`
3. Press Enter or click + button
4. Add another: `http://localhost:3000`
5. Try to add duplicate: `https://example.com`
6. Remove first origin (X button)

**Expected:**
- ✅ Origins added to list
- ✅ Each origin shows in card with X button
- ✅ Duplicates prevented
- ✅ Origins can be removed
- ✅ Enter key adds origin
- ✅ Helper text shows security info

### Test 5: Edit Existing API

**Steps:**
1. Click edit button on existing API
2. Modal opens with pre-filled data
3. Verify all fields populated:
   - Name
   - Target URL
   - All rate limit fields
   - CORS origins list
   - Timeout/retry
   - Enabled checkbox
4. Modify multi-tier limits
5. Add/remove CORS origins
6. Click "Update API"

**Expected:**
- ✅ All fields pre-populated correctly
- ✅ Slug preview shows current slug
- ✅ CORS origins list populated
- ✅ Changes saved successfully
- ✅ List updates immediately
- ✅ Toast confirmation shown

### Test 6: Form Validation

**Test Empty/Invalid Values:**

| Field | Invalid Value | Expected Behavior |
|-------|---------------|-------------------|
| Name | Empty | Form won't submit (required) |
| Name | `a` | Backend rejects (min 2 chars) |
| Target URL | Empty | Form won't submit (required) |
| Target URL | `not-a-url` | HTML5 validation error |
| Per Second | `-1` | Input prevents negative |
| Per Hour | `abc` | Input only accepts numbers |

**Steps:**
1. Try to submit form with empty required fields
2. Enter invalid values
3. Verify validation messages

**Expected:**
- ✅ Required fields show validation
- ✅ URL field validates format
- ✅ Number fields only accept numbers
- ✅ Negative values prevented
- ✅ Clear error messages

### Test 7: CORS Wildcard Support

**Steps:**
1. Create API with CORS origins:
   - `*.example.com`
   - `*` (allow all)
   - `https://app.mydomain.com`

**Expected:**
- ✅ Wildcard patterns accepted
- ✅ All patterns saved
- ✅ Helper text explains behavior

### Test 8: Rate Limit "0 = Unlimited"

**Steps:**
1. Create API
2. Set multi-tier limits to 0:
   - Per Hour: `0`
   - Per Day: `0`
   - Per Month: `0`
3. Save API
4. View in list

**Expected:**
- ✅ Zero values accepted
- ✅ Fields show placeholder "0 = unlimited"
- ✅ Zero limits don't show in list view
- ✅ Helper text: "(0 = unlimited)"

### Test 9: Responsive Design

**Test on Different Screen Sizes:**
- Desktop (1920x1080)
- Laptop (1366x768)
- Tablet (768x1024)
- Mobile (375x667)

**Steps:**
1. Open dashboard on each screen size
2. Open API modal
3. Create/edit API

**Expected:**
- ✅ Modal scrollable on small screens
- ✅ Form fields stack appropriately
- ✅ Buttons remain accessible
- ✅ No horizontal scroll
- ✅ Text remains readable

### Test 10: API List Display

**Steps:**
1. Create multiple APIs with different configurations:
   - API 1: All limits set
   - API 2: Only per-second
   - API 3: Hour + day limits
   - API 4: All zeros (unlimited)

**Expected:**
- ✅ All APIs shown in table
- ✅ Rate limits formatted correctly
- ✅ Multi-tier limits show conditionally
- ✅ Status badges accurate
- ✅ Actions (edit/delete/view) work

### Test 11: Proxy Info Display

**Steps:**
1. Click "View Proxy Endpoint" (green external link icon)
2. Verify proxy URL format
3. Check code examples

**Expected:**
- ✅ Proxy URL: `http://localhost:8008/proxy/{slug}`
- ✅ Slug matches backend slug
- ✅ Copy button works
- ✅ Code examples updated
- ✅ All languages shown (cURL, JS, Python, Go)

## API Response Verification

### Check Backend Response Format

**Expected API Config Response:**
```json
{
  "id": "uuid",
  "user_id": "uuid",
  "name": "my-github-api",
  "target_url": "https://api.github.com",
  "proxy_url": "http://localhost:8008/proxy/my-github-api",
  "rate_limit_per_second": 10,
  "burst_size": 20,
  "rate_limit_per_hour": 1000,
  "rate_limit_per_day": 10000,
  "rate_limit_per_month": 100000,
  "allowed_origins": [
    "https://example.com",
    "http://localhost:3000",
    "*.mydomain.com"
  ],
  "enabled": true,
  "auth_type": "none",
  "timeout_seconds": 30,
  "retry_attempts": 1,
  "created_at": "2025-11-22T...",
  "updated_at": "2025-11-22T..."
}
```

**Verify with Browser DevTools:**
1. Open Network tab
2. Create/edit API
3. Check request payload
4. Check response data
5. Verify all new fields present

## Common Issues & Solutions

### Issue: TypeScript Errors

**Error:** `Property 'rate_limit_per_hour' does not exist on type 'APIConfig'`

**Solution:**
```bash
# Restart TypeScript server
# In VS Code: Ctrl+Shift+P → "TypeScript: Restart TS Server"
# Or restart dev server
npm run dev
```

### Issue: Slug Not Updating

**Check:**
- useEffect dependency array includes `formData.name`
- slugify function imported correctly
- No console errors

### Issue: CORS Origins Not Saving

**Check:**
- Backend accepts array in request
- Frontend sends correct format: `["origin1", "origin2"]`
- No JSON serialization issues

### Issue: Multi-Tier Limits Not Showing

**Check:**
- API response includes new fields
- Frontend conditionally renders only non-zero values
- TypeScript interface updated

## Manual Testing Script

```bash
#!/bin/bash

echo "🧪 Frontend Testing Script"
echo "=========================="
echo ""

# Test 1: Create API
echo "Test 1: Create API with all fields"
echo "→ Open http://localhost:3000/dashboard/apis"
echo "→ Click 'Add API'"
echo "→ Fill all fields including multi-tier limits and CORS"
echo "→ Verify slug preview shows correctly"
read -p "Press Enter after completing..."

# Test 2: Edit API
echo ""
echo "Test 2: Edit existing API"
echo "→ Click edit icon on API"
echo "→ Verify all fields pre-populated"
echo "→ Modify multi-tier limits"
echo "→ Add/remove CORS origins"
echo "→ Save and verify changes"
read -p "Press Enter after completing..."

# Test 3: List View
echo ""
echo "Test 3: Verify list display"
echo "→ Check rate limits show correctly"
echo "→ Verify multi-tier limits (if set)"
echo "→ Check proxy URL format"
read -p "Press Enter after completing..."

echo ""
echo "✅ All tests complete!"
```

## Browser Console Tests

Open browser console and run:

```javascript
// Test 1: Check API data structure
fetch('http://localhost:8008/api/v1/apis', {
  headers: {
    'X-API-Key': 'YOUR_API_KEY'
  }
})
.then(r => r.json())
.then(data => {
  console.log('APIs:', data);
  // Check for new fields
  if (data[0]) {
    console.log('Has rate_limit_per_hour:', 'rate_limit_per_hour' in data[0]);
    console.log('Has rate_limit_per_day:', 'rate_limit_per_day' in data[0]);
    console.log('Has rate_limit_per_month:', 'rate_limit_per_month' in data[0]);
    console.log('Has allowed_origins:', 'allowed_origins' in data[0]);
  }
});

// Test 2: Create API with new fields
fetch('http://localhost:8008/api/v1/apis', {
  method: 'POST',
  headers: {
    'X-API-Key': 'YOUR_API_KEY',
    'Content-Type': 'application/json'
  },
  body: JSON.stringify({
    name: 'Test Console API',
    target_url: 'https://api.example.com',
    rate_limit_per_second: 10,
    burst_size: 20,
    rate_limit_per_hour: 1000,
    rate_limit_per_day: 10000,
    rate_limit_per_month: 100000,
    allowed_origins: ['https://example.com', 'http://localhost:3000']
  })
})
.then(r => r.json())
.then(data => console.log('Created:', data));
```

## Accessibility Testing

### Keyboard Navigation
- ✅ Tab through form fields
- ✅ Enter key submits form
- ✅ Escape closes modal
- ✅ Focus indicators visible

### Screen Reader
- ✅ Labels associated with inputs
- ✅ Error messages announced
- ✅ Status updates announced
- ✅ Button purposes clear

## Performance Testing

### Metrics to Check
- ✅ Modal opens < 100ms
- ✅ Form submission < 500ms
- ✅ API list renders < 200ms
- ✅ Slug preview updates instantly (< 50ms)
- ✅ No memory leaks on repeated create/delete

## Sign-off Checklist

Before marking frontend as production-ready:

- [ ] All 11 tests pass
- [ ] No TypeScript errors
- [ ] No console warnings
- [ ] Responsive on all screen sizes
- [ ] Accessible (keyboard + screen reader)
- [ ] Error handling works
- [ ] Loading states shown
- [ ] Success/error toasts appear
- [ ] Data persists after refresh
- [ ] Backend integration verified

## Production Deployment Checklist

- [ ] Update .env.production with correct API URL
- [ ] Build passes: `npm run build`
- [ ] No build warnings
- [ ] Test production build locally
- [ ] CORS configured on backend
- [ ] SSL/HTTPS enabled
- [ ] Error tracking configured (Sentry, etc.)
- [ ] Analytics configured (optional)

## Next Steps

1. ✅ Update frontend TypeScript interfaces
2. ✅ Add slug preview
3. ✅ Add multi-tier rate limit inputs
4. ✅ Add CORS origins management
5. ⏳ Test all CRUD operations
6. ⏳ Update documentation
7. ⏳ Deploy to production

---

**Last Updated:** November 22, 2025
**Version:** 2.0.0
**Status:** Ready for Testing
