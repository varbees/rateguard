"use client";

import { motion, AnimatePresence } from "framer-motion";
import { useState, useEffect, useCallback } from "react";
import {
  Send,
  Shield,
  CheckCircle2,
  AlertTriangle,
  Coins,
  TrendingUp,
  Activity,
  Zap,
  Database,
  BarChart3,
} from "lucide-react";
import { Button } from "@/components/ui/button";

// Animated Token Icon Component
function TokenIcon({ delay = 0 }: { delay?: number }) {
  return (
    <motion.div
      initial={{ scale: 0, opacity: 0 }}
      animate={{ scale: 1, opacity: 1 }}
      exit={{ scale: 0, opacity: 0 }}
      transition={{ delay, duration: 0.3 }}
      className="inline-block"
    >
      <Coins className="w-3 h-3 text-amber-500" />
    </motion.div>
  );
}

// Ripple Effect Component
function RippleEffect() {
  return (
    <motion.div
      className="absolute inset-0 rounded-2xl border-2 border-primary"
      initial={{ opacity: 0.6, scale: 1 }}
      animate={{ opacity: 0, scale: 1.5 }}
      transition={{ duration: 0.8, ease: "easeOut" }}
    />
  );
}

// Animated Number Counter
function CountUp({ end, duration = 1 }: { end: number; duration?: number }) {
  const [count, setCount] = useState(0);

  useEffect(() => {
    let startTime: number;
    let animationFrame: number;

    const animate = (currentTime: number) => {
      if (!startTime) startTime = currentTime;
      const progress = Math.min((currentTime - startTime) / (duration * 1000), 1);
      setCount(Math.floor(progress * end));

      if (progress < 1) {
        animationFrame = requestAnimationFrame(animate);
      }
    };

    animationFrame = requestAnimationFrame(animate);
    return () => cancelAnimationFrame(animationFrame);
  }, [end, duration]);

  return <span>{count.toLocaleString()}</span>;
}

// Circuit Breaker Component
function CircuitBreaker({ isOpen }: { isOpen: boolean }) {
  return (
    <div className="relative w-20 h-12">
      <svg viewBox="0 0 80 48" className="w-full h-full">
        {/* Circuit lines */}
        <line
          x1="0"
          y1="24"
          x2="25"
          y2="24"
          stroke="currentColor"
          strokeWidth="2"
          className="text-muted-foreground"
        />
        <line
          x1="55"
          y1="24"
          x2="80"
          y2="24"
          stroke="currentColor"
          strokeWidth="2"
          className="text-muted-foreground"
        />

        {/* Switch */}
        <motion.line
          x1="25"
          y1="24"
          x2="55"
          y2={isOpen ? "8" : "24"}
          stroke="currentColor"
          strokeWidth="3"
          strokeLinecap="round"
          className={isOpen ? "text-red-500" : "text-green-500"}
          animate={{ y2: isOpen ? 8 : 24 }}
          transition={{ duration: 0.3, ease: "easeInOut" }}
        />

        {/* Connection points */}
        <circle cx="25" cy="24" r="3" fill="currentColor" className="text-primary" />
        <circle cx="55" cy="24" r="3" fill="currentColor" className="text-primary" />
      </svg>

      <div className="absolute -bottom-6 left-1/2 -translate-x-1/2 text-xs font-mono">
        {isOpen ? (
          <span className="text-red-500">OPEN</span>
        ) : (
          <span className="text-green-500">CLOSED</span>
        )}
      </div>
    </div>
  );
}

export function AnimatedDemo() {
  const [step, setStep] = useState(0);
  const [isPlaying, setIsPlaying] = useState(false);
  const [showRipple, setShowRipple] = useState(false);
  const [tokenCount, setTokenCount] = useState(0);
  const [circuitBreakerOpen, setCircuitBreakerOpen] = useState(false);
  const [failedRequests, setFailedRequests] = useState(0);

  const resetDemo = useCallback(() => {
    setStep(0);
    setShowRipple(false);
    setTokenCount(0);
    setCircuitBreakerOpen(false);
    setFailedRequests(0);
  }, []);

  const startDemo = useCallback(() => {
    resetDemo();
    setIsPlaying(true);
  }, [resetDemo]);

  useEffect(() => {
    if (!isPlaying) return;

    const timings = [
      500,  // Step 0 -> 1: Send request
      800,  // Step 1 -> 2: RateGuard receives
      1000, // Step 2 -> 3: Token counting
      1200, // Step 3 -> 4: Circuit breaker check
      1000, // Step 4 -> 5: Dashboard update
      1500, // Step 5 -> 0: Reset
    ];

    const timeout = setTimeout(() => {
      if (step < 5) {
        setStep(step + 1);

        // Trigger ripple on step 2
        if (step === 1) {
          setShowRipple(true);
          setTimeout(() => setShowRipple(false), 800);
        }

        // Start token counting on step 3
        if (step === 2) {
          setTokenCount(1547);
        }

        // Circuit breaker demo on step 4
        if (step === 3) {
          // Simulate some failed requests
          const fails = Math.random() > 0.5 ? 0 : 3;
          setFailedRequests(fails);
          setCircuitBreakerOpen(fails > 2);
        }
      } else {
        // End of sequence
        setTimeout(() => {
          setIsPlaying(false);
          resetDemo();
        }, 2000);
      }
    }, timings[step]);

    return () => clearTimeout(timeout);
  }, [isPlaying, step, resetDemo]);

  return (
    <div className="w-full max-w-5xl mx-auto">
      {/* Mobile-First Demo Container */}
      <div className="relative bg-gradient-to-br from-card/50 to-card/30 border rounded-3xl p-6 md:p-8 backdrop-blur-sm overflow-hidden">
        {/* Background Pattern */}
        <div className="absolute inset-0 opacity-5">
          <div className="absolute inset-0" style={{
            backgroundImage: `radial-gradient(circle at 1px 1px, currentColor 1px, transparent 0)`,
            backgroundSize: '40px 40px'
          }} />
        </div>

        <div className="relative z-10">
          {/* Header */}
          <div className="text-center mb-8">
            <h3 className="text-2xl md:text-3xl font-bold mb-2">
              See RateGuard in Action
            </h3>
            <p className="text-muted-foreground text-sm md:text-base">
              Watch how your request flows through our system
            </p>
          </div>

          {/* Main Demo Visual */}
          <div className="grid grid-cols-1 lg:grid-cols-3 gap-6 mb-8">
            {/* Step 1: Your App */}
            <motion.div
              animate={{
                scale: step === 0 ? 1.05 : 1,
                borderColor: step === 0 ? "hsl(var(--primary))" : "hsl(var(--border))",
              }}
              className="relative bg-card border-2 rounded-2xl p-6 transition-colors"
            >
              <div className="flex flex-col items-center text-center gap-4">
                <div className="w-16 h-16 rounded-xl bg-primary/10 flex items-center justify-center">
                  <Send className="w-8 h-8 text-primary" />
                </div>
                <div>
                  <h4 className="font-bold mb-1">Your App</h4>
                  <p className="text-xs text-muted-foreground">
                    Sends API request
                  </p>
                </div>

                {/* Animated Request Packet */}
                <AnimatePresence>
                  {step === 0 && isPlaying && (
                    <motion.div
                      initial={{ scale: 0, y: 0 }}
                      animate={{ scale: 1, y: 20 }}
                      exit={{ scale: 0.5, opacity: 0, x: 200 }}
                      transition={{ duration: 0.5 }}
                      className="absolute bottom-4 left-1/2 -translate-x-1/2 w-12 h-12 bg-primary/20 rounded-lg border-2 border-primary flex items-center justify-center"
                    >
                      <Zap className="w-6 h-6 text-primary" />
                    </motion.div>
                  )}
                </AnimatePresence>
              </div>
            </motion.div>

            {/* Step 2: RateGuard Processing */}
            <motion.div
              animate={{
                scale: step >= 1 && step <= 3 ? 1.05 : 1,
                borderColor: step >= 1 && step <= 3 ? "hsl(var(--primary))" : "hsl(var(--border))",
              }}
              className="relative bg-card border-2 rounded-2xl p-6 transition-colors min-h-[220px]"
            >
              {showRipple && <RippleEffect />}

              <div className="flex flex-col items-center text-center gap-4 h-full">
                <div className="w-16 h-16 rounded-xl bg-primary/10 flex items-center justify-center relative">
                  <Shield className="w-8 h-8 text-primary" />
                  {step >= 1 && (
                    <motion.div
                      initial={{ scale: 0 }}
                      animate={{ scale: 1 }}
                      className="absolute -top-1 -right-1 w-5 h-5 bg-green-500 rounded-full flex items-center justify-center"
                    >
                      <CheckCircle2 className="w-3 h-3 text-white" />
                    </motion.div>
                  )}
                </div>

                <div>
                  <h4 className="font-bold mb-1">RateGuard</h4>
                  <p className="text-xs text-muted-foreground">
                    Enforces rules &amp; tracks usage
                  </p>
                </div>

                {/* LLM Token Counting Animation */}
                <AnimatePresence>
                  {step >= 2 && tokenCount > 0 && (
                    <motion.div
                      initial={{ opacity: 0, y: 10 }}
                      animate={{ opacity: 1, y: 0 }}
                      className="flex flex-col items-center gap-2 mt-auto"
                    >
                      <div className="flex items-center gap-1">
                        {[...Array(5)].map((_, i) => (
                          <TokenIcon key={i} delay={i * 0.1} />
                        ))}
                      </div>
                      <div className="text-sm font-mono font-bold text-amber-600">
                        <CountUp end={tokenCount} duration={0.8} /> tokens
                      </div>
                      <p className="text-xs text-muted-foreground">
                        LLM usage tracked
                      </p>
                    </motion.div>
                  )}
                </AnimatePresence>

                {/* Circuit Breaker */}
                <AnimatePresence>
                  {step >= 3 && (
                    <motion.div
                      initial={{ opacity: 0, scale: 0.8 }}
                      animate={{ opacity: 1, scale: 1 }}
                      className="flex flex-col items-center gap-3 mt-auto pt-4"
                    >
                      <CircuitBreaker isOpen={circuitBreakerOpen} />
                      {circuitBreakerOpen && (
                        <div className="flex items-center gap-1 text-xs text-red-500">
                          <AlertTriangle className="w-3 h-3" />
                          <span>Protected from failures</span>
                        </div>
                      )}
                    </motion.div>
                  )}
                </AnimatePresence>
              </div>
            </motion.div>

            {/* Step 3: Response & Analytics */}
            <motion.div
              animate={{
                scale: step >= 4 ? 1.05 : 1,
                borderColor: step >= 4 ? "hsl(var(--primary))" : "hsl(var(--border))",
              }}
              className="relative bg-card border-2 rounded-2xl p-6 transition-colors"
            >
              <div className="flex flex-col items-center text-center gap-4">
                <div className="w-16 h-16 rounded-xl bg-primary/10 flex items-center justify-center">
                  <Activity className="w-8 h-8 text-primary" />
                </div>
                <div>
                  <h4 className="font-bold mb-1">Real-Time Dashboard</h4>
                  <p className="text-xs text-muted-foreground">
                    Live metrics &amp; insights
                  </p>
                </div>

                {/* Mini Dashboard Preview */}
                <AnimatePresence>
                  {step >= 4 && (
                    <motion.div
                      initial={{ opacity: 0, y: 10 }}
                      animate={{ opacity: 1, y: 0 }}
                      className="w-full mt-auto space-y-3"
                    >
                      {/* Cost Metric */}
                      <div className="bg-background/50 rounded-lg p-3 border">
                        <div className="flex items-center justify-between mb-2">
                          <span className="text-xs text-muted-foreground">Cost Today</span>
                          <TrendingUp className="w-3 h-3 text-green-500" />
                        </div>
                        <div className="text-lg font-bold">
                          $<CountUp end={47} duration={0.6} />.
                          <CountUp end={32} duration={0.6} />
                        </div>
                      </div>

                      {/* Rate Limit Chart */}
                      <div className="bg-background/50 rounded-lg p-3 border">
                        <div className="flex items-center justify-between mb-2">
                          <span className="text-xs text-muted-foreground">Requests</span>
                          <BarChart3 className="w-3 h-3 text-primary" />
                        </div>
                        <div className="flex items-end gap-1 h-12">
                          {[40, 65, 45, 80, 95, 70, 85].map((height, i) => (
                            <motion.div
                              key={i}
                              initial={{ height: 0 }}
                              animate={{ height: `${height}%` }}
                              transition={{ delay: i * 0.05, duration: 0.3 }}
                              className="flex-1 bg-primary/30 rounded-t"
                            />
                          ))}
                        </div>
                      </div>
                    </motion.div>
                  )}
                </AnimatePresence>
              </div>
            </motion.div>
          </div>

          {/* Current Step Indicator */}
          <div className="flex justify-center gap-2 mb-6">
            {[0, 1, 2, 3, 4, 5].map((i) => (
              <motion.div
                key={i}
                animate={{
                  scale: step === i ? 1.2 : 1,
                  backgroundColor: step >= i ? "hsl(var(--primary))" : "hsl(var(--border))",
                }}
                className="w-2 h-2 rounded-full"
              />
            ))}
          </div>

          {/* Control Button */}
          <div className="flex justify-center">
            <Button
              onClick={startDemo}
              disabled={isPlaying}
              size="lg"
              className="gap-2 px-8"
            >
              <Zap className="w-4 h-4" />
              {isPlaying ? "Running Demo..." : "Run Demo"}
            </Button>
          </div>

          {/* Step Description */}
          <AnimatePresence mode="wait">
            <motion.div
              key={step}
              initial={{ opacity: 0, y: 10 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -10 }}
              className="text-center mt-6 min-h-[60px]"
            >
              {step === 0 && (
                <div>
                  <p className="font-semibold mb-1">Step 1: Request Sent</p>
                  <p className="text-sm text-muted-foreground">
                    Your application sends an API request to RateGuard
                  </p>
                </div>
              )}
              {step === 1 && (
                <div>
                  <p className="font-semibold mb-1">Step 2: Authentication &amp; Validation</p>
                  <p className="text-sm text-muted-foreground">
                    RateGuard validates your API key and checks rate limits in &lt;1ms
                  </p>
                </div>
              )}
              {step === 2 && (
                <div>
                  <p className="font-semibold mb-1">Step 3: LLM Token Tracking</p>
                  <p className="text-sm text-muted-foreground">
                    For AI APIs, tokens are automatically counted and tracked
                  </p>
                </div>
              )}
              {step === 3 && (
                <div>
                  <p className="font-semibold mb-1">Step 4: Circuit Breaker Protection</p>
                  <p className="text-sm text-muted-foreground">
                    {circuitBreakerOpen
                      ? "High error rate detected - circuit breaker activated"
                      : "All systems healthy - request proceeds normally"}
                  </p>
                </div>
              )}
              {step === 4 && (
                <div>
                  <p className="font-semibold mb-1">Step 5: Real-Time Analytics</p>
                  <p className="text-sm text-muted-foreground">
                    Metrics are instantly available in your dashboard
                  </p>
                </div>
              )}
              {step === 5 && (
                <div>
                  <p className="font-semibold mb-1 text-green-600">✓ Complete</p>
                  <p className="text-sm text-muted-foreground">
                    All done! Request processed in &lt;2ms
                  </p>
                </div>
              )}
            </motion.div>
          </AnimatePresence>
        </div>
      </div>

      {/* Tech Stack Footer */}
      <div className="mt-6 flex flex-wrap items-center justify-center gap-4 text-xs text-muted-foreground">
        <div className="flex items-center gap-1">
          <Database className="w-3 h-3" />
          <span>Redis-backed</span>
        </div>
        <div className="w-1 h-1 rounded-full bg-border" />
        <div className="flex items-center gap-1">
          <Zap className="w-3 h-3" />
          <span>&lt;2ms latency</span>
        </div>
        <div className="w-1 h-1 rounded-full bg-border" />
        <div className="flex items-center gap-1">
          <Activity className="w-3 h-3" />
          <span>100k+ RPS</span>
        </div>
      </div>
    </div>
  );
}
