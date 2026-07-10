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

### Pipecat (voice pipelines)

Production voice terminates media inside the framework, so enforcement lives
there too. `RateGuardBudgetProcessor` is a drop-in `FrameProcessor`: it watches
the LLM usage metrics Pipecat itself emits, passes every frame through
untouched, and on breach pushes Pipecat's own fatal-error stop (or calls your
callback first — say goodbye politely, then stop). Requires `pipecat-ai`
(verified against 1.5.0).

```python
from rateguard import RealtimeSessionGuard, RealtimeSessionGuardOptions, RealtimeSessionLimits
from rateguard.integrations.pipecat_adapter import RateGuardBudgetProcessor

guard = RealtimeSessionGuard("openai", RealtimeSessionGuardOptions(
    limits=RealtimeSessionLimits(
        max_total_tokens=200_000,       # session token ceiling
        max_duration_seconds=1_800,     # 30-minute call cap
    ),
))

pipeline = Pipeline([
    transport.input(), stt, llm,
    RateGuardBudgetProcessor(guard),    # anywhere after the LLM works
    tts, transport.output(),
])
```

Set `fatal_on_exceeded=False` to observe without stopping, and
`on_exceeded=` (sync or async) to act before the stop lands.

### LiveKit Agents (voice sessions)

LiveKit emits per-inference metrics for both the LLM path and the realtime
path (with audio/text/cached token splits) — `attach_rateguard` subscribes
and feeds the guard. The guard decides; your callback acts. Requires
`livekit-agents` (verified against 1.6.5).

```python
from rateguard import (RealtimeCostRates, RealtimeSessionGuard,
                       RealtimeSessionGuardOptions, RealtimeSessionLimits)
from rateguard.integrations.livekit_adapter import attach_rateguard

guard = RealtimeSessionGuard("openai", RealtimeSessionGuardOptions(
    limits=RealtimeSessionLimits(max_estimated_cost_micro_usd=500_000),  # $0.50/session
    cost_rates=RealtimeCostRates(input_audio_per_m_tokens=32_000_000,    # $32/M
                                 output_audio_per_m_tokens=64_000_000),  # $64/M
))

def stop(decision):
    session.interrupt()  # or schedule session.aclose()

attach_rateguard(session, guard, on_exceeded=stop)
```

Cost rates are caller-supplied (micro-USD per million tokens) — realtime
pricing changes too often to bake in, and the estimate is never invoice truth.

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
| Metrics | Go `/metrics` endpoint plus Node/Python Prometheus text helpers for app-mounted metrics |
