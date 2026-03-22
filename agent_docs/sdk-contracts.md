# SDK Contracts

## SDK Surface

| Package | Language | Role |
|---|---|---|
| `packages/sdk-go` | Go | In-process middleware SDK |
| `packages/sdk-node` | TypeScript / Node | In-process middleware SDK |
| `packages/sdk-python` | Python | In-process middleware SDK |
| `packages/sdk-ts` | TypeScript | Generated control-plane client, not middleware |

## Shared Primitives

Every middleware SDK should expose:

1. rate-limited middleware or wrapper construction
2. token-budget enforcement
3. circuit-breaker protection
4. event emission to the control plane
5. bounded hot-path caches

## Parity Rule

If rate limiting, token budgets, or circuit breaking change in one SDK,
check the others in the same workstream or file an explicit follow-up.

## Streaming Token Parity

- OpenAI: use the final streamed usage chunk.
- Anthropic: use the usage fields from the final message delta.
- Generic: sum the usage fields found across the stream when provider-specific metadata is absent.
