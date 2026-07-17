import type { HeadersLike, RateGuardEventEnvelope, RateGuardEventPayload, TokenUsage } from '../types.js';

type JsonPrimitive = string | number | boolean | null;
type JsonObject = { [key: string]: JsonValue | undefined };
type JsonValue = JsonPrimitive | JsonObject | JsonValue[];

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

function readHeader(headers: HeadersLike | undefined, name: string): string {
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

function readFirstIntHeader(headers: HeadersLike | undefined, names: readonly string[]): number {
  for (const name of names) {
    const value = readHeader(headers, name);
    if (!value) {
      continue;
    }
    const parsed = Number.parseInt(value, 10);
    if (!Number.isNaN(parsed)) {
      return parsed;
    }
    // eslint-disable-next-line no-console
    console.warn(`RateGuard ignored invalid integer token header ${name}: ${value}`);
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

function safeJsonParse(text: string): JsonValue | undefined {
  if (!looksLikeJson(text)) {
    return undefined;
  }
  try {
    const parsed: unknown = JSON.parse(text);
    return isJsonValue(parsed) ? parsed : undefined;
  } catch (error) {
    // eslint-disable-next-line no-console
    console.warn('RateGuard failed to parse token usage JSON payload', error);
    return undefined;
  }
}

function readObjectUsage(source: JsonObject): TokenUsage | undefined {
  // Anthropic streaming nests usage under message (message_start events).
  const nestedMessage = asRecord(source.message);
  const usageSource =
    asRecord(source.usage) ??
    asRecord(nestedMessage?.usage) ??
    asRecord(source.usageMetadata) ??
    source;
  // Aliases cover OpenAI (prompt/completion), Anthropic (input/output),
  // AWS Bedrock Converse (inputTokens/outputTokens — camelCase), Google.
  const inputTokens = firstNumber(usageSource, ['input_tokens', 'prompt_tokens', 'inputTokens', 'promptTokenCount']);
  const outputTokens = firstNumber(usageSource, ['output_tokens', 'completion_tokens', 'outputTokens', 'candidatesTokenCount']);
  const totalTokens = firstNumber(usageSource, ['total_tokens', 'totalTokens', 'totalTokenCount']);

  const provider = firstString(source, ['provider', 'x_provider', 'token_provider']);
  const model = firstString(source, ['model', 'x_model', 'token_model']) || (nestedMessage ? firstString(nestedMessage, ['model']) : '');

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

function asRecord(value: JsonValue | undefined): JsonObject | undefined {
  if (value && typeof value === 'object' && !Array.isArray(value)) {
    return value;
  }
  return undefined;
}

function firstString(source: JsonObject, keys: readonly string[]): string {
  for (const key of keys) {
    const value = source[key];
    if (typeof value === 'string' && value.trim()) {
      return value.trim();
    }
  }
  return '';
}

function firstNumber(source: JsonObject, keys: readonly string[]): number {
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
  // Max semantics, matching the Go SDK: streaming providers repeat and
  // refine usage across events (Anthropic message_start reports
  // output_tokens:1, the final message_delta the real count). Summing
  // would double-count.
  const inputTokens = Math.max(base.inputTokens, addition.inputTokens);
  const outputTokens = Math.max(base.outputTokens, addition.outputTokens);
  return {
    provider: base.provider || addition.provider,
    model: base.model || addition.model,
    inputTokens,
    outputTokens,
    totalTokens: Math.max(base.totalTokens, addition.totalTokens, inputTokens + outputTokens),
  };
}

/**
 * Extract token usage from a JSON or SSE response body.
 */
/** True when any line begins an SSE data event. */
function hasSSEDataLine(text: string): boolean {
  return text.split(/\r?\n/).some((line) => line.trim().startsWith('data:'));
}

export function extractTokenUsageFromText(text: string): TokenUsage | undefined {
  if (!text.trim()) {
    return undefined;
  }

  // SSE is decided by a line ACTUALLY starting with "data:", not by the text
  // containing a newline. Requiring a newline broke the single-usage-event
  // case — which is the OpenAI-compatible shape, where only the final chunk
  // carries usage. That text is one "data: {...}" line with no newline, so it
  // fell through and got JSON-parsed WITH the "data: " prefix still on it,
  // failing silently and reporting no usage at all. Substring-matching
  // 'data:' alone is not enough either: a plain JSON body like {"data":[...]}
  // contains it.
  if (hasSSEDataLine(text)) {
    const chunks = text
      .split(/\r?\n/)
      .map((line) => line.trim())
      .filter((line) => line.startsWith('data:'))
      .map((line) => line.slice(5).trim())
      .filter(Boolean);

    let aggregate: TokenUsage | undefined;
    for (const chunk of chunks) {
      if (chunk === '[DONE]') {
        continue;
      }
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
function extractTokenUsageFromValue(value: JsonValue | undefined): TokenUsage | undefined {
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

function looksLikeJson(text: string): boolean {
  const trimmed = text.trim();
  return trimmed.startsWith('{') || trimmed.startsWith('[');
}

function isJsonValue(value: unknown): value is JsonValue {
  if (value === null) {
    return true;
  }
  switch (typeof value) {
    case 'string':
    case 'number':
    case 'boolean':
      return true;
    case 'object':
      if (Array.isArray(value)) {
        return value.every(isJsonValue);
      }
      return Object.values(value).every((item) => item === undefined || isJsonValue(item));
    default:
      return false;
  }
}

export function toJson(data: RateGuardEventEnvelope | RateGuardEventPayload): string {
  return JSON.stringify(data);
}

export function formatRetryAfterMs(retryAfterMs: number): string {
  const seconds = Math.max(1, Math.ceil(retryAfterMs / 1000));
  return String(seconds);
}
