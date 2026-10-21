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
  const counters = readUsageCounters(usageSource);

  const provider = firstString(source, ['provider', 'x_provider', 'token_provider']);
  const model = firstString(source, ['model', 'x_model', 'token_model']) || (nestedMessage ? firstString(nestedMessage, ['model']) : '');

  if (counters.inputTokens === 0 && counters.outputTokens === 0 && counters.totalTokens === 0) {
    return undefined;
  }

  return {
    provider: provider || undefined,
    model: model || undefined,
    ...counters,
    totalTokens: Math.max(counters.totalTokens, counters.inputTokens + counters.outputTokens),
  };
}

type UsageCounters = Required<Omit<TokenUsage, 'provider' | 'model'>>;

/**
 * Read one provider usage object, normalising the prompt to its whole size
 * (see TokenUsage). Mirrors readUsageCounters in Go and _usage_counters in
 * Python; conformance/usage_cache_vectors.json holds all three to the same
 * answers.
 */
function readUsageCounters(usage: JsonObject): UsageCounters {
  // Aliases cover OpenAI (prompt/completion), Anthropic (input/output),
  // AWS Bedrock Converse (inputTokens/outputTokens — camelCase), Google.
  let inputTokens = firstNumber(usage, ['input_tokens', 'prompt_tokens', 'inputTokens', 'promptTokenCount']);
  const outputTokens = firstNumber(usage, ['output_tokens', 'completion_tokens', 'outputTokens', 'candidatesTokenCount']);
  const totalTokens = firstNumber(usage, ['total_tokens', 'totalTokens', 'totalTokenCount']);

  // Anthropic and Bedrock name their cache counters; OpenAI-shaped bodies
  // carry them in a details object.
  const vendorRead = firstNumber(usage, ['cache_read_input_tokens', 'cacheReadInputTokens']);
  let vendorWrite = firstNumber(usage, ['cache_creation_input_tokens', 'cacheWriteInputTokens']);
  let read = vendorRead || firstNumber(usage, ['prompt_cache_hit_tokens', 'cachedContentTokenCount']);
  let write = vendorWrite;
  let writeLongOpenAI = 0;
  const details = asRecord(usage.input_tokens_details) ?? asRecord(usage.prompt_tokens_details);
  if (details) {
    if (read === 0) read = firstNumber(details, ['cached_tokens']);
    if (write === 0) write = firstNumber(details, ['cache_write_tokens']);
    // OpenAI Responses: cache_write_tokens_details.{ttl_30m_tokens,ttl_12h_tokens}.
    const writeDetails = asRecord(details.cache_write_tokens_details);
    if (writeDetails) writeLongOpenAI = firstNumber(writeDetails, ['ttl_12h_tokens']);
  }

  // Long-TTL writes: Anthropic usage.cache_creation.ephemeral_1h_input_tokens,
  // Bedrock usage.cacheDetails[{ttl:"1h", inputTokens}], OpenAI above.
  let writeLong = 0;
  let writeByTTL = 0;
  const creation = asRecord(usage.cache_creation);
  if (creation) {
    writeLong = firstNumber(creation, ['ephemeral_1h_input_tokens']);
    writeByTTL = firstNumber(creation, ['ephemeral_5m_input_tokens']) + writeLong;
  } else if (Array.isArray(usage.cacheDetails)) {
    for (const item of usage.cacheDetails) {
      const detail = asRecord(item);
      if (!detail) continue;
      const n = firstNumber(detail, ['inputTokens']);
      writeByTTL += n;
      if (detail.ttl === '1h') writeLong += n;
    }
  }
  writeLong = Math.max(writeLong, writeLongOpenAI);
  if (write === 0) {
    write = writeByTTL;
    if (writeByTTL > 0) vendorWrite = writeByTTL;
  }

  // Additive shape: Anthropic/Bedrock input_tokens excludes cache reads and
  // writes. A body that also carries prompt_tokens or promptTokenCount
  // (OpenAI, LiteLLM's proxy, Gemini) already reports the whole prompt.
  const hasPrompt = typeof usage.prompt_tokens === 'number' || typeof usage.promptTokenCount === 'number';
  if (!hasPrompt && (vendorRead > 0 || vendorWrite > 0)) {
    inputTokens += read + write;
  } else {
    // Subsets of the reported prompt: a hostile or malformed body must not
    // claim more cached tokens than prompt tokens.
    read = Math.min(read, inputTokens);
    write = Math.min(write, inputTokens - read);
  }
  return {
    inputTokens,
    outputTokens,
    totalTokens,
    cacheReadTokens: read,
    cacheWriteTokens: write,
    cacheWriteLongTTLTokens: Math.min(writeLong, write),
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
      // Clamp to non-negative: a token count is non-negative by definition, so
      // a hostile output_tokens=-1_000_000 must not survive — committing it
      // would DECREASE recorded usage, an attacker-controlled budget refund
      // that lets a runaway agent spend past its cap. A negative counts as "no
      // usage" so the caller commits its reserved estimate. (An overflowed
      // value becomes a huge positive in JS doubles, which over-charges — the
      // safe direction — so only the sign needs guarding here.)
      return Math.max(0, value);
    }
    if (typeof value === 'string') {
      const parsed = Number.parseInt(value, 10);
      if (!Number.isNaN(parsed)) {
        return Math.max(0, parsed);
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
  // Anthropic reports cache reads/writes in message_start, OpenAI in the
  // final chunk: MAX per field, then keep the cache counters subsets of the
  // prompt (per-field maxima can come from different events).
  const inputTokens = Math.max(base.inputTokens, addition.inputTokens);
  const outputTokens = Math.max(base.outputTokens, addition.outputTokens);
  const cacheReadTokens = Math.min(Math.max(base.cacheReadTokens ?? 0, addition.cacheReadTokens ?? 0), inputTokens);
  const cacheWriteTokens = Math.min(
    Math.max(base.cacheWriteTokens ?? 0, addition.cacheWriteTokens ?? 0),
    inputTokens - cacheReadTokens,
  );
  const cacheWriteLongTTLTokens = Math.min(
    Math.max(base.cacheWriteLongTTLTokens ?? 0, addition.cacheWriteLongTTLTokens ?? 0),
    cacheWriteTokens,
  );
  return {
    provider: base.provider || addition.provider,
    model: base.model || addition.model,
    inputTokens,
    outputTokens,
    totalTokens: Math.max(base.totalTokens, addition.totalTokens, inputTokens + outputTokens),
    cacheReadTokens,
    cacheWriteTokens,
    cacheWriteLongTTLTokens,
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
