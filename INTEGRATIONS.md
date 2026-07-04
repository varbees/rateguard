# Framework Integrations

RateGuard wraps the HTTP client your LLM SDK already uses — so it plugs into
any framework that lets you pass a custom client or fetch. One line each.

## Why integrate at the wire, not in the framework

Framework-level token counting is unreliable today:

- LangChain reports **incorrect token counts in streaming mode** —
  [langchain#30429](https://github.com/langchain-ai/langchain/issues/30429)
- CrewAI's `result.token_usage` **doesn't match the provider's own count** —
  [community report](https://community.crewai.com/t/crewai-result-token-usage-not-matching-with-llms-token-usage-count/3467),
  [crewAI#162](https://github.com/joaomdmoura/crewAI/issues/162)
- Every aggregation layer re-implements usage parsing per provider, and
  streaming events (OpenAI `usage:null` intermediates, Anthropic's split
  `message_start`/`message_delta`) break naive implementations.

RateGuard counts **below** the framework, at the transport layer: the numbers
are whatever the provider actually put in the response. Budgets, per-provider
circuit breakers, and fallback come along for free — no framework callbacks,
no proxy, no new service.

---

## Python (async-first — agent frameworks run on `httpx.AsyncClient`)

### OpenAI SDK
```python
from openai import AsyncOpenAI, OpenAI
from rateguard import RateGuard

rg = RateGuard(preset="agent-orchestrator")

client = OpenAI(http_client=rg.wrap_httpx_client())            # sync
aclient = AsyncOpenAI(http_client=rg.wrap_httpx_async_client())  # async
```

### Anthropic SDK
```python
from anthropic import AsyncAnthropic

aclient = AsyncAnthropic(http_client=rg.wrap_httpx_async_client())
```

### LangChain / LangGraph
`ChatOpenAI` accepts both clients ([reference](https://reference.langchain.com/python/langchain-openai/chat_models/base/BaseChatOpenAI/http_async_client)) — pass both so sync and async paths are covered:
```python
from langchain_openai import ChatOpenAI

llm = ChatOpenAI(
    model="gpt-4o",
    http_client=rg.wrap_httpx_client(),
    http_async_client=rg.wrap_httpx_async_client(),
)
# Use llm inside any LangGraph graph — every call is budgeted and metered.
```

### OpenAI Agents SDK
One global line ([official config docs](https://openai.github.io/openai-agents-python/config/)):
```python
from agents import set_default_openai_client
from openai import AsyncOpenAI

set_default_openai_client(AsyncOpenAI(http_client=rg.wrap_httpx_async_client()))
```

### Pydantic AI
Providers accept an `http_client`:
```python
from pydantic_ai.models.openai import OpenAIModel
from pydantic_ai.providers.openai import OpenAIProvider

model = OpenAIModel("gpt-4o", provider=OpenAIProvider(http_client=rg.wrap_httpx_async_client()))
```

### CrewAI — honest status
CrewAI's native provider path does not currently expose custom HTTP client
injection, and multi-provider routing has open issues
([crewAI#5139](https://github.com/crewAIInc/crewAI/issues/5139)). Since
CrewAI's own `token_usage` is known to disagree with provider counts (links
above), we track client-injection support and will publish a recipe the day
it lands. Until then: CrewAI's LiteLLM fallback path can point `base_url` at
infrastructure you control, but that is a proxy pattern — not what RateGuard
recommends.

---

## Node / TypeScript

### OpenAI SDK
```ts
import OpenAI from 'openai';
import { RateGuard } from '@varbees/rateguard-node';

const rg = new RateGuard({ preset: 'agent-orchestrator' });
const client = new OpenAI({ fetch: rg.wrapFetch() });
```

### Anthropic SDK
```ts
import Anthropic from '@anthropic-ai/sdk';

const client = new Anthropic({ fetch: rg.wrapFetch() });
```

### Vercel AI SDK
The provider `fetch` option is the official middleware surface ([docs](https://ai-sdk.dev/providers/ai-sdk-providers/openai)):
```ts
import { createOpenAI } from '@ai-sdk/openai';

const openai = createOpenAI({ fetch: rg.wrapFetch() });
const { text } = await generateText({ model: openai('gpt-4o'), prompt });
```
Works identically for `createAnthropic`, `createGroq`, and every
OpenAI-compatible AI SDK provider — they all accept `fetch`.

### Mastra
Mastra models are AI SDK providers — pass the wrapped fetch exactly as above.

---

## Go

### openai-go / anthropic-sdk-go
```go
rg := rateguard.New(rateguard.Config{Preset: "agent-orchestrator"})
httpClient := rg.WrapClient(&http.Client{})

openai := openai.NewClient(option.WithHTTPClient(httpClient))
claude := anthropic.NewClient(option.WithHTTPClient(httpClient))
```

Any Go framework that lets you supply the provider client (which is all of
them — the pattern is universal in Go) inherits RateGuard automatically.

---

## What every integration gets

| Capability | How |
|---|---|
| Real token usage per call | Extracted from the provider's response — JSON and SSE streaming |
| Token budgets (hr/day/mo) | Scoped `{tenant}:{provider}:{model}:outbound`, reserve → commit |
| Per-provider circuit breakers | An OpenAI outage doesn't trip DeepSeek |
| Enforcement | Synthesized provider-native 429/503 with `Retry-After` — SDK retry logic just works |
| Fallback | OpenAI-compatible providers, credential-isolated |
| Pre-flight queries | MCP tools (`get_token_budget`, `check_loop`, ...) — agents ask before they spend |
| Metrics | Prometheus `/metrics`: outbound calls, fallbacks, tokens consumed |
