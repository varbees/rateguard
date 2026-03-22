"use client";

import * as React from "react";
import { motion, AnimatePresence } from "framer-motion";
import {
  Play,
  CheckCircle2,
  XCircle,
  Clock,
  RefreshCw,
  Pause,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { cn } from "@/lib/utils";

interface RetryAttempt {
  attempt: number;
  status: "pending" | "success" | "error" | "waiting";
  delay: number;
  timestamp: number;
  message: string;
}

const RETRY_STRATEGIES = {
  exponential: {
    name: "Exponential Backoff",
    description: "Delay doubles with each retry: 1s, 2s, 4s, 8s, 16s",
    calculate: (attempt: number) => Math.min(Math.pow(2, attempt), 32) * 1000,
  },
  linear: {
    name: "Linear Backoff",
    description: "Constant delay between retries: 2s, 2s, 2s, 2s, 2s",
    calculate: () => 2000,
  },
  fibonacci: {
    name: "Fibonacci Backoff",
    description: "Fibonacci sequence: 1s, 1s, 2s, 3s, 5s, 8s",
    calculate: (attempt: number) => {
      const fib = [1, 1, 2, 3, 5, 8, 13, 21];
      return (fib[Math.min(attempt, fib.length - 1)] || 21) * 1000;
    },
  },
};

export function RetryLogicDemo() {
  const [strategy, setStrategy] =
    React.useState<keyof typeof RETRY_STRATEGIES>("exponential");
  const [attempts, setAttempts] = React.useState<RetryAttempt[]>([]);
  const [isRunning, setIsRunning] = React.useState(false);
  const [currentAttempt, setCurrentAttempt] = React.useState(0);
  const [maxRetries] = React.useState(5);

  const strategyConfig = RETRY_STRATEGIES[strategy];

  const runSimulation = React.useCallback(async () => {
    setIsRunning(true);
    setAttempts([]);
    setCurrentAttempt(0);

    const newAttempts: RetryAttempt[] = [];

    for (let i = 0; i < maxRetries; i++) {
      const delay = i === 0 ? 0 : strategyConfig.calculate(i - 1);

      // Add pending attempt
      const attempt: RetryAttempt = {
        attempt: i + 1,
        status: "pending",
        delay: delay,
        timestamp: Date.now(),
        message: i === 0 ? "Initial request" : `Retry after ${delay / 1000}s`,
      };

      newAttempts.push(attempt);
      setAttempts([...newAttempts]);
      setCurrentAttempt(i + 1);

      // Wait before attempt
      if (delay > 0) {
        attempt.status = "waiting";
        setAttempts([...newAttempts]);
        await new Promise((resolve) =>
          setTimeout(resolve, Math.min(delay, 3000))
        ); // Speed up for demo
      }

      // Simulate request
      await new Promise((resolve) => setTimeout(resolve, 500));

      // Simulate success on last attempt, or 20% chance of early success
      const isSuccess = i === maxRetries - 1 || Math.random() < 0.2;

      if (isSuccess) {
        attempt.status = "success";
        attempt.message = "Request successful! (200 OK)";
        setAttempts([...newAttempts]);
        setIsRunning(false);
        return;
      } else {
        attempt.status = "error";
        attempt.message = "Rate limit exceeded (429)";
        setAttempts([...newAttempts]);
      }
    }

    setIsRunning(false);
  }, [maxRetries, strategyConfig]);

  const reset = () => {
    setAttempts([]);
    setCurrentAttempt(0);
    setIsRunning(false);
  };

  return (
    <Card className="border-2">
      <CardHeader>
        <div className="flex items-center justify-between">
          <div>
            <CardTitle className="text-2xl">Retry Logic Simulator</CardTitle>
            <CardDescription className="mt-2">
              See how different backoff strategies handle rate limiting
            </CardDescription>
          </div>
          <div className="flex items-center gap-2">
            <Button
              variant={isRunning ? "secondary" : "default"}
              size="sm"
              onClick={isRunning ? reset : runSimulation}
              disabled={isRunning && attempts.length > 0}
            >
              {isRunning ? (
                <>
                  <Pause className="mr-2 size-4" />
                  Running...
                </>
              ) : (
                <>
                  <Play className="mr-2 size-4" />
                  Start Simulation
                </>
              )}
            </Button>
            {!isRunning && attempts.length > 0 && (
              <Button variant="outline" size="sm" onClick={reset}>
                <RefreshCw className="mr-2 size-4" />
                Reset
              </Button>
            )}
          </div>
        </div>
      </CardHeader>

      <CardContent className="space-y-6">
        {/* Strategy Selection */}
        <Tabs
          value={strategy}
          onValueChange={(v) => setStrategy(v as keyof typeof RETRY_STRATEGIES)}
        >
          <TabsList className="grid w-full grid-cols-3">
            {Object.entries(RETRY_STRATEGIES).map(([key, config]) => (
              <TabsTrigger key={key} value={key} disabled={isRunning}>
                {config.name.split(" ")[0]}
              </TabsTrigger>
            ))}
          </TabsList>

          {Object.entries(RETRY_STRATEGIES).map(([key, config]) => (
            <TabsContent key={key} value={key} className="mt-4">
              <Card className="bg-muted/50">
                <CardContent className="pt-4">
                  <p className="text-sm text-muted-foreground">
                    {config.description}
                  </p>
                </CardContent>
              </Card>
            </TabsContent>
          ))}
        </Tabs>

        {/* Timeline */}
        <div className="space-y-4">
          <div className="flex items-center justify-between">
            <h3 className="text-sm font-semibold">Retry Timeline</h3>
            <Badge variant="outline">
              {currentAttempt} / {maxRetries} attempts
            </Badge>
          </div>

          {attempts.length === 0 && !isRunning ? (
            <div className="flex items-center justify-center py-12 text-center text-muted-foreground border-2 border-dashed rounded-lg">
              <div>
                <RefreshCw className="size-12 mx-auto mb-3 opacity-50" />
                <p>Click &ldquo;Start Simulation&rdquo; to begin</p>
              </div>
            </div>
          ) : (
            <div className="space-y-3">
              <AnimatePresence>
                {attempts.map((attempt) => {
                  const Icon =
                    attempt.status === "success"
                      ? CheckCircle2
                      : attempt.status === "error"
                      ? XCircle
                      : attempt.status === "waiting"
                      ? Clock
                      : RefreshCw;

                  return (
                    <motion.div
                      key={attempt.attempt}
                      initial={{ opacity: 0, x: -20 }}
                      animate={{ opacity: 1, x: 0 }}
                      transition={{ delay: 0.1 }}
                    >
                      <Card
                        className={cn(
                          "border-2 transition-all",
                          attempt.status === "success" &&
                            "border-green-500 bg-green-50/50 dark:bg-green-950/20",
                          attempt.status === "error" &&
                            "border-red-500 bg-red-50/50 dark:bg-red-950/20",
                          attempt.status === "waiting" &&
                            "border-yellow-500 bg-yellow-50/50 dark:bg-yellow-950/20",
                          attempt.status === "pending" &&
                            "border-blue-500 animate-pulse"
                        )}
                      >
                        <CardContent className="py-4">
                          <div className="flex items-center gap-4">
                            {/* Icon */}
                            <div
                              className={cn(
                                "flex items-center justify-center size-10 rounded-full",
                                attempt.status === "success" &&
                                  "bg-green-500 text-white",
                                attempt.status === "error" &&
                                  "bg-red-500 text-white",
                                attempt.status === "waiting" &&
                                  "bg-yellow-500 text-white",
                                attempt.status === "pending" &&
                                  "bg-blue-500 text-white"
                              )}
                            >
                              <Icon
                                className={cn(
                                  "size-5",
                                  attempt.status === "pending" && "animate-spin"
                                )}
                              />
                            </div>

                            {/* Content */}
                            <div className="flex-1">
                              <div className="flex items-center justify-between">
                                <h4 className="font-semibold">
                                  Attempt #{attempt.attempt}
                                </h4>
                                {attempt.delay > 0 && (
                                  <Badge variant="outline" className="ml-2">
                                    +{attempt.delay / 1000}s delay
                                  </Badge>
                                )}
                              </div>
                              <p className="text-sm text-muted-foreground mt-1">
                                {attempt.message}
                              </p>
                            </div>

                            {/* Status Badge */}
                            <Badge
                              variant={
                                attempt.status === "success"
                                  ? "default"
                                  : attempt.status === "error"
                                  ? "destructive"
                                  : "secondary"
                              }
                            >
                              {attempt.status === "success"
                                ? "200 OK"
                                : attempt.status === "error"
                                ? "429"
                                : attempt.status === "waiting"
                                ? "Waiting"
                                : "Pending"}
                            </Badge>
                          </div>
                        </CardContent>
                      </Card>
                    </motion.div>
                  );
                })}
              </AnimatePresence>
            </div>
          )}
        </div>

        {/* Code Example */}
        <Card className="bg-muted/50">
          <CardHeader>
            <CardTitle className="text-sm">Code Pattern</CardTitle>
          </CardHeader>
          <CardContent>
            <pre className="text-xs text-muted-foreground font-mono overflow-x-auto">
              <code>
                {strategy === "exponential"
                  ? `async function fetchWithRetry(url, maxRetries = 5) {
  for (let attempt = 0; attempt < maxRetries; attempt++) {
    try {
      const response = await fetch(url);
      
      if (response.status === 429) {
        // Exponential backoff: 1s, 2s, 4s, 8s, 16s
        const delay = Math.min(Math.pow(2, attempt), 32) * 1000;
        console.log(\`Retry in \${delay / 1000}s...\`);
        await sleep(delay);
        continue;
      }
      
      return response;
    } catch (error) {
      if (attempt === maxRetries - 1) throw error;
    }
  }
}`
                  : strategy === "linear"
                  ? `async function fetchWithRetry(url, maxRetries = 5) {
  for (let attempt = 0; attempt < maxRetries; attempt++) {
    try {
      const response = await fetch(url);
      
      if (response.status === 429) {
        // Linear backoff: constant 2s delay
        const delay = 2000;
        console.log(\`Retry in \${delay / 1000}s...\`);
        await sleep(delay);
        continue;
      }
      
      return response;
    } catch (error) {
      if (attempt === maxRetries - 1) throw error;
    }
  }
}`
                  : `async function fetchWithRetry(url, maxRetries = 5) {
  const fib = [1, 1, 2, 3, 5, 8, 13, 21];
  
  for (let attempt = 0; attempt < maxRetries; attempt++) {
    try {
      const response = await fetch(url);
      
      if (response.status === 429) {
        // Fibonacci backoff: 1s, 1s, 2s, 3s, 5s, 8s
        const delay = fib[Math.min(attempt, fib.length - 1)] * 1000;
        console.log(\`Retry in \${delay / 1000}s...\`);
        await sleep(delay);
        continue;
      }
      
      return response;
    } catch (error) {
      if (attempt === maxRetries - 1) throw error;
    }
  }
}`}
              </code>
            </pre>
          </CardContent>
        </Card>
      </CardContent>
    </Card>
  );
}
