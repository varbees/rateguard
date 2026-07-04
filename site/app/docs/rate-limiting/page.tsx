import type { Metadata } from "next";
import Link from "next/link";
import { DocH1, DocH2, DocsPager, P } from "../../../components/docs/Docs";
import { CodeTabs } from "../../../components/docs/CodeTabs";

export const metadata: Metadata = {
  title: "Rate limit your API",
  description:
    "Inbound middleware adapters for net/http, chi, Express, Fastify, Hono, Next.js, FastAPI, Flask, and Django — one token bucket, identical semantics.",
};

export default function RateLimitingPage() {
  return (
    <>
      <DocH1 kicker="Guides">Rate limit your API</DocH1>
      <P>
        The inbound middleware guards your own endpoints with the token bucket algorithm —
        per-tenant, per-route, per-upstream. Adapters exist for the frameworks you already use;
        semantics are identical everywhere.
      </P>

      <DocH2 id="adapters">Middleware adapters</DocH2>
      <CodeTabs
        tabs={[
          {
            label: "Go",
            code: `rg := rateguard.New(rateguard.Config{Preset: "standard"})

// net/http
http.Handle("/", rg.HTTPMiddleware(myHandler))

// chi
r := chi.NewRouter()
r.Use(rg.ChiMiddleware())

// Prometheus
http.Handle("/metrics", rg.Metrics())`,
          },
          {
            label: "Node.js",
            code: `// Express
app.use(rg.middleware());

// Fastify
fastify.addHook('onRequest', rg.fastifyMiddleware());

// Hono
app.use('*', rg.honoMiddleware());

// Next.js
export const middleware = rg.nextMiddleware();`,
          },
          {
            label: "Python",
            code: `# FastAPI / Starlette (ASGI)
app.add_middleware(rg.asgi_middleware)

# Flask / Django (WSGI)
app.wsgi_app = rg.wsgi_middleware(app.wsgi_app)

# Decorator
@rg.limit("standard")
async def my_endpoint(request): ...`,
          },
        ]}
      />

      <DocH2 id="denials">What a denial looks like</DocH2>
      <P>
        Denied requests get a <code>429</code> with a computed <code>Retry-After</code>:{" "}
        <code>retry_after = ceil((1.0 − tokens) / rps) × 1000ms</code>. Well-behaved clients (and
        every LLM SDK) back off exactly as long as needed — no thundering-herd retries.
      </P>

      <DocH2 id="scoping">Scoping</DocH2>
      <P>
        Set <code>TenantID</code>, <code>RouteID</code>, and <code>UpstreamID</code> in the{" "}
        <Link href="/docs/configuration">config</Link> to partition buckets. Pass a Redis client
        for distributed limiting across replicas; without one, limiting is process-local.
      </P>

      <DocH2 id="extras">Wired extras</DocH2>
      <P>
        The middleware chain also runs <Link href="/docs/guardrails">guardrails</Link> against
        request bodies (violations → 422) and{" "}
        <Link href="/docs/loop-detection">loop detection</Link> when agents send{" "}
        <code>X-Sequence-Depth</code> (loops → 429 <code>loop_detected</code>). Every decision is
        observable at <code>/metrics</code> and as <Link href="/docs/observability">events</Link>.
      </P>
      <DocsPager slug="rate-limiting" />
    </>
  );
}
