import { Metadata } from "next";
import Link from "next/link";

export const metadata: Metadata = {
  title: "Rate Limit Discovery | RateGuard Documentation",
  description:
    "Learn how RateGuard automatically discovers and suggests optimal rate limits.",
};

export default function RateLimitDiscoveryPage() {
  return (
    <div className="prose prose-lg max-w-none prose-headings:text-foreground prose-p:text-foreground prose-li:text-foreground prose-a:text-primary hover:prose-a:text-primary/80 prose-strong:text-foreground prose-code:text-foreground prose-pre:bg-muted prose-pre:text-foreground">
      <h1>Rate Limit Discovery 🎯</h1>
      <p className="lead">
        RateGuard automatically learns API rate limits by observing 429
        responses and provides intelligent suggestions with confidence scores.
      </p>

      <div className="bg-blue-50 dark:bg-blue-950/20 border border-blue-200 dark:border-blue-900 rounded-lg p-4 my-6">
        <p className="text-sm m-0">
          <strong>✨ Zero Configuration:</strong> This feature works
          automatically in the background. No setup required!
        </p>
      </div>

      <h2>How It Works</h2>
      <p>
        Rate Limit Discovery is an intelligent system that observes your API
        traffic and learns the real rate limits by analyzing responses:
      </p>

      <ol>
        <li>
          <strong>Proxy forwards requests</strong> to your upstream API
        </li>
        <li>
          <strong>API returns 429</strong> (Too Many Requests) with rate limit
          headers
        </li>
        <li>
          <strong>System parses headers</strong> automatically
          (X-RateLimit-Limit, etc.)
        </li>
        <li>
          <strong>Stores observation</strong> in database (non-blocking)
        </li>
        <li>
          <strong>Analyzes patterns</strong> using statistical algorithms
        </li>
        <li>
          <strong>Generates suggestions</strong> with confidence scores (30-95%)
        </li>
        <li>
          <strong>Displays in dashboard</strong> for one-click application
        </li>
      </ol>

      <h2>Supported Headers</h2>
      <p>
        RateGuard automatically detects rate limit information from multiple
        header formats:
      </p>

      <table>
        <thead>
          <tr>
            <th>Format</th>
            <th>Example</th>
            <th>Provider</th>
          </tr>
        </thead>
        <tbody>
          <tr>
            <td>Standard</td>
            <td>
              <code>X-RateLimit-Limit</code>
            </td>
            <td>GitHub, Stripe, Twitter</td>
          </tr>
          <tr>
            <td>Alternative</td>
            <td>
              <code>X-Rate-Limit-Limit</code>
            </td>
            <td>Various APIs</td>
          </tr>
          <tr>
            <td>OpenAI Style</td>
            <td>
              <code>x-ratelimit-limit-requests</code>
            </td>
            <td>OpenAI</td>
          </tr>
          <tr>
            <td>Cloudflare</td>
            <td>
              <code>CF-RateLimit-Limit</code>
            </td>
            <td>Cloudflare</td>
          </tr>
        </tbody>
      </table>

      <h2>Using Rate Limit Discovery</h2>

      <h3>Step 1: Configure Your API</h3>
      <p>
        First, create an API configuration in the{" "}
        <Link href="/dashboard/apis">API Management</Link> section with your
        initial estimated limits.
      </p>

      <h3>Step 2: Make Requests</h3>
      <p>
        Route your API traffic through RateGuard. When the upstream API returns
        429 responses with rate limit headers, RateGuard automatically records
        the observations.
      </p>

      <pre>
        <code>{`# Example proxy request
curl -X GET https://your-rateguard.com/proxy/my-api/endpoint \\
  -H "Authorization: Bearer YOUR_TOKEN"`}</code>
      </pre>

      <h3>Step 3: View Suggestions</h3>
      <p>Navigate to your API detail page to see discovered rate limits:</p>

      <pre>
        <code>{`Dashboard → APIs → [Your API] → Discovered Rate Limits`}</code>
      </pre>

      <p>You'll see a card showing:</p>
      <ul>
        <li>Current vs. Suggested limits</li>
        <li>Confidence score (color-coded)</li>
        <li>Number of observations</li>
        <li>Recommendation reasoning</li>
      </ul>

      <h3>Step 4: Apply Suggestions</h3>
      <p>
        Click the <strong>"Apply Suggested Limits"</strong> button to
        automatically update your API configuration with the discovered limits.
      </p>

      <h2>Confidence Scores</h2>
      <p>
        RateGuard calculates confidence using statistical analysis (Coefficient
        of Variation):
      </p>

      <div className="grid grid-cols-1 md:grid-cols-3 gap-4 my-6">
        <div className="border rounded-lg p-4 bg-green-50 dark:bg-green-950/20 border-green-200 dark:border-green-900">
          <div className="font-bold text-green-800 dark:text-green-400">
            🟢 High (≥80%)
          </div>
          <p className="text-sm text-muted-foreground m-0">
            Very consistent observations
          </p>
        </div>

        <div className="border rounded-lg p-4 bg-yellow-50 dark:bg-yellow-950/20 border-yellow-200 dark:border-yellow-900">
          <div className="font-bold text-yellow-800 dark:text-yellow-400">
            🟡 Medium (≥60%)
          </div>
          <p className="text-sm text-muted-foreground m-0">
            Moderate consistency
          </p>
        </div>

        <div className="border rounded-lg p-4 bg-orange-50 dark:bg-orange-950/20 border-orange-200 dark:border-orange-900">
          <div className="font-bold text-orange-800 dark:text-orange-400">
            🟠 Lower (&lt;60%)
          </div>
          <p className="text-sm text-muted-foreground m-0">
            Variable observations
          </p>
        </div>
      </div>

      <h2>Viewing Observation History</h2>
      <p>
        Click <strong>"View Details"</strong> on any suggestion card to see the
        complete history of rate limit observations, including:
      </p>

      <ul>
        <li>Timestamp of each observation</li>
        <li>Source header that provided the data</li>
        <li>Detected limit and time window</li>
        <li>Calculated request rate</li>
        <li>HTTP status code (usually 429)</li>
      </ul>

      <h2>API Endpoints</h2>
      <p>You can also access rate limit discovery programmatically:</p>

      <h3>Get Suggestions</h3>
      <pre>
        <code>{`GET /api/v1/apis/:id/rate-limit/suggestions

Response:
{
  "api_id": "...",
  "api_name": "stripe_prod",
  "suggested_per_second": 10,
  "suggested_per_hour": 36000,
  "current_per_second": 100,
  "confidence_score": 85,
  "observation_count": 15,
  "recommendation_reason": "Detected lower per-second limit"
}`}</code>
      </pre>

      <h3>Get Observations</h3>
      <pre>
        <code>{`GET /api/v1/apis/:id/rate-limit/observations

Response:
[
  {
    "id": "...",
    "limit_per_window": 100,
    "window_seconds": 60,
    "source_header": "X-RateLimit-Limit",
    "observed_at": "2024-11-24T18:30:00Z",
    "response_status": 429
  }
]`}</code>
      </pre>

      <h3>Apply Suggestions</h3>
      <pre>
        <code>{`POST /api/v1/apis/:id/rate-limit/apply

Response:
{
  "success": true,
  "message": "Rate limits updated based on suggestions",
  "applied": {
    "per_second": 10,
    "per_hour": 600
  }
}`}</code>
      </pre>

      <h2>Real-World Examples</h2>

      <h3>Example 1: Stripe API</h3>
      <pre>
        <code>{`429 Response Headers:
X-RateLimit-Limit: 100
X-RateLimit-Reset: 1732489320

Result:
→ Detected: 100 requests per second
→ Confidence: 95% (after 5 observations)
→ Suggestion: Update to 100 req/s`}</code>
      </pre>

      <h3>Example 2: OpenAI API</h3>
      <pre>
        <code>{`429 Response Headers:
x-ratelimit-limit-requests: 500
x-ratelimit-reset-requests: <timestamp>

Result:
→ Detected: 500 requests per minute
→ Confidence: 88%
→ Suggestion: 8.33 req/s (500/60)`}</code>
      </pre>

      <h3>Example 3: GitHub API</h3>
      <pre>
        <code>{`429 Response Headers:
X-RateLimit-Limit: 5000
X-RateLimit-Reset: <timestamp>

Result:
→ Detected: 5000 requests per hour
→ Confidence: 92%
→ Suggestion: 1.39 req/s (5000/3600)`}</code>
      </pre>

      <h2>Best Practices</h2>

      <div className="bg-yellow-50 dark:bg-yellow-950/20 border border-yellow-200 dark:border-yellow-900 rounded-lg p-4 my-6">
        <h4 className="mt-0">💡 Tips for Better Suggestions</h4>
        <ul className="mb-0">
          <li>
            <strong>Accumulate observations:</strong> Wait for at least 3-5
            observations before applying suggestions
          </li>
          <li>
            <strong>Check confidence scores:</strong> Higher scores indicate
            more reliable suggestions
          </li>
          <li>
            <strong>Review reasoning:</strong> Read the recommendation reason to
            understand why limits are suggested
          </li>
          <li>
            <strong>Monitor after applying:</strong> Watch your API performance
            after updating limits
          </li>
          <li>
            <strong>Consider API tiers:</strong> Some APIs have different limits
            for different user tiers
          </li>
        </ul>
      </div>

      <h2>Troubleshooting</h2>

      <h3>No Suggestions Appearing</h3>
      <p>If you don't see suggestions, check that:</p>
      <ul>
        <li>Requests are flowing through the RateGuard proxy</li>
        <li>Upstream API is returning 429 responses</li>
        <li>429 responses include rate limit headers</li>
        <li>At least 3 observations have been recorded</li>
        <li>Observations are within the last 30 days</li>
      </ul>

      <h3>Low Confidence Scores</h3>
      <p>Low confidence can occur when:</p>
      <ul>
        <li>API has inconsistent rate limits</li>
        <li>Too few observations collected (&lt;3)</li>
        <li>API uses different limits for different endpoints</li>
        <li>Dynamic limits based on user tier or time of day</li>
      </ul>

      <h3>Headers Not Being Parsed</h3>
      <p>Verify that:</p>
      <ul>
        <li>
          Your API uses standard header formats (check the{" "}
          <a href="#supported-headers">supported headers</a>)
        </li>
        <li>Headers are actually present in 429 responses</li>
        <li>Check backend logs for parsing errors</li>
      </ul>

      <h2>Technical Details</h2>

      <h3>Data Storage</h3>
      <p>
        Observations are stored in the <code>rate_limit_observations</code>{" "}
        table with:
      </p>
      <ul>
        <li>30-day rolling window for analysis</li>
        <li>Up to 100 most recent observations per API</li>
        <li>Optimized indexes for fast queries</li>
        <li>Automatic cleanup of old data</li>
      </ul>

      <h3>Algorithm</h3>
      <p>Confidence calculation uses Coefficient of Variation (CV):</p>
      <pre>
        <code>{`CV = Standard Deviation / Mean

Scoring:
- CV < 0.05 → 95% confidence (very consistent)
- CV < 0.10 → 85% confidence (consistent)
- CV < 0.20 → 70% confidence (moderate)
- CV < 0.30 → 55% confidence (variable)
- CV ≥ 0.30 → 40% confidence (high variation)`}</code>
      </pre>

      <h3>Performance</h3>
      <ul>
        <li>
          <strong>Non-blocking:</strong> Observations recorded asynchronously
        </li>
        <li>
          <strong>Lightweight:</strong> Each observation uses a separate
          goroutine
        </li>
        <li>
          <strong>Fast queries:</strong> Indexed lookups complete in &lt;10ms
        </li>
        <li>
          <strong>Efficient:</strong> Limited to 100 observations per API
        </li>
      </ul>

      <h2>Related Documentation</h2>
      <ul>
        <li>
          <Link href="/docs/guides/rate-limiting">Rate Limiting Guide</Link>
        </li>
        <li>
          <Link href="/docs/api-reference">API Reference</Link>
        </li>
        <li>
          <Link href="/dashboard/apis">API Management</Link>
        </li>
      </ul>

      <div className="bg-blue-50 dark:bg-blue-950/20 border border-blue-200 dark:border-blue-900 rounded-lg p-4 my-6">
        <p className="text-sm m-0">
          <strong>🚀 Ready to try it?</strong> Head to your{" "}
          <Link href="/dashboard/apis">API Management</Link> page and start
          routing traffic through RateGuard!
        </p>
      </div>
    </div>
  );
}
