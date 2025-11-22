"use client";

import { useState } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Copy, Check, ExternalLink } from "lucide-react";
import { toast } from "sonner";

interface APIProxyInfoProps {
  apiName: string;
  targetUrl: string;
}

export default function APIProxyInfo({
  apiName,
  targetUrl,
}: APIProxyInfoProps) {
  const [copiedField, setCopiedField] = useState<string | null>(null);

  const proxyUrl = `${
    process.env.NEXT_PUBLIC_API_URL || "http://localhost:8008"
  }/proxy/${apiName}`;

  const copyToClipboard = (text: string, field: string) => {
    navigator.clipboard.writeText(text);
    setCopiedField(field);
    toast.success("Copied to clipboard");
    setTimeout(() => setCopiedField(null), 2000);
  };

  const codeExamples = {
    curl: `# Instead of calling the API directly:
# curl ${targetUrl}/endpoint

# Call through RateGuard:
curl -X POST ${proxyUrl}/endpoint \\
  -H "Authorization: Bearer YOUR_API_KEY" \\
  -H "Content-Type: application/json" \\
  -d '{"key": "value"}'`,

    javascript: `// Instead of:
// fetch("${targetUrl}/endpoint")

// Call through RateGuard:
const response = await fetch("${proxyUrl}/endpoint", {
  method: "POST",
  headers: {
    "Authorization": "Bearer YOUR_API_KEY",
    "Content-Type": "application/json"
  },
  body: JSON.stringify({ key: "value" })
});

const data = await response.json();`,

    python: `# Instead of:
# requests.post("${targetUrl}/endpoint")

# Call through RateGuard:
import requests

response = requests.post(
    "${proxyUrl}/endpoint",
    headers={
        "Authorization": "Bearer YOUR_API_KEY",
        "Content-Type": "application/json"
    },
    json={"key": "value"}
)

data = response.json()`,

    go: `// Instead of:
// http.Post("${targetUrl}/endpoint", ...)

// Call through RateGuard:
import (
    "bytes"
    "encoding/json"
    "net/http"
)

payload := map[string]string{"key": "value"}
jsonData, _ := json.Marshal(payload)

req, _ := http.NewRequest("POST", "${proxyUrl}/endpoint", bytes.NewBuffer(jsonData))
req.Header.Set("Authorization", "Bearer YOUR_API_KEY")
req.Header.Set("Content-Type", "application/json")

client := &http.Client{}
resp, _ := client.Do(req)
defer resp.Body.Close()`,
  };

  return (
    <Card className="bg-slate-900 border-slate-800">
      <CardHeader>
        <CardTitle className="text-white flex items-center gap-2">
          <ExternalLink className="w-5 h-5" />
          Proxy Endpoint Information
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-6">
        {/* Proxy URL */}
        <div className="space-y-2">
          <div className="flex items-center justify-between">
            <label className="text-sm font-medium text-slate-300">
              Your Unique Proxy URL
            </label>
            <Badge className="bg-green-500/10 text-green-500 border-green-500/20">
              Active
            </Badge>
          </div>
          <div className="flex gap-2">
            <div className="flex-1 px-4 py-2 bg-slate-800 border border-slate-700 rounded-lg font-mono text-sm text-white break-all">
              {proxyUrl}
            </div>
            <Button
              onClick={() => copyToClipboard(proxyUrl, "proxy-url")}
              className="bg-slate-800 hover:bg-slate-700"
            >
              {copiedField === "proxy-url" ? (
                <Check className="w-4 h-4 text-green-500" />
              ) : (
                <Copy className="w-4 h-4" />
              )}
            </Button>
          </div>
          <p className="text-xs text-slate-400">
            Use this URL instead of calling{" "}
            <code className="text-blue-400">{targetUrl}</code> directly
          </p>
        </div>

        {/* How It Works */}
        <div className="space-y-2">
          <h3 className="text-sm font-medium text-slate-300">How It Works</h3>
          <div className="bg-slate-800 rounded-lg p-4 space-y-2">
            <div className="flex items-start gap-3">
              <div className="flex-shrink-0 w-6 h-6 bg-blue-500 rounded-full flex items-center justify-center text-white text-xs font-bold">
                1
              </div>
              <p className="text-sm text-slate-300">
                Replace <code className="text-blue-400">{targetUrl}</code> with{" "}
                <code className="text-green-400">{proxyUrl}</code> in your code
              </p>
            </div>
            <div className="flex items-start gap-3">
              <div className="flex-shrink-0 w-6 h-6 bg-blue-500 rounded-full flex items-center justify-center text-white text-xs font-bold">
                2
              </div>
              <p className="text-sm text-slate-300">
                Add your RateGuard API key in the{" "}
                <code className="text-orange-400">Authorization</code> header
              </p>
            </div>
            <div className="flex items-start gap-3">
              <div className="flex-shrink-0 w-6 h-6 bg-blue-500 rounded-full flex items-center justify-center text-white text-xs font-bold">
                3
              </div>
              <p className="text-sm text-slate-300">
                RateGuard handles rate limiting, queuing, and retries
                automatically - no more 429 errors!
              </p>
            </div>
          </div>
        </div>

        {/* Code Examples */}
        <div className="space-y-2">
          <h3 className="text-sm font-medium text-slate-300">Code Examples</h3>
          <Tabs defaultValue="curl" className="w-full">
            <TabsList className="grid w-full grid-cols-4 bg-slate-800">
              <TabsTrigger value="curl">cURL</TabsTrigger>
              <TabsTrigger value="javascript">JavaScript</TabsTrigger>
              <TabsTrigger value="python">Python</TabsTrigger>
              <TabsTrigger value="go">Go</TabsTrigger>
            </TabsList>

            {Object.entries(codeExamples).map(([lang, code]) => (
              <TabsContent key={lang} value={lang}>
                <div className="relative">
                  <pre className="bg-slate-950 p-4 rounded-lg overflow-x-auto text-sm text-slate-300 border border-slate-800">
                    <code>{code}</code>
                  </pre>
                  <Button
                    onClick={() => copyToClipboard(code, `code-${lang}`)}
                    size="sm"
                    className="absolute top-2 right-2 bg-slate-800 hover:bg-slate-700"
                  >
                    {copiedField === `code-${lang}` ? (
                      <Check className="w-3 h-3 text-green-500" />
                    ) : (
                      <Copy className="w-3 h-3" />
                    )}
                  </Button>
                </div>
              </TabsContent>
            ))}
          </Tabs>
        </div>

        {/* Benefits */}
        <div className="space-y-2">
          <h3 className="text-sm font-medium text-slate-300">Benefits</h3>
          <ul className="space-y-2">
            {[
              "✅ No more 429 rate limit errors",
              "✅ Automatic request queuing and retry",
              "✅ Real-time usage tracking",
              "✅ Detailed analytics dashboard",
              "✅ Zero code changes to your logic",
            ].map((benefit, index) => (
              <li
                key={index}
                className="flex items-center gap-2 text-sm text-slate-300"
              >
                {benefit}
              </li>
            ))}
          </ul>
        </div>
      </CardContent>
    </Card>
  );
}
