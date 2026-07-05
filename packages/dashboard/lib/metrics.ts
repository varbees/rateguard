/** Minimal Prometheus text-format reader — just enough to pull the counters
 * RateGuard's /metrics endpoint exposes. Not a general PromQL client. */
export function parsePrometheusText(text: string): Record<string, number> {
  const values: Record<string, number> = {};
  for (const line of text.split("\n")) {
    if (!line || line.startsWith("#")) continue;
    const spaceIdx = line.lastIndexOf(" ");
    if (spaceIdx === -1) continue;
    const nameAndLabels = line.slice(0, spaceIdx);
    const rawValue = line.slice(spaceIdx + 1).trim();
    const value = Number(rawValue);
    if (Number.isNaN(value)) continue;
    const name = nameAndLabels.split("{")[0];
    values[name] = value;
  }
  return values;
}

export type CumulativeCounters = {
  requestsTotal: number;
  rateLimitHitsTotal: number;
  tokenBudgetExhaustedTotal: number;
  circuitBreakerTripsTotal: number;
  tokensConsumedTotal: number;
  outboundCallsTotal: number;
  outboundFallbacksTotal: number;
};

export function extractCounters(values: Record<string, number>): CumulativeCounters {
  return {
    requestsTotal: values["rateguard_requests_total"] ?? 0,
    rateLimitHitsTotal: values["rateguard_rate_limit_hits_total"] ?? 0,
    tokenBudgetExhaustedTotal: values["rateguard_token_budget_exhausted_total"] ?? 0,
    circuitBreakerTripsTotal: values["rateguard_circuit_breaker_trips_total"] ?? 0,
    tokensConsumedTotal: values["rateguard_tokens_consumed_total"] ?? 0,
    outboundCallsTotal: values["rateguard_outbound_calls_total"] ?? 0,
    outboundFallbacksTotal: values["rateguard_outbound_fallbacks_total"] ?? 0,
  };
}
