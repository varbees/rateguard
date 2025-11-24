"use client";

import * as React from "react";
import { motion, AnimatePresence } from "framer-motion";
import {
  Play,
  Pause,
  RotateCcw,
  Zap,
  Clock,
  Calendar,
  Layers,
  Copy,
  Sparkles,
  Crown,
  Building,
  Info,
  AlertTriangle,
  CheckCircle2,
  Gauge,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Slider } from "@/components/ui/slider";
import { Badge } from "@/components/ui/badge";
import { cn } from "@/lib/utils";

interface RateLimitTier {
  name: string;
  limit: number;
  remaining: number;
  window: string;
  icon: React.ElementType;
  color: string;
}

interface RateLimitConfig {
  perSecond: number;
  burst: number;
  perHour: number;
  perDay: number;
  perMonth: number;
}

interface TierPreset {
  name: string;
  icon: React.ElementType;
  description: string;
  config: RateLimitConfig;
}

const TIER_PRESETS: TierPreset[] = [
  {
    name: "Free",
    icon: Sparkles,
    description: "Hobby projects",
    config: {
      perSecond: 5,
      burst: 10,
      perHour: 500,
      perDay: 5000,
      perMonth: 50000,
    },
  },
  {
    name: "Pro",
    icon: Crown,
    description: "Production apps",
    config: {
      perSecond: 20,
      burst: 40,
      perHour: 2000,
      perDay: 20000,
      perMonth: 200000,
    },
  },
  {
    name: "Enterprise",
    icon: Building,
    description: "Large scale",
    config: {
      perSecond: 100,
      burst: 200,
      perHour: 10000,
      perDay: 100000,
      perMonth: 1000000,
    },
  },
];

const TIER_TOOLTIPS = {
  perSecond: "Maximum requests per second. Resets every 1 second.",
  burst: "Allows short traffic spikes over 10 seconds.",
  perHour: "Total requests per hour. Prevents sustained abuse.",
  perDay: "Total requests per 24 hours. Long-term protection.",
};

export function RateLimitVisualizer() {
  const [isPlaying, setIsPlaying] = React.useState(false);
  const [requestRate, setRequestRate] = React.useState([10]);
  const [currentTime, setCurrentTime] = React.useState(0);
  const [requestCount, setRequestCount] = React.useState(0);
  const [selectedPreset, setSelectedPreset] = React.useState("Pro");
  const [simulationSpeed, setSimulationSpeed] = React.useState(1);
  const [hoveredTier, setHoveredTier] = React.useState<string | null>(null);

  const [config, setConfig] = React.useState<RateLimitConfig>({
    perSecond: 20,
    burst: 40,
    perHour: 2000,
    perDay: 20000,
    perMonth: 200000,
  });

  const [tiers, setTiers] = React.useState<RateLimitTier[]>([]);

  // Update tiers when config changes
  React.useEffect(() => {
    setTiers([
      {
        name: "Per Second",
        limit: config.perSecond,
        remaining: config.perSecond,
        window: "1s",
        icon: Zap,
        color: "text-chart-1",
      },
      {
        name: "Burst",
        limit: config.burst,
        remaining: config.burst,
        window: "10s",
        icon: Layers,
        color: "text-chart-2",
      },
      {
        name: "Per Hour",
        limit: config.perHour,
        remaining: config.perHour,
        window: "1h",
        icon: Clock,
        color: "text-primary",
      },
      {
        name: "Per Day",
        limit: config.perDay,
        remaining: config.perDay,
        window: "24h",
        icon: Calendar,
        color: "text-chart-3",
      },
    ]);
    setCurrentTime(0);
    setRequestCount(0);
    setIsPlaying(false);
  }, [config]);

  // Calculate which tier will be exceeded first
  const testResults = React.useMemo(() => {
    const rate = requestRate[0];
    if (rate === 0) return [];

    return [
      {
        tier: "Per Second",
        limit: config.perSecond,
        timeToExceed: config.perSecond / rate,
        icon: Zap,
        color: "text-chart-1",
      },
      {
        tier: "Burst",
        limit: config.burst,
        timeToExceed: config.burst / rate,
        icon: Layers,
        color: "text-chart-2",
      },
      {
        tier: "Per Hour",
        limit: config.perHour,
        timeToExceed: config.perHour / rate,
        icon: Clock,
        color: "text-primary",
      },
      {
        tier: "Per Day",
        limit: config.perDay,
        timeToExceed: config.perDay / rate,
        icon: Calendar,
        color: "text-chart-3",
      },
    ].sort((a, b) => a.timeToExceed - b.timeToExceed);
  }, [config, requestRate]);

  // Simulation logic
  React.useEffect(() => {
    if (!isPlaying) return;

    const interval = setInterval(() => {
      setCurrentTime((prev) => prev + 1);

      const requestsPerTick = (requestRate[0] / 10) * simulationSpeed;
      setRequestCount((prev) => prev + requestsPerTick);

      setTiers((prevTiers) => {
        const newTiers = prevTiers.map((tier) => ({ ...tier }));
        newTiers.forEach((tier) => {
          tier.remaining = Math.max(0, tier.remaining - requestsPerTick);
        });
        return newTiers;
      });
    }, 100);

    return () => clearInterval(interval);
  }, [isPlaying, requestRate, simulationSpeed]);

  // Reset windows
  React.useEffect(() => {
    if (!isPlaying) return;

    const timeInSeconds = currentTime / 10;

    setTiers((prevTiers) => {
      const newTiers = prevTiers.map((tier) => ({ ...tier }));

      if (timeInSeconds % 1 < 0.1 && timeInSeconds > 0) {
        const perSecondTier = newTiers.find((t) => t.name === "Per Second");
        if (perSecondTier) perSecondTier.remaining = perSecondTier.limit;
      }

      if (timeInSeconds % 10 < 0.1 && timeInSeconds > 0) {
        const burstTier = newTiers.find((t) => t.name === "Burst");
        if (burstTier) burstTier.remaining = burstTier.limit;
      }

      if (timeInSeconds % 60 < 0.1 && timeInSeconds > 0) {
        const hourTier = newTiers.find((t) => t.name === "Per Hour");
        if (hourTier) hourTier.remaining = hourTier.limit;
      }

      if (timeInSeconds % 240 < 0.1 && timeInSeconds > 0) {
        const dayTier = newTiers.find((t) => t.name === "Per Day");
        if (dayTier) dayTier.remaining = dayTier.limit;
      }

      return newTiers;
    });
  }, [currentTime, isPlaying]);

  const applyPreset = (presetName: string) => {
    const preset = TIER_PRESETS.find((p) => p.name === presetName);
    if (preset) {
      setConfig(preset.config);
      setSelectedPreset(presetName);
    }
  };

  const handleReset = () => {
    setIsPlaying(false);
    setCurrentTime(0);
    setRequestCount(0);
    setTiers((prevTiers) =>
      prevTiers.map((tier) => ({
        ...tier,
        remaining: tier.limit,
      }))
    );
  };

  const copyConfig = () => {
    const configStr = JSON.stringify(config, null, 2);
    navigator.clipboard.writeText(configStr);
  };

  const formatTime = (seconds: number): string => {
    if (seconds < 1) return `${(seconds * 1000).toFixed(0)}ms`;
    if (seconds < 60) return `${seconds.toFixed(1)}s`;
    if (seconds < 3600) return `${(seconds / 60).toFixed(1)}m`;
    return `${(seconds / 3600).toFixed(1)}h`;
  };

  return (
    <Card className="border-2">
      <CardHeader>
        <div className="flex items-center justify-between">
          <div>
            <CardTitle className="text-2xl">Rate Limit Simulator</CardTitle>
            <CardDescription className="mt-2">
              Unified dashboard: Configure limits, test scenarios, and simulate
              in real-time
            </CardDescription>
          </div>
          <Button variant="outline" size="sm" onClick={copyConfig}>
            <Copy className="mr-2 size-4" />
            Copy Config
          </Button>
        </div>
      </CardHeader>

      <CardContent>
        {/* Unified 3-Column Dashboard Layout */}
        <div className="grid grid-cols-1 xl:grid-cols-12 gap-6">
          {/* LEFT COLUMN: Configure (Presets + Sliders) */}
          <div className="xl:col-span-3 space-y-6">
            <div>
              <h3 className="text-lg font-semibold mb-3">Configure Limits</h3>

              {/* Presets */}
              <div className="space-y-2 mb-4">
                {TIER_PRESETS.map((preset) => {
                  const Icon = preset.icon;
                  return (
                    <Card
                      key={preset.name}
                      className={cn(
                        "cursor-pointer transition-all hover:shadow-md p-3",
                        selectedPreset === preset.name &&
                          "ring-2 ring-primary bg-primary/5"
                      )}
                      onClick={() => applyPreset(preset.name)}
                    >
                      <div className="flex items-center gap-2">
                        <Icon className="size-4 text-primary" />
                        <div className="flex-1">
                          <p className="text-sm font-semibold">{preset.name}</p>
                          <p className="text-xs text-muted-foreground">
                            {preset.description}
                          </p>
                        </div>
                      </div>
                    </Card>
                  );
                })}
              </div>

              {/* Custom Sliders */}
              <div className="space-y-4">
                {/* Per Second */}
                <div className="space-y-2">
                  <div className="flex items-center gap-2">
                    <Zap className="size-4 text-chart-1" />
                    <label className="text-sm font-medium flex items-center gap-1">
                      Per Second:{" "}
                      <span className="text-primary">{config.perSecond}</span>
                    </label>
                    <div
                      className="relative"
                      onMouseEnter={() => setHoveredTier("perSecond")}
                      onMouseLeave={() => setHoveredTier(null)}
                    >
                      <Info className="size-3 text-muted-foreground cursor-help" />
                      {hoveredTier === "perSecond" && (
                        <div className="absolute z-50 left-0 top-5 w-48 p-2 bg-popover border rounded-md shadow-lg text-xs">
                          {TIER_TOOLTIPS.perSecond}
                        </div>
                      )}
                    </div>
                  </div>
                  <Slider
                    value={[config.perSecond]}
                    onValueChange={([value]) =>
                      setConfig((prev) => ({ ...prev, perSecond: value }))
                    }
                    max={200}
                    min={1}
                    step={1}
                    className="w-full"
                  />
                </div>

                {/* Burst */}
                <div className="space-y-2">
                  <div className="flex items-center gap-2">
                    <Layers className="size-4 text-orange-500" />
                    <label className="text-sm font-medium flex items-center gap-1">
                      Burst:{" "}
                      <span className="text-primary">{config.burst}</span>
                    </label>
                    <div
                      className="relative"
                      onMouseEnter={() => setHoveredTier("burst")}
                      onMouseLeave={() => setHoveredTier(null)}
                    >
                      <Info className="size-3 text-muted-foreground cursor-help" />
                      {hoveredTier === "burst" && (
                        <div className="absolute z-50 left-0 top-5 w-48 p-2 bg-popover border rounded-md shadow-lg text-xs">
                          {TIER_TOOLTIPS.burst}
                        </div>
                      )}
                    </div>
                  </div>
                  <Slider
                    value={[config.burst]}
                    onValueChange={([value]) =>
                      setConfig((prev) => ({ ...prev, burst: value }))
                    }
                    max={500}
                    min={1}
                    step={1}
                    className="w-full"
                  />
                </div>

                {/* Per Hour */}
                <div className="space-y-2">
                  <div className="flex items-center gap-2">
                    <Clock className="size-4 text-primary" />
                    <label className="text-sm font-medium flex items-center gap-1">
                      Hour:{" "}
                      <span className="text-primary">
                        {config.perHour.toLocaleString()}
                      </span>
                    </label>
                    <div
                      className="relative"
                      onMouseEnter={() => setHoveredTier("perHour")}
                      onMouseLeave={() => setHoveredTier(null)}
                    >
                      <Info className="size-3 text-muted-foreground cursor-help" />
                      {hoveredTier === "perHour" && (
                        <div className="absolute z-50 left-0 top-5 w-48 p-2 bg-popover border rounded-md shadow-lg text-xs">
                          {TIER_TOOLTIPS.perHour}
                        </div>
                      )}
                    </div>
                  </div>
                  <Slider
                    value={[config.perHour]}
                    onValueChange={([value]) =>
                      setConfig((prev) => ({ ...prev, perHour: value }))
                    }
                    max={50000}
                    min={0}
                    step={100}
                    className="w-full"
                  />
                </div>

                {/* Per Day */}
                <div className="space-y-2">
                  <div className="flex items-center gap-2">
                    <Calendar className="size-4 text-chart-3" />
                    <label className="text-sm font-medium flex items-center gap-1">
                      Day:{" "}
                      <span className="text-primary">
                        {config.perDay.toLocaleString()}
                      </span>
                    </label>
                    <div
                      className="relative"
                      onMouseEnter={() => setHoveredTier("perDay")}
                      onMouseLeave={() => setHoveredTier(null)}
                    >
                      <Info className="size-3 text-muted-foreground cursor-help" />
                      {hoveredTier === "perDay" && (
                        <div className="absolute z-50 left-0 top-5 w-48 p-2 bg-popover border rounded-md shadow-lg text-xs">
                          {TIER_TOOLTIPS.perDay}
                        </div>
                      )}
                    </div>
                  </div>
                  <Slider
                    value={[config.perDay]}
                    onValueChange={([value]) =>
                      setConfig((prev) => ({ ...prev, perDay: value }))
                    }
                    max={1000000}
                    min={0}
                    step={1000}
                    className="w-full"
                  />
                </div>
              </div>
            </div>
          </div>

          {/* CENTER COLUMN: Simulate (Visual Buckets) */}
          <div className="xl:col-span-6 space-y-4">
            <div>
              <div className="flex items-center justify-between mb-3">
                <h3 className="text-lg font-semibold">Simulate</h3>
                <div className="flex items-center gap-2 text-sm text-muted-foreground">
                  <Clock className="size-4" />
                  <span>
                    {(currentTime / 10).toFixed(1)}s ({simulationSpeed}x)
                  </span>
                </div>
              </div>

              {/* Request Rate Control */}
              <div className="space-y-2 mb-4">
                <div className="flex items-center justify-between">
                  <label className="text-sm font-medium flex items-center gap-2">
                    <Gauge className="size-4" />
                    Request Rate:{" "}
                    <span className="text-primary">{requestRate[0]} req/s</span>
                  </label>
                  <Badge variant="outline">
                    {requestCount.toFixed(0)} total
                  </Badge>
                </div>
                <Slider
                  value={requestRate}
                  onValueChange={setRequestRate}
                  max={5000}
                  min={1}
                  step={1}
                  className="w-full"
                />
              </div>

              {/* Speed + Controls */}
              <div className="flex items-center gap-2 mb-4">
                <Button
                  variant={isPlaying ? "secondary" : "default"}
                  size="sm"
                  onClick={() => setIsPlaying(!isPlaying)}
                >
                  {isPlaying ? (
                    <>
                      <Pause className="mr-2 size-4" />
                      Pause
                    </>
                  ) : (
                    <>
                      <Play className="mr-2 size-4" />
                      Play
                    </>
                  )}
                </Button>
                <Button variant="outline" size="sm" onClick={handleReset}>
                  <RotateCcw className="mr-2 size-4" />
                  Reset
                </Button>
                <div className="flex gap-1 ml-auto">
                  {[1, 10, 100, 1000].map((speed) => (
                    <Button
                      key={speed}
                      variant={
                        simulationSpeed === speed ? "default" : "outline"
                      }
                      size="sm"
                      onClick={() => setSimulationSpeed(speed)}
                      disabled={isPlaying}
                      className="px-2"
                    >
                      {speed}x
                    </Button>
                  ))}
                </div>
              </div>

              {/* Visual Buckets */}
              <div className="grid grid-cols-2 gap-3">
                {tiers.map((tier) => {
                  const Icon = tier.icon;
                  const percentage = (tier.remaining / tier.limit) * 100;
                  const isLow = percentage < 20;
                  const isCritical = percentage < 10;
                  const isExceeded = tier.remaining === 0;

                  return (
                    <motion.div
                      key={tier.name}
                      initial={{ scale: 1 }}
                      animate={{
                        scale: isExceeded ? [1, 1.05, 1] : 1,
                      }}
                      transition={{ duration: 0.3 }}
                    >
                      <Card
                        className={cn(
                          "border-2 transition-all",
                          isExceeded && "border-destructive bg-destructive/10"
                        )}
                      >
                        <CardContent className="pt-4 pb-3">
                          <div className="space-y-3">
                            <div className="flex items-center justify-between">
                              <div className="flex items-center gap-2">
                                <Icon className={cn("size-4", tier.color)} />
                                <h4 className="font-semibold text-sm">
                                  {tier.name}
                                </h4>
                              </div>
                              <Badge
                                variant={
                                  isExceeded ? "destructive" : "secondary"
                                }
                                className="text-xs"
                              >
                                {tier.window}
                              </Badge>
                            </div>

                            <div className="relative h-24 rounded-md border-2 border-dashed border-muted-foreground/30 overflow-hidden bg-muted/20">
                              <motion.div
                                className={cn(
                                  "absolute bottom-0 left-0 right-0 transition-colors",
                                  isCritical
                                    ? "bg-destructive"
                                    : isLow
                                    ? "bg-accent"
                                    : "bg-primary"
                                )}
                                initial={{ height: "100%" }}
                                animate={{ height: `${percentage}%` }}
                                transition={{ duration: 0.5, ease: "easeOut" }}
                              >
                                <div className="absolute inset-0 bg-linear-to-t from-transparent via-white/10 to-white/20" />
                              </motion.div>

                              <div className="absolute inset-0 flex items-center justify-center">
                                <span className="text-xl font-bold text-foreground drop-shadow-lg">
                                  {Math.round(percentage)}%
                                </span>
                              </div>
                            </div>

                            <div className="flex items-center justify-between text-xs">
                              <span className="text-muted-foreground">
                                Remaining:
                              </span>
                              <span className="font-mono font-semibold">
                                {Math.max(
                                  0,
                                  Math.floor(tier.remaining)
                                ).toLocaleString()}{" "}
                                / {tier.limit.toLocaleString()}
                              </span>
                            </div>

                            {isExceeded && (
                              <AnimatePresence>
                                <motion.div
                                  initial={{ opacity: 0, y: -5 }}
                                  animate={{ opacity: 1, y: 0 }}
                                  className="text-xs text-destructive font-medium text-center"
                                >
                                  🔴 429 Exceeded
                                </motion.div>
                              </AnimatePresence>
                            )}
                          </div>
                        </CardContent>
                      </Card>
                    </motion.div>
                  );
                })}
              </div>
            </div>
          </div>

          {/* RIGHT COLUMN: Test (Prediction Table) */}
          <div className="xl:col-span-3 space-y-4">
            <div>
              <h3 className="text-lg font-semibold mb-3">Test Prediction</h3>
              <p className="text-xs text-muted-foreground mb-4">
                At {requestRate[0]} req/s, which tier exceeds first:
              </p>

              <div className="space-y-2">
                {testResults.map((result, index) => {
                  const Icon = result.icon;
                  const isFirst = index === 0;

                  return (
                    <Card
                      key={result.tier}
                      className={cn(
                        "border-2 transition-all p-3",
                        isFirst && "border-destructive bg-destructive/10"
                      )}
                    >
                      <div className="flex items-center justify-between gap-2">
                        <div className="flex items-center gap-2 flex-1 min-w-0">
                          <Icon
                            className={cn("size-4 shrink-0", result.color)}
                          />
                          <div className="flex-1 min-w-0">
                            <p className="font-medium text-xs truncate">
                              {result.tier}
                            </p>
                            <p className="text-xs text-muted-foreground">
                              {result.limit.toLocaleString()}
                            </p>
                          </div>
                        </div>
                        <div className="flex items-center gap-1 shrink-0">
                          <Badge
                            variant={isFirst ? "destructive" : "secondary"}
                            className="font-mono text-xs"
                          >
                            {formatTime(result.timeToExceed)}
                          </Badge>
                          {isFirst && (
                            <AlertTriangle className="size-3 text-destructive" />
                          )}
                          {!isFirst && result.timeToExceed > 60 && (
                            <CheckCircle2 className="size-3 text-primary" />
                          )}
                        </div>
                      </div>
                    </Card>
                  );
                })}
              </div>

              {testResults.length > 0 && (
                <div className="mt-4 p-3 bg-accent/10 border border-accent rounded-md">
                  <p className="text-xs font-medium text-foreground">
                    ⚠️ First limit: <strong>{testResults[0].tier}</strong>
                  </p>
                  <p className="text-xs text-muted-foreground mt-1">
                    Exceeds in{" "}
                    <strong>{formatTime(testResults[0].timeToExceed)}</strong>
                  </p>
                </div>
              )}
            </div>
          </div>
        </div>
      </CardContent>
    </Card>
  );
}
