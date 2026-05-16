import type { HeadersLike, TokenUsage } from '../types.js';

export function lowerBound(values: number[], target: number): number {
  let low = 0;
  let high = values.length;
  while (low < high) {
    const mid = Math.floor((low + high) / 2);
    const value = values[mid] ?? Number.POSITIVE_INFINITY;
    if (value < target) {
      low = mid + 1;
    } else {
      high = mid;
    }
  }
  return low;
}

export function readHeader(headers: HeadersLike | undefined, name: string): string {
  if (!headers) {
    return '';
  }

  const headerBag = headers as Headers | undefined;
  if (headerBag && typeof headerBag.get === 'function') {
    const value = headerBag.get(name);
    return value?.trim() ?? '';
  }

  for (const [key, rawValue] of Object.entries(headers)) {
    if (!key || key.toLowerCase() !== name.toLowerCase()) {
      continue;
    }
    if (Array.isArray(rawValue)) {
      return rawValue[0]?.trim() ?? '';
    }
    return rawValue?.trim() ?? '';
  }

  return '';
}

export function readFirstHeader(headers: HeadersLike | undefined, names: readonly string[]): string {
  for (const name of names) {
    const value = readHeader(headers, name);
    if (value) {
      return value;
    }
  }
  return '';
}

export function readFirstIntHeader(headers: HeadersLike | undefined, names: readonly string[]): number {
  for (const name of names) {
    const value = readHeader(headers, name);
    if (!value) {
      continue;
    }
    const parsed = Number.parseInt(value, 10);
    if (!Number.isNaN(parsed)) {
      return parsed;
    }
  }
  return 0;
}

export function extractTokenUsageFromHeaders(headers: HeadersLike | undefined): TokenUsage | undefined {
  const inputTokens = readFirstIntHeader(headers, [
    'x-rateguard-input-tokens',
    'x-input-tokens',
    'input-tokens',
    'prompt-tokens',
  ]);
  const outputTokens = readFirstIntHeader(headers, [
    'x-rateguard-output-tokens',
    'x-output-tokens',
    'output-tokens',
    'completion-tokens',
  ]);
  const totalTokens = readFirstIntHeader(headers, [
    'x-rateguard-total-tokens',
    'x-total-tokens',
    'total-tokens',
  ]);

  if (inputTokens === 0 && outputTokens === 0 && totalTokens === 0) {
    return undefined;
  }

  return {
    provider: readFirstHeader(headers, ['x-rateguard-provider', 'x-provider', 'provider']) || undefined,
    model: readFirstHeader(headers, ['x-rateguard-model', 'x-model', 'model']) || undefined,
    inputTokens,
    outputTokens,
    totalTokens: totalTokens || inputTokens + outputTokens,
  };
}

export function safeJsonParse(text: string): unknown | undefined {
  try {
    return JSON.parse(text) as unknown;
  } catch {
    return undefined;
  }
}

function readObjectUsage(source: Record<string, unknown>): TokenUsage | undefined {
  const usageSource = asRecord(source.usage) ?? asRecord(source.usageMetadata) ?? source;
  const inputTokens = firstNumber(usageSource, ['input_tokens', 'prompt_tokens', 'promptTokenCount']);
  const outputTokens = firstNumber(usageSource, ['output_tokens', 'completion_tokens', 'candidatesTokenCount']);
  const totalTokens = firstNumber(usageSource, ['total_tokens', 'totalTokenCount']);

  const provider = firstString(source, ['provider', 'x_provider', 'token_provider']);
  const model = firstString(source, ['model', 'x_model', 'token_model']);

  if (inputTokens === 0 && outputTokens === 0 && totalTokens === 0) {
    return undefined;
  }

  return {
    provider: provider || undefined,
    model: model || undefined,
    inputTokens,
    outputTokens,
    totalTokens: totalTokens || inputTokens + outputTokens,
  };
}

function asRecord(value: unknown): Record<string, unknown> | undefined {
  if (value && typeof value === 'object' && !Array.isArray(value)) {
    return value as Record<string, unknown>;
  }
  return undefined;
}

function firstString(source: Record<string, unknown>, keys: readonly string[]): string {
  for (const key of keys) {
    const value = source[key];
    if (typeof value === 'string' && value.trim()) {
      return value.trim();
    }
  }
  return '';
}

function firstNumber(source: Record<string, unknown>, keys: readonly string[]): number {
  for (const key of keys) {
    const value = source[key];
    if (typeof value === 'number' && Number.isFinite(value)) {
      return value;
    }
    if (typeof value === 'string') {
      const parsed = Number.parseInt(value, 10);
      if (!Number.isNaN(parsed)) {
        return parsed;
      }
    }
  }
  return 0;
}

function mergeUsage(base: TokenUsage, addition: TokenUsage): TokenUsage {
  return {
    provider: base.provider || addition.provider,
    model: base.model || addition.model,
    inputTokens: base.inputTokens + addition.inputTokens,
    outputTokens: base.outputTokens + addition.outputTokens,
    totalTokens: base.totalTokens + addition.totalTokens,
  };
}

/**
 * Extract token usage from a JSON or SSE response body.
 */
export function extractTokenUsageFromText(text: string): TokenUsage | undefined {
  if (!text.trim()) {
    return undefined;
  }

  if (text.includes('\n') && text.includes('data:')) {
    const chunks = text
      .split(/\r?\n/)
      .map((line) => line.trim())
      .filter((line) => line.startsWith('data:'))
      .map((line) => line.slice(5).trim())
      .filter(Boolean);

    let aggregate: TokenUsage | undefined;
    for (const chunk of chunks) {
      const parsed = safeJsonParse(chunk);
      const usage = extractTokenUsageFromValue(parsed);
      if (!usage) {
        continue;
      }
      aggregate = aggregate ? mergeUsage(aggregate, usage) : usage;
    }
    return aggregate;
  }

  const parsed = safeJsonParse(text);
  return extractTokenUsageFromValue(parsed);
}

/**
 * Extract token usage from a parsed JSON value.
 */
export function extractTokenUsageFromValue(value: unknown): TokenUsage | undefined {
  if (!value) {
    return undefined;
  }

  if (Array.isArray(value)) {
    let aggregate: TokenUsage | undefined;
    for (const item of value) {
      const usage = extractTokenUsageFromValue(item);
      if (!usage) {
        continue;
      }
      aggregate = aggregate ? mergeUsage(aggregate, usage) : usage;
    }
    return aggregate;
  }

  const record = asRecord(value);
  if (!record) {
    return undefined;
  }

  const direct = readObjectUsage(record);
  if (direct) {
    return direct;
  }

  let aggregate: TokenUsage | undefined;
  for (const nested of Object.values(record)) {
    const usage = extractTokenUsageFromValue(nested);
    if (!usage) {
      continue;
    }
    aggregate = aggregate ? mergeUsage(aggregate, usage) : usage;
  }
  return aggregate;
}

export function joinPath(base: string | undefined, suffix: string): string {
  const normalized = (base ?? '').replace(/\/$/, '');
  return normalized ? `${normalized}${suffix}` : suffix;
}

export function toJson(data: unknown): string {
  return JSON.stringify(data);
}

export function formatRetryAfterMs(retryAfterMs: number): string {
  const seconds = Math.max(1, Math.ceil(retryAfterMs / 1000));
  return String(seconds);
}
