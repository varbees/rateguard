"""Live provider tests — RateGuard against a REAL LLM API, not a mock.

Everything else in this suite proves RateGuard is self-consistent. These tests
prove it survives contact with a provider that was not built to our
assumptions: real usage schemas, real SSE framing, real latency, real
tokenizers.

They are SKIPPED unless a live endpoint is configured, so `pytest` stays
hermetic and offline by default:

    RATEGUARD_LIVE_BASE_URL=https://integrate.api.nvidia.com/v1 \\
    RATEGUARD_LIVE_API_KEY=nvapi-... \\
    RATEGUARD_LIVE_MODEL=meta/llama-3.1-8b-instruct \\
    python3 -m pytest tests/live -v

Verified against NVIDIA NIM (free tier) on 2026-07-17. Any OpenAI-compatible
endpoint works, including a local Ollama:

    RATEGUARD_LIVE_BASE_URL=http://localhost:11434/v1 \\
    RATEGUARD_LIVE_API_KEY=ollama \\
    RATEGUARD_LIVE_MODEL=llama3.2-vision:11b

Cost: these send a handful of ~40-token completions. On a free tier that is
free; on a paid key it is a fraction of a cent.
"""

from __future__ import annotations

import json
import os

import pytest

from rateguard import (
    EvidenceChain,
    KeySigner,
    RateGuard,
    SpendReceiptClaims,
    TokenBudgetOptions,
    issue_spend_receipt_with_signer,
    verify_evidence_package,
)
from rateguard.core.budget_attestation import private_key_from_raw

httpx = pytest.importorskip("httpx")

BASE_URL = os.environ.get("RATEGUARD_LIVE_BASE_URL", "")
API_KEY = os.environ.get("RATEGUARD_LIVE_API_KEY", "")
MODEL = os.environ.get("RATEGUARD_LIVE_MODEL", "")

pytestmark = pytest.mark.skipif(
    not (BASE_URL and API_KEY and MODEL),
    reason="live provider not configured (set RATEGUARD_LIVE_BASE_URL/_API_KEY/_MODEL)",
)

TIMEOUT = 60.0


def _budget_key(provider: str = "nvidia") -> str:
    """The outbound budget key: {tenant}:{provider}:{model}:outbound."""
    return f"global:{provider}:{MODEL}:outbound"


def _client(rg: RateGuard) -> "httpx.Client":
    return rg.wrap_httpx_client(
        httpx.Client(
            base_url=BASE_URL,
            headers={"Authorization": f"Bearer {API_KEY}"},
            timeout=TIMEOUT,
        )
    )


def _chat_body(prompt: str, *, stream: bool = False, max_tokens: int = 24) -> dict:
    body: dict = {
        "model": MODEL,
        "messages": [{"role": "user", "content": prompt}],
        "max_tokens": max_tokens,
        "stream": stream,
    }
    if stream:
        # The DoW hole this SDK exists to close: without include_usage a
        # provider streams no usage at all. Asked for explicitly here so the
        # MEASURED path is what gets tested; the unmeasured path is covered
        # by test_streaming_without_include_usage_still_charges.
        body["stream_options"] = {"include_usage": True}
    return body


def test_live_non_streaming_records_real_usage() -> None:
    """The transport must extract usage from a real provider response."""
    rg = RateGuard(preset="standard")
    with _client(rg) as client:
        resp = client.post("/chat/completions", json=_chat_body("Say OK"))

    assert resp.status_code == 200, resp.text
    payload = resp.json()
    usage = payload["usage"]
    assert usage["total_tokens"] > 0

    # The bytes the caller sees must be the provider's own, unaltered.
    assert payload["choices"][0]["message"]["content"]

    events = rg.enforcement_events()
    assert not events, f"a successful call must not log enforcement: {events}"


def _budget_used(rg: RateGuard, key: str) -> int:
    """What RateGuard actually charged against a budget key, this hour.

    The outbound transport commits usage to the token budget; it does not emit
    RateGuardEvents (those are the inbound middleware's). The budget is
    therefore the honest observation point — and the one that matters, since
    it is what enforcement reads.
    """
    usage = rg.runtime.token_budget.usage(key)
    return int(usage["hour"])


def test_live_streaming_extracts_usage_from_real_sse() -> None:
    """Real SSE framing, real per-chunk usage merging.

    OpenAI-compatible providers send `"usage":null` in intermediate chunks and
    the real numbers in a final chunk. Concatenating chunks or summing fields
    double-counts. This asserts the number RateGuard CHARGED after a real
    stream equals the number the provider actually reported — the merge is the
    thing under test, not the plumbing.
    """
    rg = RateGuard(
        preset="streaming-llm",
        token_budget=TokenBudgetOptions(hour_limit=100_000, mode="hard-stop"),
    )

    chunks = 0
    body_seen: list[str] = []
    provider_total = 0
    with _client(rg) as client:
        with client.stream(
            "POST", "/chat/completions", json=_chat_body("Count to five.", stream=True, max_tokens=48)
        ) as resp:
            assert resp.status_code == 200
            for line in resp.iter_lines():
                if not line:
                    continue
                chunks += 1
                body_seen.append(line)
                if '"usage"' in line and "[DONE]" not in line:
                    data = line[len("data: ") :] if line.startswith("data: ") else line
                    try:
                        parsed = json.loads(data)
                    except ValueError:
                        continue
                    if parsed.get("usage"):
                        provider_total = max(provider_total, parsed["usage"]["total_tokens"])

    assert chunks > 1, "expected a multi-chunk stream"
    # Byte transparency: the terminal sentinel must reach the caller intact.
    assert any("[DONE]" in line for line in body_seen), "provider's [DONE] sentinel was swallowed"
    assert provider_total > 0, "provider reported no usage — include_usage may be unsupported here"

    charged = _budget_used(rg, _budget_key())
    assert charged == provider_total, (
        f"RateGuard charged {charged} tokens after the real stream, "
        f"provider reported {provider_total}"
    )


def test_live_streaming_without_include_usage_still_charges() -> None:
    """The denial-of-wallet hole, against a real provider.

    Without stream_options.include_usage — the DEFAULT for most clients — a
    provider streams no usage at all. RateGuard used to charge zero here,
    meaning a runaway agent streaming on default settings never touched its
    budget. It must now charge the reserved estimate instead: not exact, but
    never free.
    """
    rg = RateGuard(
        preset="streaming-llm",
        token_budget=TokenBudgetOptions(hour_limit=100_000, mode="hard-stop"),
        estimated_tokens_per_request=25,
    )

    saw_usage = False
    with _client(rg) as client:
        body = _chat_body("Count to five.", stream=True, max_tokens=48)
        del body["stream_options"]  # the common default: no usage emitted
        with client.stream("POST", "/chat/completions", json=body) as resp:
            assert resp.status_code == 200
            for line in resp.iter_lines():
                if line and '"usage":{' in line:
                    saw_usage = True

    if saw_usage:
        pytest.skip(
            "this provider emits usage even without include_usage (NVIDIA NIM does), "
            "so the unmeasured-stream path cannot be exercised here — use OpenAI or Ollama"
        )

    charged = _budget_used(rg, _budget_key())
    assert charged > 0, (
        "an unmeasured real stream charged 0 tokens — the budget fails open to "
        "unlimited spend on the most common streaming setup"
    )


def test_live_budget_actually_blocks_a_runaway() -> None:
    """The whole product claim, against a real provider.

    A budget that only blocks mocks is worthless. This burns a real budget
    with real completions and asserts RateGuard stops the next call.
    """
    rg = RateGuard(
        preset="standard",
        token_budget=TokenBudgetOptions(hour_limit=60, mode="hard-stop"),
    )

    blocked = False
    with _client(rg) as client:
        for i in range(8):
            try:
                resp = client.post(
                    "/chat/completions",
                    json=_chat_body(f"Write one short sentence about the number {i}.", max_tokens=32),
                )
            except Exception:
                # Hard-stop may surface as a raised budget error rather than a
                # response, depending on transport config. Either is a block.
                blocked = True
                break
            if resp.status_code == 429:
                blocked = True
                break

    assert blocked, "a 60-token/hour budget never blocked across 8 real completions"

    events = rg.enforcement_events()
    assert events, "a block must leave an audit trail"
    assert any("budget" in e.type for e in events), f"expected a budget event, got {[e.type for e in events]}"


def test_live_freeze_halts_real_calls() -> None:
    """The kill switch, against a real provider."""
    rg = RateGuard(preset="standard")
    with _client(rg) as client:
        ok = client.post("/chat/completions", json=_chat_body("Say OK"))
        assert ok.status_code == 200, "precondition: the call works before the freeze"

        rg.freeze()
        frozen = client.post("/chat/completions", json=_chat_body("Say OK"))
        assert frozen.status_code == 403, f"freeze did not halt a real call: {frozen.status_code}"

        rg.unfreeze()
        thawed = client.post("/chat/completions", json=_chat_body("Say OK"))
        assert thawed.status_code == 200, "unfreeze did not restore real calls"


def test_live_usage_flows_into_a_verifiable_evidence_chain() -> None:
    """End to end: real spend -> signed receipt -> chained -> exported -> verified.

    This is the compliance story with real numbers in it rather than fixtures.
    """
    rg = RateGuard(preset="standard")
    signer = KeySigner(private_key_from_raw(bytes([3]) * 32))
    chain = EvidenceChain()

    total_real_tokens = 0
    with _client(rg) as client:
        for i in range(3):
            resp = client.post(
                "/chat/completions",
                json=_chat_body(f"Say the word {['alpha', 'beta', 'gamma'][i]}."),
            )
            assert resp.status_code == 200, resp.text
            usage = resp.json()["usage"]
            total_real_tokens += usage["total_tokens"]

            receipt = issue_spend_receipt_with_signer(
                signer,
                SpendReceiptClaims(
                    key="live-test:agent-1",
                    provider="nvidia",
                    model=MODEL,
                    window_start_unix=1_700_000_000 + i * 3600,
                    window_end_unix=1_700_000_000 + (i + 1) * 3600,
                    input_tokens=usage["prompt_tokens"],
                    output_tokens=usage["completion_tokens"],
                    total_tokens=usage["total_tokens"],
                    estimated_cost_micro_usd=0,  # free tier: genuinely zero
                ),
            )
            chain.append(receipt)

    pkg = chain.export_evidence()
    verify_evidence_package(signer.public_key(), pkg)

    # The exported total must equal what the provider actually reported.
    assert pkg.total_tokens == total_real_tokens
    assert pkg.entry_count == 3
