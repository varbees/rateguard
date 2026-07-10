"""
LiteLLM / CrewAI integration — enforce token budgets on ``litellm.completion``.

CrewAI (and many agent stacks) route every LLM call through
``litellm.completion`` / ``litellm.acompletion``. Injecting a custom httpx
client via ``litellm.client_session`` is documented but provider-inconsistent
(litellm routes some providers over aiohttp, silently bypassing the injected
client) — so this adapter meters from the **response** instead, which is
provider-agnostic and reliable regardless of litellm's internal transport::

    import litellm
    from rateguard import RateGuard, TokenBudgetOptions

    rg = RateGuard(token_budget=TokenBudgetOptions(hour_limit=100_000))
    litellm.completion = rg.wrap_completion(litellm.completion)     # sync
    litellm.acompletion = rg.wrap_acompletion(litellm.acompletion)  # async

Every CrewAI agent call then reserves budget before the call and commits the
real usage from ``response.usage`` after; a hard-stop budget raises
``BudgetExceeded`` when exhausted. Streaming responses (``stream=True``) commit
the reserved estimate — exact streaming usage isn't known until the caller
consumes the generator (set the provider's usage emission for exact accounting,
same trade-off as the wire-level transport).
"""

from __future__ import annotations

import functools
from typing import TYPE_CHECKING, Any, Awaitable, Callable

if TYPE_CHECKING:
    from ..facade import RateGuard

_DEFAULT_ESTIMATE = 4096

# litellm model-string prefixes → the provider scope used in the budget key.
# Only the common ones; a "provider/model" string is split directly, and any
# unknown bare name defaults to openai (litellm's own default provider).
_PREFIX_PROVIDER = {
    "gpt": "openai",
    "o1": "openai",
    "o3": "openai",
    "o4": "openai",
    "chatgpt": "openai",
    "claude": "anthropic",
    "gemini": "google",
    "deepseek": "deepseek",
    "llama": "meta",
    "mistral": "mistral",
    "command": "cohere",
}


def _provider_and_model(model: str) -> tuple[str, str]:
    model = (model or "").strip()
    if "/" in model:
        provider, _, name = model.partition("/")
        return provider or "litellm", name or "default"
    head = model.split("-", 1)[0].lower()
    return _PREFIX_PROVIDER.get(head, "openai"), model or "default"


def _usage_total(response: Any) -> int:
    usage: Any = getattr(response, "usage", None)
    if usage is None and isinstance(response, dict):
        usage = response.get("usage")
    if usage is None:
        return 0

    def field(name: str) -> int:
        value = getattr(usage, name, None)
        if value is None and isinstance(usage, dict):
            value = usage.get(name)
        try:
            return int(value) if value else 0
        except (TypeError, ValueError):
            return 0

    total = field("total_tokens")
    return total if total > 0 else field("prompt_tokens") + field("completion_tokens")


def _budget_key(rg: "RateGuard", model_arg: str) -> str:
    provider, model = _provider_and_model(model_arg)
    return f"{rg.runtime.config.tenant_id}:{provider}:{model}:outbound"


def _estimate(rg: "RateGuard") -> int:
    return rg.runtime.config.estimated_tokens_per_request or _DEFAULT_ESTIMATE


def _commit(rg: "RateGuard", key: str, reservation: Any, response: Any, streaming: bool) -> None:
    budget = rg.runtime.token_budget
    total = 0 if streaming else _usage_total(response)
    if total > 0:
        budget.commit_reservation(key, reservation.reservation_id, total)
    elif reservation.reserved > 0:
        # Unmeasurable (streaming, or a response with no usage) → commit the
        # reserved estimate, not zero: enforcement stays conservative.
        budget.commit_reservation(key, reservation.reservation_id, reservation.reserved)
    else:
        budget.release_reservation(key, reservation.reservation_id)


def _model_arg(args: tuple[Any, ...], kwargs: dict[str, Any]) -> str:
    model = kwargs.get("model")
    if model is None and args:
        model = args[0]
    return model if isinstance(model, str) else ""


def wrap_completion(rg: "RateGuard", fn: Callable[..., Any]) -> Callable[..., Any]:
    """Wrap ``litellm.completion`` (sync) to enforce token budgets from the response."""

    @functools.wraps(fn)
    def wrapped(*args: Any, **kwargs: Any) -> Any:
        key = _budget_key(rg, _model_arg(args, kwargs))
        reservation = rg.runtime.token_budget.reserve(key, rg.runtime.config.token_budget, _estimate(rg))
        if reservation.decision.applied and not reservation.decision.allowed:
            raise rg.runtime.token_budget.budget_exceeded(key, reservation.decision)
        try:
            response = fn(*args, **kwargs)
        except Exception:
            rg.runtime.token_budget.release_reservation(key, reservation.reservation_id)
            raise
        _commit(rg, key, reservation, response, streaming=bool(kwargs.get("stream")))
        return response

    return wrapped


def wrap_acompletion(rg: "RateGuard", fn: Callable[..., Awaitable[Any]]) -> Callable[..., Awaitable[Any]]:
    """Wrap ``litellm.acompletion`` (async) to enforce token budgets from the response."""

    @functools.wraps(fn)
    async def wrapped(*args: Any, **kwargs: Any) -> Any:
        key = _budget_key(rg, _model_arg(args, kwargs))
        reservation = await rg.runtime.token_budget.reserve_async(
            key, rg.runtime.config.token_budget, _estimate(rg)
        )
        if reservation.decision.applied and not reservation.decision.allowed:
            raise rg.runtime.token_budget.budget_exceeded(key, reservation.decision)
        try:
            response = await fn(*args, **kwargs)
        except Exception:
            rg.runtime.token_budget.release_reservation(key, reservation.reservation_id)
            raise
        _commit(rg, key, reservation, response, streaming=bool(kwargs.get("stream")))
        return response

    return wrapped
