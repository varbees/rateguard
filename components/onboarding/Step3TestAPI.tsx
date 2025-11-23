"use client";

import * as React from "react";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { CopyButton } from "@/components/docs/CopyButton";
import {
  CheckCircle2,
  Rocket,
  ArrowLeft,
  Loader2,
  AlertCircle,
  TrendingUp,
  Clock,
  Zap,
} from "lucide-react";
import { motion } from "framer-motion";
import confetti from "canvas-confetti";

interface Step3TestAPIProps {
  apiName: string;
  targetUrl: string;
  onBack: () => void;
  onComplete: () => void;
}

const API_BASE_URL = "https://api.rateguard.io/v1";

export function Step3TestAPI({
  apiName,
  targetUrl,
  onBack,
  onComplete,
}: Step3TestAPIProps) {
  const [isTesting, setIsTesting] = React.useState(false);
  const [testResult, setTestResult] = React.useState<
    "success" | "error" | null
  >(null);
  const [testMessage, setTestMessage] = React.useState("");
  const [selectedLanguage, setSelectedLanguage] = React.useState("javascript");

  const proxyUrl = `${API_BASE_URL}/proxy/${apiName}`;
  const apiKey = "rg_your_api_key_here"; // In real app, get from auth context

  const codeExamples = {
    javascript: `// Replace your direct API calls with RateGuard proxy
const response = await fetch('${proxyUrl}/endpoint', {
  headers: {
    'X-API-Key': '${apiKey}',
    'Content-Type': 'application/json'
  }
});

const data = await response.json();

// Check rate limit
const remaining = response.headers.get('X-RateLimit-Remaining');
console.log(\`Remaining: \${remaining}\`);`,

    python: `import requests

# Use RateGuard proxy instead of direct API
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
  -H 'Content-Type: application/json'`,

    go: `req, _ := http.NewRequest("GET", "${proxyUrl}/endpoint", nil)
req.Header.Set("X-API-Key", "${apiKey}")
req.Header.Set("Content-Type", "application/json")

resp, _ := http.DefaultClient.Do(req)
defer resp.Body.Close()

// Check rate limit
remaining := resp.Header.Get("X-RateLimit-Remaining")
fmt.Printf("Remaining: %s\\n", remaining)`,
  };

  const handleTestConnection = async () => {
    setIsTesting(true);
    setTestResult(null);

    // Simulate API test (in production, make actual request)
    await new Promise((resolve) => setTimeout(resolve, 1500));

    // Simulate success
    setTestResult("success");
    setTestMessage(
      "Connection successful! Your API is protected and ready to use."
    );
    setIsTesting(false);

    // Trigger confetti
    confetti({
      particleCount: 100,
      spread: 70,
      origin: { y: 0.6 },
    });
  };

  const handleFinish = () => {
    // More confetti!
    confetti({
      particleCount: 150,
      spread: 100,
      origin: { y: 0.5 },
      colors: ["#10b981", "#3b82f6", "#f59e0b"],
    });

    setTimeout(onComplete, 500);
  };

  return (
    <div className="space-y-6 max-w-4xl mx-auto">
      {/* Header */}
      <motion.div
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        className="text-center space-y-2"
      >
        <h2 className="text-3xl font-bold">Your API is Protected! 🎉</h2>
        <p className="text-muted-foreground">
          Copy your proxy URL and start making requests immediately.
        </p>
      </motion.div>

      {/* Proxy URL Card */}
      <motion.div
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        transition={{ delay: 0.1 }}
      >
        <Card className="border-2 border-primary/50 shadow-lg">
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Rocket className="size-5 text-primary" />
              Your Protected Proxy URL
            </CardTitle>
            <CardDescription>
              Use this URL instead of calling {targetUrl} directly
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            {/* Proxy URL Display */}
            <div className="flex items-center gap-2 p-4 bg-muted/50 rounded-lg font-mono text-sm">
              <code className="flex-1 break-all">{proxyUrl}</code>
              <CopyButton value={proxyUrl} />
            </div>

            {/* Stats */}
            <div className="grid grid-cols-3 gap-4">
              <div className="text-center p-3 bg-green-50 dark:bg-green-950/20 rounded-lg">
                <Zap className="size-5 text-green-600 mx-auto mb-1" />
                <div className="text-lg font-bold text-green-600">10/sec</div>
                <div className="text-xs text-muted-foreground">Rate Limit</div>
              </div>
              <div className="text-center p-3 bg-blue-50 dark:bg-blue-950/20 rounded-lg">
                <TrendingUp className="size-5 text-blue-600 mx-auto mb-1" />
                <div className="text-lg font-bold text-blue-600">20</div>
                <div className="text-xs text-muted-foreground">Burst Size</div>
              </div>
              <div className="text-center p-3 bg-amber-50 dark:bg-amber-950/20 rounded-lg">
                <Clock className="size-5 text-amber-600 mx-auto mb-1" />
                <div className="text-lg font-bold text-amber-600">30s</div>
                <div className="text-xs text-muted-foreground">Timeout</div>
              </div>
            </div>
          </CardContent>
        </Card>
      </motion.div>

      {/* Code Examples */}
      <motion.div
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        transition={{ delay: 0.2 }}
      >
        <Card className="border-2">
          <CardHeader>
            <CardTitle>Integration Examples</CardTitle>
            <CardDescription>
              Choose your language and copy the code to get started
            </CardDescription>
          </CardHeader>
          <CardContent>
            <Tabs value={selectedLanguage} onValueChange={setSelectedLanguage}>
              <TabsList className="grid w-full grid-cols-4">
                <TabsTrigger value="javascript">JavaScript</TabsTrigger>
                <TabsTrigger value="python">Python</TabsTrigger>
                <TabsTrigger value="curl">cURL</TabsTrigger>
                <TabsTrigger value="go">Go</TabsTrigger>
              </TabsList>

              {Object.entries(codeExamples).map(([lang, code]) => (
                <TabsContent key={lang} value={lang} className="mt-4">
                  <div className="relative group">
                    <div className="absolute right-3 top-3 z-10 opacity-0 group-hover:opacity-100 transition-opacity">
                      <CopyButton value={code} />
                    </div>
                    <pre className="rounded-lg border p-4 bg-muted/30 overflow-x-auto text-sm">
                      <code className="text-foreground/90 font-mono">
                        {code}
                      </code>
                    </pre>
                  </div>
                </TabsContent>
              ))}
            </Tabs>
          </CardContent>
        </Card>
      </motion.div>

      {/* Test Connection */}
      <motion.div
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        transition={{ delay: 0.3 }}
      >
        <Card className="border-2">
          <CardHeader>
            <CardTitle>Test Your Connection</CardTitle>
            <CardDescription>
              Verify your API is working correctly
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <Button
              onClick={handleTestConnection}
              disabled={isTesting}
              className="w-full gap-2"
              size="lg"
            >
              {isTesting ? (
                <>
                  <Loader2 className="size-4 animate-spin" />
                  Testing Connection...
                </>
              ) : testResult === "success" ? (
                <>
                  <CheckCircle2 className="size-4" />
                  Test Again
                </>
              ) : (
                <>
                  <Rocket className="size-4" />
                  Test Connection
                </>
              )}
            </Button>

            {/* Test Result */}
            {testResult && (
              <motion.div
                initial={{ opacity: 0, y: 10 }}
                animate={{ opacity: 1, y: 0 }}
                className={`flex items-start gap-3 p-4 rounded-lg ${
                  testResult === "success"
                    ? "bg-green-50 dark:bg-green-950/20 border border-green-200 dark:border-green-900/50"
                    : "bg-red-50 dark:bg-red-950/20 border border-red-200 dark:border-red-900/50"
                }`}
              >
                {testResult === "success" ? (
                  <CheckCircle2 className="size-5 text-green-600 shrink-0 mt-0.5" />
                ) : (
                  <AlertCircle className="size-5 text-red-600 shrink-0 mt-0.5" />
                )}
                <div className="flex-1">
                  <div
                    className={`font-semibold ${
                      testResult === "success"
                        ? "text-green-900 dark:text-green-100"
                        : "text-red-900 dark:text-red-100"
                    }`}
                  >
                    {testResult === "success"
                      ? "Success!"
                      : "Connection Failed"}
                  </div>
                  <div
                    className={`text-sm ${
                      testResult === "success"
                        ? "text-green-700 dark:text-green-300"
                        : "text-red-700 dark:text-red-300"
                    }`}
                  >
                    {testMessage}
                  </div>
                </div>
              </motion.div>
            )}
          </CardContent>
        </Card>
      </motion.div>

      {/* Success Metrics */}
      {testResult === "success" && (
        <motion.div
          initial={{ opacity: 0, scale: 0.95 }}
          animate={{ opacity: 1, scale: 1 }}
          transition={{ delay: 0.2 }}
        >
          <Card className="border-2 border-green-200 dark:border-green-900/50 bg-linear-to-br from-green-50 to-emerald-50 dark:from-green-950/20 dark:to-emerald-950/20">
            <CardContent className="p-6">
              <div className="text-center space-y-4">
                <div className="inline-flex items-center gap-2 px-4 py-2 rounded-full bg-green-100 dark:bg-green-900/30 border border-green-200 dark:border-green-800">
                  <CheckCircle2 className="size-5 text-green-600" />
                  <span className="font-semibold text-green-900 dark:text-green-100">
                    Your API is now protected!
                  </span>
                </div>

                <div className="grid grid-cols-3 gap-4 max-w-md mx-auto">
                  <div>
                    <div className="text-2xl font-bold text-green-600">
                      100%
                    </div>
                    <div className="text-xs text-muted-foreground">
                      Protected
                    </div>
                  </div>
                  <div>
                    <div className="text-2xl font-bold text-green-600">0ms</div>
                    <div className="text-xs text-muted-foreground">
                      Added Latency
                    </div>
                  </div>
                  <div>
                    <div className="text-2xl font-bold text-green-600">
                      Ready
                    </div>
                    <div className="text-xs text-muted-foreground">To Use</div>
                  </div>
                </div>
              </div>
            </CardContent>
          </Card>
        </motion.div>
      )}

      {/* Action Buttons */}
      <div className="flex flex-col sm:flex-row gap-4 justify-between pt-4">
        <Button variant="outline" onClick={onBack} className="gap-2">
          <ArrowLeft className="size-4" />
          Back
        </Button>
        <Button
          size="lg"
          onClick={handleFinish}
          disabled={!testResult}
          className="gap-2 bg-linear-to-r from-green-600 to-emerald-600 hover:from-green-700 hover:to-emerald-700"
        >
          <CheckCircle2 className="size-4" />
          Complete Setup
        </Button>
      </div>
    </div>
  );
}
