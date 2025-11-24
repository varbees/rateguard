"use client";

import * as React from "react";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { CopyButton } from "@/components/docs/CopyButton";
import { Eye, Code2, Link2 } from "lucide-react";

interface PreviewPanelProps {
  apiName: string;
  targetUrl: string;
  perSecond: number;
  burst: number;
  perHour: number;
  perDay: number;
  perMonth: number;
}

const API_BASE_URL = "https://api.rateguard.io/v1";

function formatNumber(num: number): string {
  if (num >= 1000000) return `${(num / 1000000).toFixed(1)}M`;
  if (num >= 1000) return `${(num / 1000).toFixed(1)}K`;
  return num.toString();
}

export function PreviewPanel({
  apiName,
  targetUrl,
  perSecond,
  burst,
  perHour,
  perDay,
  perMonth,
}: PreviewPanelProps) {
  const slugifiedName = apiName
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");

  const proxyUrl = slugifiedName
    ? `${API_BASE_URL}/proxy/${slugifiedName}`
    : `${API_BASE_URL}/proxy/your-api-name`;

  const apiKey = "rg_your_api_key_here";

  const codeExamples = {
    javascript: `// Using fetch API
const response = await fetch('${proxyUrl}/endpoint', {
  method: 'GET',
  headers: {
    'X-API-Key': '${apiKey}',
    'Content-Type': 'application/json'
  }
});

const data = await response.json();

// Check rate limit headers
const remaining = response.headers.get('X-RateLimit-Remaining');
console.log(\`Remaining: \${remaining}\`);`,

    python: `import requests

# Make a protected request
response = requests.get(
    '${proxyUrl}/endpoint',
    headers={
        'X-API-Key': '${apiKey}',
        'Content-Type': 'application/json'
    }
)

data = response.json()

# Check rate limit
remaining = response.headers.get('X-RateLimit-Remaining')
print(f'Remaining: {remaining}')`,

    curl: `# Test your protected API
curl -X GET '${proxyUrl}/endpoint' \\
  -H 'X-API-Key: ${apiKey}' \\
  -H 'Content-Type: application/json'

# The response will include rate limit headers:
# X-RateLimit-Limit: ${perSecond}
# X-RateLimit-Remaining: (decrements with each request)
# X-RateLimit-Reset: (unix timestamp)`,

    go: `package main

import (
    "fmt"
    "net/http"
    "io"
)

func main() {
    req, _ := http.NewRequest("GET", "${proxyUrl}/endpoint", nil)
    req.Header.Set("X-API-Key", "${apiKey}")
    req.Header.Set("Content-Type", "application/json")
    
    resp, _ := http.DefaultClient.Do(req)
    defer resp.Body.Close()
    
    body, _ := io.ReadAll(resp.Body)
    fmt.Println(string(body))
    
    // Check rate limit
    remaining := resp.Header.Get("X-RateLimit-Remaining")
    fmt.Printf("Remaining: %s\\n", remaining)
}`,
  };

  return (
    <div className="space-y-6 sticky top-8">
      {/* Proxy URL Card */}
      <Card className="border-2 border-primary/50">
        <CardHeader>
          <CardTitle className="flex items-center gap-2 text-lg">
            <Link2 className="size-4 text-primary" />
            Your Proxy URL
          </CardTitle>
          <CardDescription>
            Use this URL instead of calling {targetUrl || "your API"} directly
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="flex items-center gap-2 p-3 bg-muted/50 rounded-lg border">
            <code className="flex-1 text-xs break-all font-mono">
              {proxyUrl}
            </code>
            <CopyButton value={proxyUrl} />
          </div>
          {!slugifiedName && (
            <p className="text-xs text-muted-foreground">
              Enter an API name to generate your proxy URL
            </p>
          )}
        </CardContent>
      </Card>

      {/* Rate Limit Summary */}
      <Card className="border-2">
        <CardHeader>
          <CardTitle className="flex items-center gap-2 text-lg">
            <Eye className="size-4 text-primary" />
            Rate Limit Summary
          </CardTitle>
        </CardHeader>
        <CardContent>
          <div className="space-y-3">
            <div className="flex items-center justify-between p-3 bg-blue-50 dark:bg-blue-950 rounded-lg">
              <span className="text-sm font-medium">Per Second</span>
              <Badge className="bg-blue-600">{perSecond} req/s</Badge>
            </div>
            <div className="flex items-center justify-between p-3 bg-purple-50 dark:bg-purple-950 rounded-lg">
              <span className="text-sm font-medium">Burst Allowance</span>
              <Badge className="bg-purple-600">{burst} requests</Badge>
            </div>
            <div className="flex items-center justify-between p-3 bg-green-50 dark:bg-green-950 rounded-lg">
              <span className="text-sm font-medium">Per Hour</span>
              <Badge className="bg-green-600">
                {perHour === 0 ? "Unlimited" : `${formatNumber(perHour)}`}
              </Badge>
            </div>
            <div className="flex items-center justify-between p-3 bg-orange-50 dark:bg-orange-950 rounded-lg">
              <span className="text-sm font-medium">Per Day</span>
              <Badge className="bg-orange-600">
                {perDay === 0 ? "Unlimited" : `${formatNumber(perDay)}`}
              </Badge>
            </div>
            <div className="flex items-center justify-between p-3 bg-purple-50 dark:bg-purple-950 rounded-lg">
              <span className="text-sm font-medium">Per Month</span>
              <Badge className="bg-purple-600">
                {perMonth === 0 ? "Unlimited" : `${formatNumber(perMonth)}`}
              </Badge>
            </div>
          </div>

          <div className="mt-4 p-4 bg-muted/50 rounded-lg">
            <p className="text-sm text-muted-foreground">
              Your API will accept{" "}
              <strong>{perSecond} requests per second</strong> with burst
              tolerance of <strong>{burst} requests</strong>.
              {perHour > 0 && ` Hourly limit: ${formatNumber(perHour)}.`}
              {perDay > 0 && ` Daily limit: ${formatNumber(perDay)}.`}
              {perMonth > 0 && ` Monthly limit: ${formatNumber(perMonth)}.`}
            </p>
          </div>
        </CardContent>
      </Card>

      {/* Code Examples */}
      <Card className="border-2">
        <CardHeader>
          <CardTitle className="flex items-center gap-2 text-lg">
            <Code2 className="size-4 text-primary" />
            Code Examples
          </CardTitle>
          <CardDescription>
            Copy and paste into your application
          </CardDescription>
        </CardHeader>
        <CardContent>
          <Tabs defaultValue="javascript" className="w-full">
            <TabsList className="grid w-full grid-cols-4">
              <TabsTrigger value="javascript" className="text-xs">
                JavaScript
              </TabsTrigger>
              <TabsTrigger value="python" className="text-xs">
                Python
              </TabsTrigger>
              <TabsTrigger value="curl" className="text-xs">
                cURL
              </TabsTrigger>
              <TabsTrigger value="go" className="text-xs">
                Go
              </TabsTrigger>
            </TabsList>

            {Object.entries(codeExamples).map(([lang, code]) => (
              <TabsContent key={lang} value={lang} className="mt-4">
                <div className="relative">
                  <pre className="p-4 bg-muted rounded-lg text-xs overflow-x-auto max-h-[300px] overflow-y-auto">
                    <code>{code}</code>
                  </pre>
                  <div className="absolute top-2 right-2">
                    <CopyButton value={code} />
                  </div>
                </div>
              </TabsContent>
            ))}
          </Tabs>
        </CardContent>
      </Card>
    </div>
  );
}
