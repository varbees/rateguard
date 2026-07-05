import {
  type Clock,
  type CircuitBreakerOptions,
  type PolicyPreset,
  type PresetName,
  type RateGuardOptions,
  type ResolvedRateGuardOptions,
  type TokenBudgetMode,
} from './types.js';

const defaultClock: Clock = {
  now: () => Date.now(),
};

/**
 * Normalize documented preset aliases into the canonical vocabulary.
 */
export function normalizePreset(preset: string | undefined | null): PresetName {
  switch ((preset ?? '').trim().toLowerCase()) {
    case '':
    case 'free':
    case 'dev':
      return 'dev';
    case 'starter':
    case 'standard':
      return 'standard';
    case 'pro':
    case 'high-throughput':
      return 'high-throughput';
    case 'business':
    case 'enterprise':
    case 'llm-heavy':
      return 'llm-heavy';
    case 'strict-upstream-protection':
      return 'strict-upstream-protection';
    case 'streaming-llm':
    case 'streaming':
    case 'llm-stream':
      return 'streaming-llm';
    case 'agent-orchestrator':
    case 'agent':
    case 'multi-agent':
    case 'orchestrator':
      return 'agent-orchestrator';
    case 'mcp-server':
    case 'mcp':
      return 'mcp-server';
    default:
      return 'dev';
  }
}

/**
 * Return the canonical policy preset definition for a preset name.
 */
export function presetPolicy(preset: string | undefined | null): PolicyPreset {
  switch (normalizePreset(preset)) {
    case 'standard':
      return {
        name: 'standard',
        requestsPerSecond: 100,
        burst: 200,
        maxApis: 10,
        monthlyRequestLimit: 1_000_000,
        maxRequestsPerDay: 10_000_000,
        maxRequestsPerMonth: 1_000_000,
        maxTokensPerMonth: 10_000_000,
        tokenBudgetPerHour: 10_000,
        tokenBudgetPerDay: 100_000,
        tokenBudgetPerMonth: 1_000_000,
        tokenBudgetMode: 'hard-stop',
        advancedAnalytics: true,
        prioritySupport: false,
        customRateLimits: true,
        webhooks: false,
        apiAccess: true,
        analyticsRetentionDays: 30,
      };
    case 'high-throughput':
      return {
        name: 'high-throughput',
        requestsPerSecond: 1_000,
        burst: 2_000,
        maxApis: 0,
        monthlyRequestLimit: 10_000_000,
        maxRequestsPerDay: 100_000_000,
        maxRequestsPerMonth: 10_000_000,
        maxTokensPerMonth: 100_000_000,
        tokenBudgetPerHour: 100_000,
        tokenBudgetPerDay: 1_000_000,
        tokenBudgetPerMonth: 10_000_000,
        tokenBudgetMode: 'hard-stop',
        advancedAnalytics: true,
        prioritySupport: true,
        customRateLimits: true,
        webhooks: true,
        apiAccess: true,
        analyticsRetentionDays: 90,
      };
    case 'llm-heavy':
      return {
        name: 'llm-heavy',
        requestsPerSecond: 500,
        burst: 1_000,
        maxApis: 0,
        monthlyRequestLimit: 5_000_000,
        maxRequestsPerDay: 25_000_000,
        maxRequestsPerMonth: 5_000_000,
        maxTokensPerMonth: 250_000_000,
        tokenBudgetPerHour: 250_000,
        tokenBudgetPerDay: 2_500_000,
        tokenBudgetPerMonth: 250_000_000,
        tokenBudgetMode: 'soft-stop',
        advancedAnalytics: true,
        prioritySupport: true,
        customRateLimits: true,
        webhooks: true,
        apiAccess: true,
        analyticsRetentionDays: 90,
      };
    case 'strict-upstream-protection':
      return {
        name: 'strict-upstream-protection',
        requestsPerSecond: 50,
        burst: 75,
        maxApis: 5,
        monthlyRequestLimit: 500_000,
        maxRequestsPerDay: 1_000_000,
        maxRequestsPerMonth: 500_000,
        maxTokensPerMonth: 2_000_000,
        tokenBudgetPerHour: 5_000,
        tokenBudgetPerDay: 20_000,
        tokenBudgetPerMonth: 2_000_000,
        tokenBudgetMode: 'hard-stop',
        advancedAnalytics: true,
        prioritySupport: false,
        customRateLimits: true,
        webhooks: true,
        apiAccess: true,
        analyticsRetentionDays: 14,
      };
    case 'streaming-llm':
      return {
        name: 'streaming-llm',
        requestsPerSecond: 200, burst: 500, maxApis: 0,
        monthlyRequestLimit: 2_000_000, maxRequestsPerDay: 5_000_000, maxRequestsPerMonth: 2_000_000,
        maxTokensPerMonth: 500_000_000,
        tokenBudgetPerHour: 500_000, tokenBudgetPerDay: 5_000_000, tokenBudgetPerMonth: 500_000_000,
        tokenBudgetMode: 'soft-stop',
        advancedAnalytics: true, prioritySupport: true, customRateLimits: true, webhooks: true, apiAccess: true,
        analyticsRetentionDays: 90,
      };
    case 'agent-orchestrator':
      return {
        name: 'agent-orchestrator',
        requestsPerSecond: 500, burst: 1_000, maxApis: 0,
        monthlyRequestLimit: 10_000_000, maxRequestsPerDay: 50_000_000, maxRequestsPerMonth: 10_000_000,
        maxTokensPerMonth: 1_000_000_000,
        tokenBudgetPerHour: 1_000_000, tokenBudgetPerDay: 10_000_000, tokenBudgetPerMonth: 1_000_000_000,
        tokenBudgetMode: 'soft-stop',
        advancedAnalytics: true, prioritySupport: true, customRateLimits: true, webhooks: true, apiAccess: true,
        analyticsRetentionDays: 180,
      };
    case 'mcp-server':
      return {
        name: 'mcp-server',
        requestsPerSecond: 30, burst: 60, maxApis: 0,
        monthlyRequestLimit: 500_000, maxRequestsPerDay: 1_000_000, maxRequestsPerMonth: 500_000,
        maxTokensPerMonth: 50_000_000,
        tokenBudgetPerHour: 50_000, tokenBudgetPerDay: 500_000, tokenBudgetPerMonth: 50_000_000,
        tokenBudgetMode: 'hard-stop',
        advancedAnalytics: true, prioritySupport: false, customRateLimits: true, webhooks: true, apiAccess: true,
        analyticsRetentionDays: 30,
      };
    case 'dev':
    default:
      return {
        name: 'dev',
        requestsPerSecond: 10,
        burst: 20,
        maxApis: 3,
        monthlyRequestLimit: 100_000,
        maxRequestsPerDay: 1_000_000,
        maxRequestsPerMonth: 100_000,
        maxTokensPerMonth: 100_000,
        tokenBudgetPerHour: 1_000,
        tokenBudgetPerDay: 10_000,
        tokenBudgetPerMonth: 100_000,
        tokenBudgetMode: 'hard-stop',
        advancedAnalytics: false,
        prioritySupport: false,
        customRateLimits: false,
        webhooks: false,
        apiAccess: true,
        analyticsRetentionDays: 7,
      };
  }
}

/**
 * Return the canonical preset names in display order.
 */
export function knownPresets(): PresetName[] {
  return ['dev', 'standard', 'high-throughput', 'streaming-llm', 'agent-orchestrator', 'llm-heavy', 'mcp-server', 'strict-upstream-protection'];
}

/**
 * Resolve the root SDK configuration against defaults and preset values.
 */
export function resolveRateGuardOptions(options: RateGuardOptions = {}): ResolvedRateGuardOptions {
  const preset = presetPolicy(options.preset);
  const tokenBudgetMode = normalizeTokenBudgetMode(options.tokenBudget?.mode ?? preset.tokenBudgetMode);
  const clock = options.clock ?? defaultClock;
  const controlPlaneUrl = options.controlPlaneUrl?.trim() || undefined;
  const derivedWsUrl = controlPlaneUrl ? deriveWsUrl(controlPlaneUrl) : undefined;
  const wsUrl = options.wsUrl?.trim() || derivedWsUrl;

  return {
    apiKey: options.apiKey,
    preset: {
      ...preset,
      requestsPerSecond: options.rateLimit?.requestsPerSecond ?? preset.requestsPerSecond,
      burst: options.rateLimit?.burst ?? preset.burst,
      monthlyRequestLimit: preset.monthlyRequestLimit,
      tokenBudgetPerHour: options.tokenBudget?.hourLimit ?? preset.tokenBudgetPerHour,
      tokenBudgetPerDay: options.tokenBudget?.dayLimit ?? preset.tokenBudgetPerDay,
      tokenBudgetPerMonth: options.tokenBudget?.monthLimit ?? preset.tokenBudgetPerMonth,
      tokenBudgetMode,
    },
    tenantId: options.tenantId?.trim() || 'global',
    routeId: options.routeId?.trim() || 'root',
    upstreamId: options.upstreamId?.trim() || 'local',
    provider: options.provider?.trim() || undefined,
    model: options.model?.trim() || undefined,
    controlPlaneUrl,
    wsUrl,
    keyFn: options.keyFn,
    rateLimit: {
      requestsPerSecond: options.rateLimit?.requestsPerSecond ?? preset.requestsPerSecond,
      burst: options.rateLimit?.burst ?? preset.burst,
      windowMs: options.rateLimit?.windowMs ?? 1_000,
      remoteRateLimitEndpoint:
        options.rateLimit?.remoteRateLimitEndpoint ??
        (controlPlaneUrl ? `${controlPlaneUrl.replace(/\/$/, '')}/api/v1/ratelimit` : ''),
    },
    tokenBudget: {
      hourLimit: options.tokenBudget?.hourLimit ?? preset.tokenBudgetPerHour,
      dayLimit: options.tokenBudget?.dayLimit ?? preset.tokenBudgetPerDay,
      monthLimit: options.tokenBudget?.monthLimit ?? preset.tokenBudgetPerMonth,
      mode: tokenBudgetMode,
      softStopAt: options.tokenBudget?.softStopAt ?? 0.8,
    },
    circuitBreaker: normalizeCircuitBreakerOptions(options.circuitBreaker),
    eventEmitter: options.eventEmitter,
    eventEndpoint: options.eventEndpoint?.trim() || undefined,
    clock,
    guardrails: options.guardrails,
    loopDetection: options.loopDetection ?? false,
    estimatedTokensPerRequest:
      typeof options.estimatedTokensPerRequest === 'number' && options.estimatedTokensPerRequest > 0
        ? Math.floor(options.estimatedTokensPerRequest)
        : 0,
  };
}

/**
 * Normalize circuit-breaker options so invalid user input cannot poison the
 * rolling window state machine.
 */
export function normalizeCircuitBreakerOptions(options: CircuitBreakerOptions | undefined): Required<CircuitBreakerOptions> {
  const threshold = options?.errorRateThreshold;
  const openTimeoutMs = options?.openTimeoutMs;
  const halfOpenSuccessesRequired = options?.halfOpenSuccessesRequired;
  const sampleSize = options?.sampleSize;

  return {
    errorRateThreshold: typeof threshold === 'number' && threshold > 0 && threshold <= 1 ? threshold : 0.5,
    openTimeoutMs: typeof openTimeoutMs === 'number' && openTimeoutMs > 0 ? Math.floor(openTimeoutMs) : 60_000,
    halfOpenSuccessesRequired:
      typeof halfOpenSuccessesRequired === 'number' && halfOpenSuccessesRequired > 0
        ? Math.floor(halfOpenSuccessesRequired)
        : 2,
    sampleSize: typeof sampleSize === 'number' && sampleSize > 0 ? Math.floor(sampleSize) : 100,
  };
}

/**
 * Normalize token budget modes into the canonical vocabulary.
 */
export function normalizeTokenBudgetMode(mode: string | undefined | null): TokenBudgetMode {
  switch ((mode ?? '').trim().toLowerCase()) {
    case '':
    case 'hard':
    case 'reject':
    case 'hard-stop':
      return 'hard-stop';
    case 'soft':
    case 'queue':
    case 'soft-stop':
      return 'soft-stop';
    default:
      return 'hard-stop';
  }
}

/**
 * Resolve a websocket endpoint from a control-plane URL when one is not provided.
 */
export function deriveWsUrl(controlPlaneUrl?: string): string | undefined {
  if (!controlPlaneUrl) {
    return undefined;
  }

  let url: URL;
  try {
    url = new URL(controlPlaneUrl);
  } catch {
    throw new Error(`Invalid RateGuard controlPlaneUrl: ${controlPlaneUrl}`);
  }

  if (url.protocol !== 'https:' && url.protocol !== 'http:') {
    throw new Error(`Invalid RateGuard controlPlaneUrl: ${controlPlaneUrl}`);
  }

  url.protocol = url.protocol === 'https:' ? 'wss:' : 'ws:';
  if (!url.pathname.endsWith('/ws')) {
    url.pathname = `${url.pathname.replace(/\/$/, '')}/ws`;
  }
  return url.toString();
}

/**
 * Default `Clock` implementation.
 */
export const systemClock: Clock = {
  now: () => Date.now(),
};
