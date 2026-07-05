export type Policy = {
  name: string;
  requests_per_second: number;
  burst: number;
  token_budget_per_hour: number;
  token_budget_per_day: number;
  token_budget_per_month: number;
  token_budget_mode: string;
};

export type RateLimitState = {
  key: string;
  allowed: boolean;
  remaining: number;
  limit: number;
  retry_after_ms: number;
  applied: boolean;
  error?: string;
};

export type TokenBudgetState = {
  key: string;
  remaining: number;
  limit: number;
  window: string;
  applied: boolean;
  allowed: boolean;
  error?: string;
};

export type CircuitBreakerState = {
  state: "closed" | "open" | "half-open" | string;
  allowed: boolean;
  error?: string;
};

export type LoopDetectorStats = {
  enabled: boolean;
  max_depth?: number;
  total_fingerprints?: number;
  halted?: number;
};

export type GuardrailEvent = {
  code: string;
  message: string;
  at: string;
};

export type GuardrailStats = {
  enabled: boolean;
  total?: number;
  by_code?: Record<string, number>;
  recent?: GuardrailEvent[];
};

export type AdminState = {
  key: string;
  rate_limit?: RateLimitState;
  token_budget?: TokenBudgetState;
  circuit_breaker?: CircuitBreakerState;
  preset?: Policy;
  loop_detector?: LoopDetectorStats;
  guardrails?: GuardrailStats;
};

export type MCPTool = {
  name: string;
  description: string;
  input_schema: {
    type: string;
    properties?: Record<string, { type: string; description?: string }>;
    required?: string[];
  };
};

export class RateGuardClient {
  constructor(public baseUrl: string) {}

  private url(path: string) {
    return `${this.baseUrl.replace(/\/$/, "")}${path}`;
  }

  async getState(key: string): Promise<AdminState> {
    const res = await fetch(this.url(`/admin/state?key=${encodeURIComponent(key)}`), { cache: "no-store" });
    if (!res.ok) throw new Error(`GET /admin/state: ${res.status}`);
    return res.json();
  }

  async getPolicy(): Promise<Policy> {
    const res = await fetch(this.url("/admin/policy"), { cache: "no-store" });
    if (!res.ok) throw new Error(`GET /admin/policy: ${res.status}`);
    return res.json();
  }

  async patchPolicy(patch: Partial<{
    requests_per_second: number;
    burst: number;
    token_budget_per_hour: number;
    token_budget_per_day: number;
    token_budget_per_month: number;
    token_budget_mode: string;
  }>): Promise<Policy> {
    const res = await fetch(this.url("/admin/policy"), {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(patch),
    });
    if (!res.ok) {
      const body = await res.json().catch(() => ({}));
      throw new Error(body.error ?? `PATCH /admin/policy: ${res.status}`);
    }
    return res.json();
  }

  async getMetricsText(): Promise<string> {
    const res = await fetch(this.url("/metrics"), { cache: "no-store" });
    if (!res.ok) throw new Error(`GET /metrics: ${res.status}`);
    return res.text();
  }

  async getMCPTools(): Promise<MCPTool[]> {
    const res = await fetch(this.url("/admin/mcp/tools"), { cache: "no-store" });
    if (!res.ok) throw new Error(`GET /admin/mcp/tools: ${res.status}`);
    return res.json();
  }

  async callMCPTool(tool: string, args: Record<string, unknown>): Promise<Record<string, unknown>> {
    const res = await fetch(this.url("/admin/mcp/call"), {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ tool, args }),
    });
    const body = await res.json().catch(() => ({}));
    if (!res.ok) throw new Error(body.error ?? `POST /admin/mcp/call: ${res.status}`);
    return body;
  }
}
