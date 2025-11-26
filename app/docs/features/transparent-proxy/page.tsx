import { Metadata } from "next";
import {
  Server,
  Shield,
  Zap,
  Globe,
  Lock,
  Activity,
  ArrowRight,
  Code,
  Network,
} from "lucide-react";
import { DocsSectionHeader } from "@/components/docs/section-header";
import { CodeBlock } from "@/components/docs/code-block";
import { CodeTabs } from "@/components/docs/CodeTabs";
import { DocsPager } from "@/components/docs/pager";
import { Callout } from "@/components/docs/Callout";

export const metadata: Metadata = {
  title: "Transparent Proxy | RateGuard Documentation",
  description:
    "Learn how RateGuard's transparent proxy seamlessly forwards requests to your upstream APIs.",
};

export default function TransparentProxyPage() {
  return (
    <div className="space-y-8">
      <div className="space-y-4">
        <h1 className="text-3xl font-bold tracking-tight">Transparent Proxy</h1>
        <p className="text-xl text-muted-foreground">
          Seamlessly forward requests to your upstream APIs while applying rate
          limiting, queuing, and analytics.
        </p>
      </div>

      <Callout title="Drop-In Replacement" type="default">
        Simply replace your API base URL with RateGuard&apos;s proxy URL - no
        code changes required!
      </Callout>

      <div className="grid gap-8">
        <DocsSectionHeader
          icon={<Network className="h-5 w-5" />}
          title="How It Works"
          description="The transparent proxy intercepts your API calls, applies policies, and forwards them to the target."
        />

        <div className="prose prose-slate dark:prose-invert max-w-none">
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
        </div>

        <DocsSectionHeader
          icon={<Zap className="h-5 w-5" />}
          title="Quick Start"
          description="Get up and running with the transparent proxy in minutes."
        />

        <div className="space-y-6">
          <div className="space-y-4">
            <h3 className="text-lg font-semibold">1. Configure Your API</h3>
            <p className="text-muted-foreground">
              In the dashboard, create an API configuration with your target URL:
            </p>
            <CodeBlock
              language="yaml"
              value={`API Name: stripe_prod
Target URL: https://api.stripe.com
Rate Limit: 100 req/s
Burst: 10`}
            />
          </div>

          <div className="space-y-4">
            <h3 className="text-lg font-semibold">2. Update Your Code</h3>
            <p className="text-muted-foreground">Replace your base URL:</p>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div className="border rounded-lg p-4 bg-red-50 dark:bg-red-950/20">
                <p className="text-sm font-semibold text-red-800 dark:text-red-400 mb-2">
                  ❌ Before
                </p>
                <code className="text-xs bg-transparent p-0">
                  https://api.stripe.com/v1/customers
                </code>
              </div>
              <div className="border rounded-lg p-4 bg-green-50 dark:bg-green-950/20">
                <p className="text-sm font-semibold text-green-800 dark:text-green-400 mb-2">
                  ✅ After
                </p>
                <code className="text-xs bg-transparent p-0">
                  https://rateguard.com/proxy/stripe_prod/v1/customers
                </code>
              </div>
            </div>
          </div>

          <div className="space-y-4">
            <h3 className="text-lg font-semibold">3. Add Authentication</h3>
            <p className="text-muted-foreground">
              Include your RateGuard API key:
            </p>
            <CodeBlock
              language="javascript"
              value={`fetch('https://rateguard.com/proxy/stripe_prod/v1/customers', {
  headers: {
    'Authorization': 'Bearer YOUR_RATEGUARD_TOKEN'
  }
})`}
            />
          </div>
        </div>

        <DocsSectionHeader
          icon={<Globe className="h-5 w-5" />}
          title="URL Structure"
          description="Understanding how to construct proxy URLs."
        />

        <div className="space-y-4">
          <p className="text-muted-foreground">
            RateGuard uses a simple URL pattern:
          </p>
          <CodeBlock
            language="bash"
            value="https://rateguard.com/proxy/<api_name>/<endpoint_path>"
          />
          <h4 className="font-semibold mt-4">Examples</h4>
          <CodeBlock
            language="bash"
            value={`# Stripe
https://rateguard.com/proxy/stripe_prod/v1/customers

# OpenAI
https://rateguard.com/proxy/openai_api/v1/chat/completions

# Custom API
https://rateguard.com/proxy/my_api/users?page=1&limit=10`}
          />
        </div>

        <DocsSectionHeader
          icon={<Server className="h-5 w-5" />}
          title="Supported Features"
          description="RateGuard supports all standard HTTP features."
        />

        <div className="prose prose-slate dark:prose-invert max-w-none">
          <h3>HTTP Methods</h3>
          <p>
            All HTTP methods are supported (GET, POST, PUT, PATCH, DELETE, HEAD,
            OPTIONS).
          </p>

          <h3>Request Headers</h3>
          <ul>
            <li>
              <strong>Content-Type:</strong> Preserved as-is
            </li>
            <li>
              <strong>Authorization:</strong> Your API key (RateGuard token)
            </li>
            <li>
              <strong>Custom Headers:</strong> Configured per API
            </li>
            <li>
              <strong>User-Agent:</strong> Can be customized
            </li>
          </ul>

          <h3>Request Body</h3>
          <p>
            Request bodies are forwarded unchanged, supporting JSON, XML, form
            data, and binary payloads.
          </p>

          <h3>Query Parameters</h3>
          <p>
            Query strings are preserved and forwarded exactly as received.
          </p>
        </div>

        <DocsSectionHeader
          icon={<Activity className="h-5 w-5" />}
          title="Streaming Support"
          description="Native support for Server-Sent Events (SSE) and chunked transfer encoding."
        />

        <div className="space-y-4">
          <p className="text-muted-foreground">
            RateGuard automatically detects and supports streaming responses,
            making it perfect for AI applications.
          </p>
          <CodeTabs
            examples={[
              {
                label: "JavaScript (SSE)",
                language: "javascript",
                code: `// OpenAI streaming example
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
// Stream chunks are automatically forwarded`,
              },
            ]}
          />
        </div>

        <DocsSectionHeader
          icon={<Shield className="h-5 w-5" />}
          title="Advanced Configuration"
          description="Fine-tune your proxy behavior."
        />

        <div className="space-y-6">
          <div className="space-y-4">
            <h3 className="text-lg font-semibold">Per-API CORS</h3>
            <p className="text-muted-foreground">
              Configure Cross-Origin Resource Sharing (CORS) for each API:
            </p>
            <CodeBlock
              language="json"
              value={`{
  "name": "my_api",
  "target_url": "https://api.example.com",
  "allowed_origins": [
    "https://app.example.com",
    "https://admin.example.com"
  ]
}`}
            />
          </div>

          <div className="space-y-4">
            <h3 className="text-lg font-semibold">Custom Headers</h3>
            <p className="text-muted-foreground">
              Inject custom headers into every request (e.g., for upstream
              authentication):
            </p>
            <CodeBlock
              language="json"
              value={`{
  "api_name": "my_api",
  "custom_headers": {
    "X-API-Version": "v2",
    "X-Custom-Auth": "secret_key"
  }
}`}
            />
          </div>
        </div>

        <DocsSectionHeader
          icon={<Code className="h-5 w-5" />}
          title="Integration Examples"
          description="Connect to RateGuard from any language."
        />

        <CodeTabs
          examples={[
            {
              label: "Axios",
              language: "javascript",
              code: `import axios from 'axios';

const api = axios.create({
  baseURL: 'https://rateguard.com/proxy/my_api',
  headers: {
    'Authorization': 'Bearer YOUR_RATEGUARD_TOKEN'
  }
});

// Use normally
const users = await api.get('/users');
const newUser = await api.post('/users', { name: 'John' });`,
            },
            {
              label: "Python",
              language: "python",
              code: `import requests

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
users = api.get('users')`,
            },
            {
              label: "Go",
              language: "go",
              code: `package main

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
}`,
            },
          ]}
        />

        <Callout title="Best Practices" type="warning">
          <ul className="list-disc pl-4 space-y-1 mt-2">
            <li>
              <strong>Use descriptive API names:</strong> Makes analytics easier
              to understand.
            </li>
            <li>
              <strong>Configure timeouts:</strong> Match upstream API
              characteristics.
            </li>
            <li>
              <strong>Enable retries:</strong> For better reliability on
              transient failures.
            </li>
            <li>
              <strong>Secure headers:</strong> Don&apos;t expose sensitive keys
              in client-side code; use server-side proxying or custom headers
              injection.
            </li>
          </ul>
        </Callout>

        <DocsPager
          prev={{
            href: "/docs/guides/rate-limiting",
            title: "Rate Limiting Guide",
          }}
          next={{
            href: "/docs/features/distributed-rate-limiting",
            title: "Distributed Rate Limiting",
          }}
        />
      </div>
    </div>
  );
}
