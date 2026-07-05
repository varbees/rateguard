/**
 * Prometheus /metrics endpoint — zero dependencies, stdlib only.
 *
 * Exposes RateGuard counters in Prometheus exposition format.
 * Drop this handler into any Node.js HTTP server for real-time visibility
 * into rate limits, token budgets, and circuit breaker state.
 */

import type { PolicyPreset } from '../types.js';

export function prometheusText(policy: PolicyPreset, state: {
  totalRequests: number;
  rateLimitHits: number;
  tokenBudgetExhausted: number;
  circuitBreakerTrips: number;
  tokensConsumed: number;
  circuitBreakerState: 0 | 1 | 2;  // 0=closed, 1=open, 2=half-open
  /** Sourced from `runtime.guardrailLog.stats().total` when guardrails are wired. */
  guardrailViolations?: number;
}): string {
  const lines: string[] = [];

  // Rate limit config gauge
  lines.push('# HELP rateguard_rate_limit_config Rate limit configuration');
  lines.push('# TYPE rateguard_rate_limit_config gauge');
  lines.push(`rateguard_rate_limit_config{preset="${policy.name}",rps="${policy.requestsPerSecond}",burst="${policy.burst}"} 1`);

  // Token budget config gauge
  lines.push('# HELP rateguard_token_budget_config Token budget configuration');
  lines.push('# TYPE rateguard_token_budget_config gauge');
  lines.push(`rateguard_token_budget_config{preset="${policy.name}",per_hour="${policy.tokenBudgetPerHour}",per_day="${policy.tokenBudgetPerDay}",per_month="${policy.tokenBudgetPerMonth}",mode="${policy.tokenBudgetMode}"} 1`);

  // Circuit breaker state (0=closed, 1=open, 2=half-open)
  lines.push('# HELP rateguard_circuit_breaker_state Current circuit breaker state');
  lines.push('# TYPE rateguard_circuit_breaker_state gauge');
  lines.push(`rateguard_circuit_breaker_state ${state.circuitBreakerState}`);

  // Counters
  lines.push('# HELP rateguard_requests_total Total requests processed');
  lines.push('# TYPE rateguard_requests_total counter');
  lines.push(`rateguard_requests_total ${state.totalRequests}`);

  lines.push('# HELP rateguard_rate_limit_hits_total Rate limit hits');
  lines.push('# TYPE rateguard_rate_limit_hits_total counter');
  lines.push(`rateguard_rate_limit_hits_total ${state.rateLimitHits}`);

  lines.push('# HELP rateguard_token_budget_exhausted_total Token budget exhaustion events');
  lines.push('# TYPE rateguard_token_budget_exhausted_total counter');
  lines.push(`rateguard_token_budget_exhausted_total ${state.tokenBudgetExhausted}`);

  lines.push('# HELP rateguard_circuit_breaker_trips_total Circuit breaker trip events');
  lines.push('# TYPE rateguard_circuit_breaker_trips_total counter');
  lines.push(`rateguard_circuit_breaker_trips_total ${state.circuitBreakerTrips}`);

  lines.push('# HELP rateguard_tokens_consumed_total Total tokens consumed');
  lines.push('# TYPE rateguard_tokens_consumed_total counter');
  lines.push(`rateguard_tokens_consumed_total ${state.tokensConsumed}`);

  lines.push('# HELP rateguard_guardrail_violations_total Content guardrail violations (PII, prompt injection, length)');
  lines.push('# TYPE rateguard_guardrail_violations_total counter');
  lines.push(`rateguard_guardrail_violations_total ${state.guardrailViolations ?? 0}`);

  // SDK info
  const version = process.env.RATEGUARD_VERSION || 'dev';
  lines.push('# HELP rateguard_sdk_info SDK version and build info');
  lines.push('# TYPE rateguard_sdk_info gauge');
  lines.push(`rateguard_sdk_info{version="${version}",language="node"} 1`);

  return lines.join('\n') + '\n';
}

/** Express/HTTP middleware that serves /metrics. */
export function metricsMiddleware(policy: PolicyPreset, getState: () => {
  totalRequests: number;
  rateLimitHits: number;
  tokenBudgetExhausted: number;
  circuitBreakerTrips: number;
  tokensConsumed: number;
  circuitBreakerState: 0 | 1 | 2;
  guardrailViolations?: number;
}) {
  return (_req: any, res: any) => {
    res.setHeader('Content-Type', 'text/plain; version=0.0.4');
    res.end(prometheusText(policy, getState()));
  };
}
