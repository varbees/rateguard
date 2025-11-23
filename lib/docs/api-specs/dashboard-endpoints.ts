import { EndpointSpec, API_BASE_URL } from "./types";

export const DASHBOARD_STATS: EndpointSpec = {
  id: "dashboard-stats",
  method: "GET",
  path: "/api/v1/dashboard/stats",
  category: "Dashboard & Analytics",
  title: "Get Dashboard Statistics",
  description:
    "Returns comprehensive dashboard statistics including total requests, APIs, and usage metrics.",
  authentication: true,
  authType: "X-API-Key header",
  responses: [
    {
      status: 200,
      description: "Dashboard statistics",
      example: {
        total_requests_today: 1250,
        total_requests_month: 45000,
        total_apis: 5,
        active_apis: 4,
        plan_limit: 100000,
        usage_percentage: 45.0,
        requests_by_status: {
          "200": 1100,
          "429": 50,
          "500": 100,
        },
      },
      headers: {
        "X-RateLimit-Limit": "100",
        "X-RateLimit-Remaining": "98",
        "X-RateLimit-Reset": "1705315800",
      },
    },
  ],
  codeExamples: [
    {
      language: "javascript",
      label: "JavaScript",
      code: `const response = await fetch('${API_BASE_URL}/dashboard/stats', {
  headers: { 'X-API-Key': 'rg_your_api_key_here' }
});

const stats = await response.json();
console.log(\`Total requests today: \${stats.total_requests_today}\`);
console.log(\`Usage: \${stats.usage_percentage}%\`);`,
    },
    {
      language: "python",
      label: "Python",
      code: `headers = {'X-API-Key': 'rg_your_api_key_here'}

response = requests.get('${API_BASE_URL}/dashboard/stats', headers=headers)
stats = response.json()

print(f"Total requests today: {stats['total_requests_today']}")
print(f"Usage: {stats['usage_percentage']}%")`,
    },
    {
      language: "go",
      label: "Go",
      code: `req, _ := http.NewRequest("GET", "${API_BASE_URL}/dashboard/stats", nil)
req.Header.Set("X-API-Key", apiKey)

resp, _ := http.DefaultClient.Do(req)
defer resp.Body.Close()

var stats map[string]interface{}
json.NewDecoder(resp.Body).Decode(&stats)

fmt.Printf("Total requests today: %.0f\\n", stats["total_requests_today"])`,
    },
    {
      language: "ruby",
      label: "Ruby",
      code: `response = RestClient.get(
  '${API_BASE_URL}/dashboard/stats',
  { 'X-API-Key' => 'rg_your_api_key_here' }
)

stats = JSON.parse(response.body)
puts "Total requests today: #{stats['total_requests_today']}"
puts "Usage: #{stats['usage_percentage']}%"`,
    },
  ],
  errorScenarios: [
    {
      status: 401,
      error: "Unauthorized",
      description: "Missing or invalid API key",
      solution: "Include valid X-API-Key header",
    },
  ],
  rateLimitHeaders: true,
};

export const DASHBOARD_USAGE: EndpointSpec = {
  id: "dashboard-usage",
  method: "GET",
  path: "/api/v1/dashboard/usage",
  category: "Dashboard & Analytics",
  title: "Get Usage Statistics",
  description:
    "Returns detailed usage statistics for a specific time period. Default is last 30 days.",
  authentication: true,
  authType: "X-API-Key header",
  queryParams: [
    {
      name: "start_date",
      type: "string (RFC3339)",
      required: false,
      description: "Start date for statistics",
      example: "2024-01-01T00:00:00Z",
    },
    {
      name: "end_date",
      type: "string (RFC3339)",
      required: false,
      description: "End date for statistics",
      example: "2024-01-31T23:59:59Z",
    },
  ],
  responses: [
    {
      status: 200,
      description: "Usage statistics",
      example: {
        start_date: "2024-01-01T00:00:00Z",
        end_date: "2024-01-31T23:59:59Z",
        total_requests: 125000,
        successful_requests: 120000,
        failed_requests: 5000,
        rate_limited_requests: 2500,
        average_response_time_ms: 125,
        daily_breakdown: [
          {
            date: "2024-01-15",
            requests: 4500,
            success_rate: 0.96,
          },
        ],
      },
    },
  ],
  codeExamples: [
    {
      language: "javascript",
      label: "JavaScript",
      code: `const startDate = '2024-01-01T00:00:00Z';
const endDate = '2024-01-31T23:59:59Z';

const response = await fetch(
  \`${API_BASE_URL}/dashboard/usage?start_date=\${startDate}&end_date=\${endDate}\`,
  { headers: { 'X-API-Key': 'rg_your_api_key_here' } }
);

const usage = await response.json();
console.log(\`Total requests: \${usage.total_requests}\`);
console.log(\`Success rate: \${(usage.successful_requests / usage.total_requests * 100).toFixed(2)}%\`);`,
    },
    {
      language: "python",
      label: "Python",
      code: `from datetime import datetime

params = {
    'start_date': '2024-01-01T00:00:00Z',
    'end_date': '2024-01-31T23:59:59Z'
}

response = requests.get(
    '${API_BASE_URL}/dashboard/usage',
    headers={'X-API-Key': 'rg_your_api_key_here'},
    params=params
)

usage = response.json()
success_rate = (usage['successful_requests'] / usage['total_requests']) * 100
print(f"Success rate: {success_rate:.2f}%")`,
    },
    {
      language: "go",
      label: "Go",
      code: `url := "${API_BASE_URL}/dashboard/usage?start_date=2024-01-01T00:00:00Z&end_date=2024-01-31T23:59:59Z"

req, _ := http.NewRequest("GET", url, nil)
req.Header.Set("X-API-Key", apiKey)

resp, _ := http.DefaultClient.Do(req)
defer resp.Body.Close()

var usage map[string]interface{}
json.NewDecoder(resp.Body).Decode(&usage)`,
    },
    {
      language: "ruby",
      label: "Ruby",
      code: `params = {
  start_date: '2024-01-01T00:00:00Z',
  end_date: '2024-01-31T23:59:59Z'
}

url = "${API_BASE_URL}/dashboard/usage?" + URI.encode_www_form(params)

response = RestClient.get(
  url,
  { 'X-API-Key' => 'rg_your_api_key_here' }
)

usage = JSON.parse(response.body)`,
    },
  ],
  errorScenarios: [
    {
      status: 401,
      error: "Unauthorized",
      description: "Missing or invalid API key",
      solution: "Include valid X-API-Key header",
    },
  ],
  rateLimitHeaders: true,
};

export const PROXY_REQUEST: EndpointSpec = {
  id: "proxy-request",
  method: "ANY",
  path: "/api/v1/proxy/:api_name/*",
  category: "Proxy",
  title: "Transparent Proxy",
  description:
    "Proxy requests to configured APIs with automatic rate limiting, CORS handling, and usage tracking. Supports all HTTP methods.",
  authentication: true,
  authType: "X-API-Key header",
  pathParams: [
    {
      name: "api_name",
      type: "string",
      required: true,
      description: "Name of the configured API (from API Management)",
      example: "github-api",
    },
    {
      name: "*",
      type: "string",
      required: false,
      description: "Path to proxy to target API",
      example: "users/octocat",
    },
  ],
  responses: [
    {
      status: 200,
      description: "Successful proxy response (actual status from target API)",
      example: {
        data: "Response from target API...",
      },
      headers: {
        "X-RateGuard-Request-ID": "req_abc123xyz789",
        "X-RateGuard-Duration-Ms": "125",
        "X-RateLimit-Limit": "10",
        "X-RateLimit-Remaining": "7",
        "X-RateLimit-Reset": "1705315800",
      },
    },
    {
      status: 404,
      description: "API not found",
      example: {
        error: "API not found",
        message: "The specified API configuration does not exist",
        request_id: "req_abc123xyz789",
        timestamp: "2024-01-15T10:30:00Z",
      },
    },
    {
      status: 429,
      description: "Rate limit exceeded",
      example: {
        error: "Rate limit exceeded",
        message: "Too many requests",
        limit_type: "per_second",
        retry_after: 1,
        request_id: "req_abc123xyz789",
        timestamp: "2024-01-15T10:30:00Z",
      },
      headers: {
        "X-RateLimit-Limit": "10",
        "X-RateLimit-Remaining": "0",
        "X-RateLimit-Reset": "1705315800",
        "Retry-After": "1",
      },
    },
  ],
  codeExamples: [
    {
      language: "javascript",
      label: "JavaScript",
      code: `// Replace direct API call with RateGuard proxy
// Before: https://api.github.com/users/octocat
// After:  https://api.rateguard.io/v1/proxy/github-api/users/octocat

const response = await fetch(
  '${API_BASE_URL}/proxy/github-api/users/octocat',
  {
    headers: {
      'X-API-Key': 'rg_your_api_key_here',
      'Accept': 'application/json'
    }
  }
);

// Check rate limit
const remaining = response.headers.get('X-RateLimit-Remaining');
const reset = response.headers.get('X-RateLimit-Reset');
console.log(\`Remaining: \${remaining}, Reset: \${new Date(reset * 1000)}\`);

const data = await response.json();

// Check response time
const duration = response.headers.get('X-RateGuard-Duration-Ms');
console.log(\`Response time: \${duration}ms\`);`,
    },
    {
      language: "python",
      label: "Python",
      code: `import requests
from datetime import datetime

# RateGuard proxy endpoint
url = '${API_BASE_URL}/proxy/github-api/users/octocat'

headers = {
    'X-API-Key': 'rg_your_api_key_here',
    'Accept': 'application/json'
}

response = requests.get(url, headers=headers)

# Check rate limit
remaining = response.headers.get('X-RateLimit-Remaining')
reset = response.headers.get('X-RateLimit-Reset')
reset_time = datetime.fromtimestamp(int(reset))
print(f"Remaining: {remaining}, Reset: {reset_time}")

# Check response time
duration = response.headers.get('X-RateGuard-Duration-Ms')
print(f"Response time: {duration}ms")

data = response.json()`,
    },
    {
      language: "go",
      label: "Go",
      code: `package main

import (
    "encoding/json"
    "fmt"
    "net/http"
    "time"
)

func proxyRequest() error {
    url := "${API_BASE_URL}/proxy/github-api/users/octocat"
    
    req, _ := http.NewRequest("GET", url, nil)
    req.Header.Set("X-API-Key", apiKey)
    req.Header.Set("Accept", "application/json")
    
    resp, err := http.DefaultClient.Do(req)
    if err != nil {
        return err
    }
    defer resp.Body.Close()
    
    // Check rate limit
    remaining := resp.Header.Get("X-RateLimit-Remaining")
    reset := resp.Header.Get("X-RateLimit-Reset")
    fmt.Printf("Remaining: %s, Reset: %s\\n", remaining, reset)
    
    // Check response time
    duration := resp.Header.Get("X-RateGuard-Duration-Ms")
    fmt.Printf("Response time: %sms\\n", duration)
    
    var data map[string]interface{}
    json.NewDecoder(resp.Body).Decode(&data)
    
    return nil
}`,
    },
    {
      language: "ruby",
      label: "Ruby",
      code: `require 'rest-client'
require 'json'

url = '${API_BASE_URL}/proxy/github-api/users/octocat'

response = RestClient.get(
  url,
  {
    'X-API-Key' => 'rg_your_api_key_here',
    'Accept' => 'application/json'
  }
)

# Check rate limit
remaining = response.headers[:x_ratelimit_remaining]
reset = response.headers[:x_ratelimit_reset]
reset_time = Time.at(reset.to_i)
puts "Remaining: #{remaining}, Reset: #{reset_time}"

# Check response time
duration = response.headers[:x_rateguard_duration_ms]
puts "Response time: #{duration}ms"

data = JSON.parse(response.body)`,
    },
  ],
  errorScenarios: [
    {
      status: 401,
      error: "Unauthorized",
      description: "Missing or invalid API key",
      solution: "Include valid X-API-Key header in request",
    },
    {
      status: 403,
      error: "API disabled",
      description: "The target API configuration is currently disabled",
      solution: "Enable the API in your dashboard or contact administrator",
    },
    {
      status: 404,
      error: "API not found",
      description: "No API configuration found with this name",
      solution:
        "Check the API name is correct or create a new API configuration",
    },
    {
      status: 429,
      error: "Rate limit exceeded",
      description:
        "One of the rate limit tiers has been exceeded (per-second, burst, hourly, or daily)",
      solution:
        "Wait for the rate limit to reset (check Retry-After header) or upgrade your plan",
    },
    {
      status: 502,
      error: "Proxy failed",
      description:
        "Failed to proxy request to target API (timeout, connection error, etc.)",
      solution:
        "Check target API is accessible, or increase timeout_seconds in API configuration",
    },
  ],
  rateLimitHeaders: true,
};

export const DASHBOARD_ENDPOINTS = [
  DASHBOARD_STATS,
  DASHBOARD_USAGE,
  PROXY_REQUEST,
];
