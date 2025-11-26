import { Metadata } from "next";
import Link from "next/link";
import { Server, Database, Code, ArrowRight } from "lucide-react";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { CodeBlock } from "@/components/docs/code-block";
import { DocsSectionHeader } from "@/components/docs/section-header";
import { DocsPager } from "@/components/docs/pager";

export const metadata: Metadata = {
  title: "Distributed Rate Limiting | RateGuard Documentation",
  description:
    "Learn about RateGuard's Redis-backed distributed rate limiting system.",
};

export default function DistributedRateLimitingPage() {
  return (
    <div className="space-y-8">
      <div className="space-y-4">
        <h1 className="text-3xl font-bold tracking-tight">
          Distributed Rate Limiting
        </h1>
        <p className="text-xl text-muted-foreground">
          Redis-backed coordination across unlimited instances for consistent
          rate limits.
        </p>
      </div>

      <div className="grid gap-8">
        <DocsSectionHeader
          icon={<Server className="h-5 w-5" />}
          title="How It Works"
          description="Understand how our distributed rate limiting system coordinates across multiple instances."
        />

        <div className="prose prose-slate dark:prose-invert max-w-none">
          <p>
            Traditional rate limiters operate on a per-instance basis, which
            means if you run 3 instances of your API gateway, your users
            effectively get 3x the rate limit. RateGuard solves this problem
            with a Redis-backed distributed rate limiting system.
          </p>

          <h3>Key Features</h3>
          <ul>
            <li>
              <strong>Redis-backed coordination</strong> - All instances share
              the same rate limit counters
            </li>
            <li>
              <strong>Atomic operations</strong> - Uses Lua scripts to ensure
              race-free increments
            </li>
            <li>
              <strong>Multi-tier limits</strong> - Concurrent checks across
              second/hour/day/month time windows
            </li>
            <li>
              <strong>Graceful fallback</strong> - Falls back to local in-memory
              limiters if Redis is unavailable
            </li>
            <li>
              <strong>Distributed locks</strong> - Prevents thundering herd
              problems during recovery
            </li>
          </ul>

          <h3>Architecture</h3>
          <p>
            When a request arrives at any RateGuard instance, it checks the rate
            limit by:
          </p>
          <ol>
            <li>
              Generating keys for each time window (second, hour, day, month)
            </li>
            <li>
              Executing atomic Lua scripts in Redis to increment and check
              counters
            </li>
            <li>
              Checking all time windows concurrently (using Go&rsquo;s
              concurrency primitives)
            </li>
            <li>Returning a consolidated result (allowed or denied)</li>
          </ol>

          <p>
            This ensures that no matter how many RateGuard instances you run,
            your users will always see consistent rate limits.
          </p>
        </div>

        <DocsSectionHeader
          icon={<Database className="h-5 w-5" />}
          title="Redis Configuration"
          description="Learn how to configure Redis for distributed rate limiting."
        />

        <div className="prose prose-slate dark:prose-invert max-w-none">
          <p>
            RateGuard requires a Redis instance to enable distributed rate
            limiting. You can configure it through environment variables or the
            config file.
          </p>

          <h3>Environment Variables</h3>
          <ul>
            <li>
              <code>REDIS_HOST</code> - Redis server hostname (default:
              &quot;localhost&quot;)
            </li>
            <li>
              <code>REDIS_PORT</code> - Redis server port (default: 6379)
            </li>
            <li>
              <code>REDIS_PASSWORD</code> - Redis password (optional)
            </li>
            <li>
              <code>REDIS_DB</code> - Redis database number (default: 0)
            </li>
            <li>
              <code>REDIS_POOL_SIZE</code> - Connection pool size (default: 10)
            </li>
          </ul>

          <h3>Config File</h3>
          <CodeBlock
            language="yaml"
            value={`redis:
  host: localhost
  port: 6379
  password: ""
  db: 0
  pool_size: 10
  enable_tls: false`}
          />
        </div>

        <DocsSectionHeader
          icon={<Code className="h-5 w-5" />}
          title="Implementation"
          description="See how distributed rate limiting is implemented in code."
        />

        <Tabs defaultValue="go">
          <TabsList>
            <TabsTrigger value="go">Go Implementation</TabsTrigger>
            <TabsTrigger value="lua">Lua Script</TabsTrigger>
          </TabsList>
          <TabsContent value="go" className="mt-4">
            <CodeBlock
              language="go"
              value={`// AllowWithMultiTier checks all rate limit tiers (second, hour, day, month)
// Returns true if allowed, false if any limit is exceeded
func (r *RedisRateLimiter) AllowWithMultiTier(userID uuid.UUID, apiName string, limits *MultiTierLimits) (bool, string) {
	if !r.enabled {
		return true, ""
	}

	now := time.Now()
	currentSecond := now.Unix()
	currentHour := now.Truncate(time.Hour).Unix()
	currentDay := now.Truncate(24 * time.Hour).Unix()
	currentMonth := time.Date(now.Year(), now.Month(), 1, 0, 0, 0, 0, now.Location()).Unix()

	// 1. Check per-second limit
	if limits.RateLimitPerSecond > 0 {
		secondKey := fmt.Sprintf("ratelimit:user:%s:api:%s:second:%d", userID.String(), apiName, currentSecond)
		count, err := r.redis.IncrWithExpire(secondKey, 2*time.Second)
		if err != nil {
			logger.Error("Failed to check per-second limit", zap.Error(err))
			return true, "" // Fail open
		}

		if count > int64(limits.RateLimitPerSecond) {
			return false, "per-second"
		}
	}

	// Similar checks for hour, day, and month limits...

	return true, ""
}`}
            />
          </TabsContent>
          <TabsContent value="lua" className="mt-4">
            <CodeBlock
              language="lua"
              value={`-- KEYS[1]: rate limit key
-- ARGV[1]: limit
-- ARGV[2]: expiry in seconds

local current = redis.call('INCR', KEYS[1])
if tonumber(current) == 1 then
    redis.call('EXPIRE', KEYS[1], ARGV[2])
end

return current`}
            />
          </TabsContent>
        </Tabs>

        <DocsPager
          prev={{
            href: "/docs/features/transparent-proxy",
            title: "Transparent Proxy",
          }}
          next={{
            href: "/docs/features/circuit-breaker",
            title: "Circuit Breaker",
          }}
        />
      </div>
    </div>
  );
}
