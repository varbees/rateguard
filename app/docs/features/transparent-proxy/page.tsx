import { Metadata } from "next";
import Link from "next/link";

export const metadata: Metadata = {
  title: "Transparent Proxy | RateGuard Documentation",
  description:
    "Learn how RateGuard's transparent proxy seamlessly forwards requests to your upstream APIs.",
};

export default function TransparentProxyPage() {
  return (
    <div className="prose prose-lg max-w-none prose-headings:text-foreground prose-p:text-foreground prose-li:text-foreground prose-a:text-primary hover:prose-a:text-primary/80 prose-strong:text-foreground prose-code:text-foreground prose-pre:bg-muted prose-pre:text-foreground">
      <h1>Transparent Proxy 🔄</h1>
      <p className="lead">
        RateGuard acts as a transparent proxy, seamlessly forwarding requests to
        your upstream APIs while applying rate limiting, queuing, and analytics.
      </p>

      <div className="bg-blue-50 dark:bg-blue-950/20 border border-blue-200 dark:border-blue-900 rounded-lg p-4 my-6">
        <p className="text-sm m-0">
          <strong>✨ Drop-In Replacement:</strong> Simply replace your API base
          URL with RateGuard&apos;s proxy URL - no code changes required!
        </p>
      </div>

      <h2>How It Works</h2>
      <p>
        The transparent proxy intercepts your API calls, applies rate limiting,
        and forwards them to the target API:
      </p>

      <ol>
        <li>
          <strong>Client makes request</strong> to RateGuard proxy
        </li>
        <li>
          <strong>Authentication</strong> validates your API key
        </li>
        <li>
          <strong>Rate limiting</strong> checks if request can proceed
        </li>
        <li>
          <strong>Queue management</strong> holds request if needed
        </li>
        <li>
          <strong>Proxy forwards</strong> request to upstream API
        </li>
        <li>
          <strong>Response returned</strong> with analytics metadata
        </li>
      </ol>

      <h2>Quick Start</h2>

      <h3>1. Configure Your API</h3>
      <p>In the dashboard, create an API configuration with your target URL:</p>
      <pre>
        <code>{`API Name: stripe_prod
Target URL: https://api.stripe.com
Rate Limit: 100 req/s
Burst: 10`}</code>
      </pre>

      <h3>2. Update Your Code</h3>
      <p>Replace your base URL:</p>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-4 not-prose my-6">
        <div className="border rounded-lg p-4 bg-red-50 dark:bg-red-950/20">
          <p className="text-sm font-semibold text-red-800 dark:text-red-400 mb-2">
            ❌ Before
          </p>
          <pre className="text-xs">
            <code>{`https://api.stripe.com/v1/customers`}</code>
          </pre>
        </div>

        <div className="border rounded-lg p-4 bg-green-50 dark:bg-green-950/20">
          <p className="text-sm font-semibold text-green-800 dark:text-green-400 mb-2">
            ✅ After
          </p>
          <pre className="text-xs">
            <code>{`https://rateguard.com/proxy/stripe_prod/v1/customers`}</code>
          </pre>
        </div>
      </div>

      <h3>3. Add Authentication</h3>
      <p>Include your RateGuard API key:</p>
      <pre>
        <code>{`fetch('https://rateguard.com/proxy/stripe_prod/v1/customers', {
  headers: {
    'Authorization': 'Bearer YOUR_RATEGUARD_TOKEN'
  }
})`}</code>
      </pre>

      <h2>URL Structure</h2>

      <p>RateGuard uses a simple URL pattern:</p>
      <pre>
        <code>{`https://rateguard.com/proxy/<api_name>/<endpoint_path>`}</code>
      </pre>

      <h3>Examples</h3>
      <pre>
        <code>{`# Stripe
https://rateguard.com/proxy/stripe_prod/v1/customers

# OpenAI
https://rateguard.com/proxy/openai_api/v1/chat/completions

# Custom API
https://rateguard.com/proxy/my_api/users?page=1&limit=10`}</code>
      </pre>

      <h2>Supported Features</h2>

      <h3>HTTP Methods</h3>
      <p>All HTTP methods are supported:</p>
      <ul>
        <li>
          <code>GET</code> - Retrieve data
        </li>
        <li>
          <code>POST</code> - Create resources
        </li>
        <li>
          <code>PUT</code> - Update resources
        </li>
        <li>
          <code>PATCH</code> - Partial updates
        </li>
        <li>
          <code>DELETE</code> - Remove resources
        </li>
        <li>
          <code>HEAD</code>, <code>OPTIONS</code> - Metadata requests
        </li>
      </ul>

      <h3>Request Headers</h3>
      <p>Headers are forwarded transparently:</p>
      <ul>
        <li>
          <strong>Content-Type:</strong> Preserved as-is
        </li>
        <li>
          <strong>Authorization:</strong> Your API key, not RateGuard&apos;s
        </li>
        <li>
          <strong>Custom Headers:</strong> Configured per API
        </li>
        <li>
          <strong>User-Agent:</strong> Can be customized
        </li>
      </ul>

      <h3>Request Body</h3>
      <p>Request bodies are forwarded unchanged:</p>
      <pre>
        <code>{`POST /proxy/my_api/users
Content-Type: application/json

{
  "name": "John Doe",
  "email": "john@example.com"
}

// Forwarded exactly as received to upstream API`}</code>
      </pre>

      <h3>Query Parameters</h3>
      <p>Query strings are preserved:</p>
      <pre>
        <code>{`GET /proxy/my_api/users?page=1&limit=10&sort=created_at

// Forwards to:
GET https://api.example.com/users?page=1&limit=10&sort=created_at`}</code>
      </pre>

      <h2>Streaming Support</h2>
      <p>RateGuard automatically detects and supports streaming responses:</p>

      <h3>Server-Sent Events (SSE)</h3>
      <pre>
        <code>{`// OpenAI streaming
const response = await fetch(
  'https://rateguard.com/proxy/openai_api/v1/chat/completions',
  {
    method: 'POST',
    headers: {
      'Authorization': 'Bearer YOUR_TOKEN',
      'Content-Type': 'application/json'
    },
    body: JSON.stringify({
      model: 'gpt-4',
      messages: [...],
      stream: true
    })
  }
);

const reader = response.body.getReader();
// Stream chunks automatically forwarded`}</code>
      </pre>

      <h3>Supported Streaming Formats</h3>
      <ul>
        <li>
          <strong>text/event-stream:</strong> Server-Sent Events (SSE)
        </li>
        <li>
          <strong>application/x-ndjson:</strong> Newline-delimited JSON
        </li>
        <li>
          <strong>Transfer-Encoding: chunked:</strong> Chunked responses
        </li>
      </ul>

      <h2>Per-API CORS Configuration</h2>
      <p>Configure CORS origins for each API:</p>

      <pre>
        <code>{`// API Configuration
{
  "name": "my_api",
  "target_url": "https://api.example.com",
  "allowed_origins": [
    "https://app.example.com",
    "https://admin.example.com"
  ]
}

// Requests from allowed origins receive CORS headers:
Access-Control-Allow-Origin: https://app.example.com
Access-Control-Allow-Methods: GET,POST,PUT,DELETE,OPTIONS
Access-Control-Allow-Headers: ...`}</code>
      </pre>

      <h2>Advanced Features</h2>

      <h3>Custom Headers</h3>
      <p>Add custom headers to all proxied requests:</p>
      <pre>
        <code>{`{
  "api_name": "my_api",
  "custom_headers": {
    "X-API-Version": "v2",
    "X-Custom-Auth": "secret_key"
  }
}`}</code>
      </pre>

      <h3>Retry Logic</h3>
      <p>Automatic retries on failures:</p>
      <pre>
        <code>{`{
  "retry_attempts": 3,
  "retry_backoff": "exponential"
}

// Retries with: 1s, 2s, 4s delays`}</code>
      </pre>

      <h3>Timeout Configuration</h3>
      <pre>
        <code>{`{
  "timeout_seconds": 30
}

// Request fails if upstream takes >30s`}</code>
      </pre>

      <h2>Response Metadata</h2>
      <p>RateGuard can include metadata in responses (configurable):</p>

      <pre>
        <code>{`{
  "request_id": "123e4567-e89b-12d3-a456-426614174000",
  "queued": true,
  "queue_duration": "0.123s",
  "proxy_duration": "0.456s",
  "upstream_status": 200,
  "rate_limit_remaining": 85,
  "body": {...}  // Actual API response
}`}</code>
      </pre>

      <h2>Integration Examples</h2>

      <h3>Axios (JavaScript)</h3>
      <pre>
        <code>{`import axios from 'axios';

const api = axios.create({
  baseURL: 'https://rateguard.com/proxy/my_api',
  headers: {
    'Authorization': 'Bearer YOUR_RATEGUARD_TOKEN'
  }
});

// Use normally
const users = await api.get('/users');
const newUser = await api.post('/users', { name: 'John' });`}</code>
      </pre>

      <h3>Python Requests</h3>
      <pre>
        <code>{`import requests

class RateGuardAPI:
    def __init__(self, api_name, token):
        self.base_url = f'https://rateguard.com/proxy/{api_name}'
        self.headers = {'Authorization': f'Bearer {token}'}
    
    def get(self, endpoint):
        return requests.get(
            f'{self.base_url}/{endpoint}',
            headers=self.headers
        ).json()

api = RateGuardAPI('my_api', 'YOUR_TOKEN')
users = api.get('users')`}</code>
      </pre>

      <h3>Go</h3>
      <pre>
        <code>{`package main

import (
    "fmt"
    "net/http"
)

func main() {
    client := &http.Client{}
    req, _ := http.NewRequest("GET", 
        "https://rateguard.com/proxy/my_api/users", nil)
    req.Header.Add("Authorization", "Bearer YOUR_TOKEN")
    
    resp, _ := client.Do(req)
    defer resp.Body.Close()
    
    // Process response
}`}</code>
      </pre>

      <h2>Monitoring & Analytics</h2>

      <p>Every proxied request is tracked and available in analytics:</p>
      <ul>
        <li>Request count per endpoint</li>
        <li>Response time distributions</li>
        <li>Status code breakdown</li>
        <li>Error rates and patterns</li>
        <li>Queue metrics</li>
      </ul>

      <h3>Dashboard View</h3>
      <p>
        View detailed analytics at{" "}
        <Link href="/dashboard">Dashboard → Analytics</Link>
      </p>

      <h2>Best Practices</h2>

      <div className="bg-yellow-50 dark:bg-yellow-950/20 border border-yellow-200 dark:border-yellow-900 rounded-lg p-4 my-6">
        <h4 className="mt-0">💡 Tips for Optimal Proxy Usage</h4>
        <ul className="mb-0">
          <li>
            <strong>Use descriptive API names:</strong> Makes analytics easier
            to understand
          </li>
          <li>
            <strong>Configure appropriate timeouts:</strong> Match upstream API
            characteristics
          </li>
          <li>
            <strong>Enable retries:</strong> For better reliability on transient
            failures
          </li>
          <li>
            <strong>Monitor response times:</strong> Identify slow endpoints
          </li>
          <li>
            <strong>Use custom headers wisely:</strong> Don&apos;t expose
            sensitive data
          </li>
        </ul>
      </div>

      <h2>Troubleshooting</h2>

      <h3>Connection Refused</h3>
      <p>If upstream API is unreachable:</p>
      <ul>
        <li>Verify target URL is correct</li>
        <li>Check if upstream API is accessible from RateGuard servers</li>
        <li>Verify firewall rules allow RateGuard IP addresses</li>
      </ul>

      <h3>Authentication Failures</h3>
      <p>If getting 401/403 errors:</p>
      <ul>
        <li>Check custom headers are configured correctly</li>
        <li>Verify API key is being passed to upstream</li>
        <li>Ensure Authorization header isn&apos;t being overridden</li>
      </ul>

      <h3>CORS Issues</h3>
      <p>If CORS errors in browser:</p>
      <ul>
        <li>Add your domain to allowed_origins</li>
        <li>Check CORS configuration for your API</li>
        <li>Verify OPTIONS requests are allowed</li>
      </ul>

      <h2>Related Documentation</h2>
      <ul>
        <li>
          <Link href="/docs/guides/rate-limiting">Rate Limiting Guide</Link>
        </li>
        <li>
          <Link href="/docs/features/queue-management">Queue Management</Link>
        </li>
        <li>
          <Link href="/docs/features/rate-limit-discovery">
            Rate Limit Discovery
          </Link>
        </li>
        <li>
          <Link href="/docs/api-reference">API Reference</Link>
        </li>
      </ul>

      <div className="bg-blue-50 dark:bg-blue-950/20 border border-blue-200 dark:border-blue-900 rounded-lg p-4 my-6">
        <p className="text-sm m-0">
          <strong>🚀 Get Started:</strong> Configure your first API in the{" "}
          <Link href="/dashboard/apis">API Management</Link> dashboard!
        </p>
      </div>
    </div>
  );
}
