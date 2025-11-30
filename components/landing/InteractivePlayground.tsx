"use client";

import { useState } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { Play, Copy, Check, Loader2, AlertCircle } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";

interface RequestResult {
  success: boolean;
  status: number;
  tokensUsed?: number;
  latency: number;
  cost?: number;
  rateLimit?: {
    limit: number;
    remaining: number;
    reset: number;
  };
}

const codeExamples = {
  curl: `curl -X POST https://api.rateguard.io/v1/proxy/openai/chat \\
  -H "X-RateGuard-Key: your_api_key" \\
  -H "Content-Type: application/json" \\
  -d '{
    "model": "gpt-4",
    "messages": [{"role": "user", "content": "Hello!"}]
  }'`,
  
  javascript: `const response = await fetch('https://api.rateguard.io/v1/proxy/openai/chat', {
  method: 'POST',
  headers: {
    'X-RateGuard-Key': 'your_api_key',
    'Content-Type': 'application/json'
  },
  body: JSON.stringify({
    model: 'gpt-4',
    messages: [{role: 'user', content: 'Hello!'}]
  })
});

const data = await response.json();
console.log('Tokens used:', response.headers.get('X-RateGuard-Tokens'));`,

  python: `import requests

response = requests.post(
    'https://api.rateguard.io/v1/proxy/openai/chat',
    headers={
        'X-RateGuard-Key': 'your_api_key',
        'Content-Type': 'application/json'
    },
    json={
        'model': 'gpt-4',
        'messages': [{'role': 'user', 'content': 'Hello!'}]
    }
)

print(f"Tokens used: {response.headers.get('X-RateGuard-Tokens')}")`,

  go: `package main

import (
    "bytes"
    "encoding/json"
    "net/http"
)

func main() {
    payload := map[string]interface{}{
        "model": "gpt-4",
        "messages": []map[string]string{
            {"role": "user", "content": "Hello!"},
        },
    }
    
    body, _ := json.Marshal(payload)
    req, _ := http.NewRequest("POST", 
        "https://api.rateguard.io/v1/proxy/openai/chat", 
        bytes.NewBuffer(body))
    
    req.Header.Set("X-RateGuard-Key", "your_api_key")
    req.Header.Set("Content-Type", "application/json")
    
    client := &http.Client{}
    resp, _ := client.Do(req)
    defer resp.Body.Close()
    
    tokens := resp.Header.Get("X-RateGuard-Tokens")
    println("Tokens used:", tokens)
}`,
};

export function InteractivePlayground() {
  const [isRunning, setIsRunning] = useState(false);
  const [result, setResult] = useState<RequestResult | null>(null);
  const [copied, setCopied] = useState(false);
  const [selectedLang, setSelectedLang] = useState<keyof typeof codeExamples>("curl");

  const handleRun = async () => {
    setIsRunning(true);
    setResult(null);

    // Simulate API call with realistic timing
    await new Promise((resolve) => setTimeout(resolve, 1200));

    // Simulate result
    const mockResult: RequestResult = {
      success: Math.random() > 0.1, // 90% success rate
      status: Math.random() > 0.1 ? 200 : 429,
      tokensUsed: Math.floor(Math.random() * 1000) + 500,
      latency: Math.random() * 50 + 10, // 10-60ms
      cost: (Math.random() * 0.05 + 0.01),
      rateLimit: {
        limit: 1000,
        remaining: Math.floor(Math.random() * 800) + 100,
        reset: Date.now() + 3600000,
      },
    };

    setResult(mockResult);
    setIsRunning(false);
  };

  const handleCopy = () => {
    navigator.clipboard.writeText(codeExamples[selectedLang]);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  return (
    <div className="w-full max-w-5xl mx-auto">
      <div className="bg-card border rounded-2xl overflow-hidden">
        {/* Header */}
        <div className="border-b px-6 py-4 bg-muted/30">
          <h3 className="text-xl font-bold mb-1">Try It Yourself</h3>
          <p className="text-sm text-muted-foreground">
            Run a sample request and see RateGuard in action
          </p>
        </div>

        <div className="p-6">
          {/* Code Editor Tabs */}
          <Tabs
            value={selectedLang}
            onValueChange={(value) => setSelectedLang(value as keyof typeof codeExamples)}
            className="mb-4"
          >
            <div className="flex items-center justify-between mb-3">
              <TabsList>
                <TabsTrigger value="curl">cURL</TabsTrigger>
                <TabsTrigger value="javascript">JavaScript</TabsTrigger>
                <TabsTrigger value="python">Python</TabsTrigger>
                <TabsTrigger value="go">Go</TabsTrigger>
              </TabsList>

              <Button
                variant="ghost"
                size="sm"
                onClick={handleCopy}
                className="gap-2"
              >
                {copied ? (
                  <>
                    <Check className="w-4 h-4" />
                    Copied!
                  </>
                ) : (
                  <>
                    <Copy className="w-4 h-4" />
                    Copy
                  </>
                )}
              </Button>
            </div>

            {Object.entries(codeExamples).map(([lang, code]) => (
              <TabsContent key={lang} value={lang} className="mt-0">
                <div className="relative">
                  <pre className="bg-muted/50 border rounded-xl p-4 overflow-x-auto text-sm font-mono">
                    <code>{code}</code>
                  </pre>
                </div>
              </TabsContent>
            ))}
          </Tabs>

          {/* Run Button */}
          <div className="flex justify-center mb-6">
            <Button
              onClick={handleRun}
              disabled={isRunning}
              size="lg"
              className="gap-2 px-8"
            >
              {isRunning ? (
                <>
                  <Loader2 className="w-4 h-4 animate-spin" />
                  Running...
                </>
              ) : (
                <>
                  <Play className="w-4 h-4" />
                  Run Sample Request
                </>
              )}
            </Button>
          </div>

          {/* Results Panel */}
          <AnimatePresence mode="wait">
            {result && (
              <motion.div
                initial={{ opacity: 0, y: 20 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, y: -20 }}
                className={`border rounded-xl p-6 ${
                  result.success
                    ? "bg-green-500/5 border-green-500/20"
                    : "bg-red-500/5 border-red-500/20"
                }`}
              >
                {/* Status Header */}
                <div className="flex items-center justify-between mb-4">
                  <div className="flex items-center gap-2">
                    {result.success ? (
                      <>
                        <div className="w-2 h-2 bg-green-500 rounded-full" />
                        <span className="font-semibold text-green-700 dark:text-green-400">
                          Success
                        </span>
                      </>
                    ) : (
                      <>
                        <AlertCircle className="w-4 h-4 text-red-500" />
                        <span className="font-semibold text-red-700 dark:text-red-400">
                          Rate Limited
                        </span>
                      </>
                    )}
                  </div>
                  <span className="font-mono text-sm text-muted-foreground">
                    HTTP {result.status}
                  </span>
                </div>

                {/* Metrics Grid */}
                <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
                  {/* Latency */}
                  <div className="bg-background/50 rounded-lg p-3 border">
                    <div className="text-xs text-muted-foreground mb-1">
                      Latency
                    </div>
                    <div className="text-lg font-bold font-mono">
                      {result.latency.toFixed(1)}ms
                    </div>
                  </div>

                  {/* Tokens (if applicable) */}
                  {result.tokensUsed && (
                    <div className="bg-background/50 rounded-lg p-3 border">
                      <div className="text-xs text-muted-foreground mb-1">
                        Tokens Used
                      </div>
                      <div className="text-lg font-bold font-mono">
                        {result.tokensUsed.toLocaleString()}
                      </div>
                    </div>
                  )}

                  {/* Cost */}
                  {result.cost && (
                    <div className="bg-background/50 rounded-lg p-3 border">
                      <div className="text-xs text-muted-foreground mb-1">
                        Cost
                      </div>
                      <div className="text-lg font-bold font-mono">
                        ${result.cost.toFixed(4)}
                      </div>
                    </div>
                  )}

                  {/* Rate Limit Remaining */}
                  {result.rateLimit && (
                    <div className="bg-background/50 rounded-lg p-3 border">
                      <div className="text-xs text-muted-foreground mb-1">
                        Remaining
                      </div>
                      <div className="text-lg font-bold font-mono">
                        {result.rateLimit.remaining}/{result.rateLimit.limit}
                      </div>
                    </div>
                  )}
                </div>

                {/* Response Headers */}
                <div className="mt-4 p-3 bg-muted/30 rounded-lg border">
                  <div className="text-xs font-semibold mb-2 text-muted-foreground">
                    Response Headers:
                  </div>
                  <div className="font-mono text-xs space-y-1">
                    <div className="flex justify-between">
                      <span className="text-muted-foreground">X-RateGuard-Tokens:</span>
                      <span>{result.tokensUsed}</span>
                    </div>
                    <div className="flex justify-between">
                      <span className="text-muted-foreground">X-RateLimit-Limit:</span>
                      <span>{result.rateLimit?.limit}</span>
                    </div>
                    <div className="flex justify-between">
                      <span className="text-muted-foreground">X-RateLimit-Remaining:</span>
                      <span>{result.rateLimit?.remaining}</span>
                    </div>
                    <div className="flex justify-between">
                      <span className="text-muted-foreground">X-Response-Time:</span>
                      <span>{result.latency.toFixed(1)}ms</span>
                    </div>
                  </div>
                </div>

                {/* Success/Failure Message */}
                <div className="mt-4 text-sm">
                  {result.success ? (
                    <p className="text-muted-foreground">
                      ✓ Request processed successfully. Token usage tracked and
                      analytics updated in real-time.
                    </p>
                  ) : (
                    <p className="text-red-600 dark:text-red-400">
                      Rate limit exceeded. Request queued with priority handling.
                      Retry after {new Date(result.rateLimit!.reset).toLocaleTimeString()}.
                    </p>
                  )}
                </div>
              </motion.div>
            )}
          </AnimatePresence>

          {/* Info Footer */}
          <div className="mt-6 p-4 bg-muted/30 rounded-lg border">
            <p className="text-xs text-muted-foreground text-center">
              💡 This is a simulated demo. In production, RateGuard tracks every request,
              enforces your configured limits, and provides real-time analytics.
            </p>
          </div>
        </div>
      </div>
    </div>
  );
}
