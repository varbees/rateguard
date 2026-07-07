"""
MCP (Model Context Protocol) Tools + Loop Detector — Agent-Native Rate Limit Awareness

RateGuard exposes its rate limit state as MCP tools that AI agents can query
BEFORE making LLM calls. This eliminates 429 errors, retry storms, and wasted tokens.

Matching Go SDK implementation: packages/sdk-go/mcp.go + loop_detector.go
All pre-flight tools use peek semantics — querying never consumes budget.
"""

from __future__ import annotations

import hashlib
import json
from dataclasses import dataclass, field
from datetime import datetime, timedelta, timezone
from threading import RLock
from typing import TYPE_CHECKING, Any, Callable

from .bounded_cache import BoundedCache

if TYPE_CHECKING:
    from ..runtime import RateGuardRuntime
    from .guardrail_log import GuardrailLog

_DEFAULT_LOOP_DETECTOR_CAPACITY = 10_000


@dataclass(slots=True)
class _FingerprintEntry:
    depth: int
    halted: bool = False


class LoopDetector:
    """Detects runaway agent loops via SHA-256 payload fingerprinting.

    Matching Go's loop_detector.go — identical algorithm across all 3 SDKs.
    Fingerprint state is LRU-bounded; sequence depths beyond max_depth halt
    execution even for fresh fingerprints.
    """

    def __init__(self, max_depth: int = 50) -> None:
        self._fingerprints: BoundedCache[str, _FingerprintEntry] = BoundedCache(
            _DEFAULT_LOOP_DETECTOR_CAPACITY
        )
        self._lock = RLock()
        self.max_depth = max_depth if max_depth > 0 else 50

    @staticmethod
    def fingerprint(system_prompt: str, user_input: str, tool_definitions: str) -> str:
        """Generate SHA-256 hash of combined prompt context."""
        h = hashlib.sha256()
        h.update(system_prompt.encode())
        h.update(user_input.encode())
        h.update(tool_definitions.encode())
        return h.hexdigest()

    def check(self, fingerprint: str, sequence_depth: int) -> tuple[bool, str]:
        """Evaluate and record a payload fingerprint at the given sequence depth.

        Returns (allowed, reason).
        """
        return self._evaluate(fingerprint, sequence_depth, record=True)

    def peek(self, fingerprint: str, sequence_depth: int) -> tuple[bool, str]:
        """Pre-flight variant: evaluates without recording the fingerprint."""
        return self._evaluate(fingerprint, sequence_depth, record=False)

    def _evaluate(self, fingerprint: str, sequence_depth: int, record: bool) -> tuple[bool, str]:
        with self._lock:
            if sequence_depth > self.max_depth:
                if record:
                    self._fingerprints.set(
                        fingerprint, _FingerprintEntry(depth=sequence_depth, halted=True)
                    )
                return False, (
                    f"max sequence depth exceeded: depth {sequence_depth} "
                    f"> limit {self.max_depth}"
                )

            entry = self._fingerprints.get(fingerprint)
            if entry is None:
                if record:
                    self._fingerprints.set(fingerprint, _FingerprintEntry(depth=sequence_depth))
                return True, ""

            if entry.halted:
                return False, (
                    f"execution halted: payload fingerprint {fingerprint[:12]} "
                    f"was previously blocked for loop behavior at depth {entry.depth}"
                )

            if sequence_depth > entry.depth:
                if record:
                    entry.halted = True
                return False, (
                    f"loop detected: payload fingerprint {fingerprint[:12]} "
                    f"repeated at depth {sequence_depth} (previously seen at depth {entry.depth})"
                )

            if record:
                entry.depth = sequence_depth
            return True, ""

    def loop_check(
        self, system_prompt: str, user_input: str, tool_definitions: str, sequence_depth: int
    ) -> tuple[bool, str]:
        """Fingerprint and check in one call."""
        fp = self.fingerprint(system_prompt, user_input, tool_definitions)
        return self.check(fp, sequence_depth)

    def reset(self) -> None:
        """Clear all fingerprint state."""
        with self._lock:
            self._fingerprints = BoundedCache(_DEFAULT_LOOP_DETECTOR_CAPACITY)

    def stats(self) -> dict[str, Any]:
        """Return current detector state for observability."""
        with self._lock:
            entries = self._fingerprints.values()
            halted = sum(1 for e in entries if e.halted)
            return {
                "enabled": True,
                "max_depth": self.max_depth,
                "total_fingerprints": len(entries),
                "halted": halted,
            }


# ── MCP tools (matching Go's mcp.go: 5 tools) ──


@dataclass(slots=True)
class MCPTool:
    """A tool that AI agents can call via the Model Context Protocol."""

    name: str
    description: str
    input_schema: dict[str, Any]
    handler: Callable[[dict[str, Any]], dict[str, Any]]


@dataclass(slots=True)
class MCPToolResult:
    """Standard MCP tool response: a list of content blocks."""

    content: list[dict[str, str]] = field(default_factory=list)


def create_mcp_tools(runtime: "RateGuardRuntime", loops: LoopDetector | None = None, guardrail_log: "GuardrailLog | None" = None) -> list[MCPTool]:
    """Build the RateGuard MCP tool set bound to a runtime.

    Agents call these tools to query their limits before making API calls.
    All queries use peek semantics — they never consume budget.
    """
    # Defaults to the runtime's OWN loop detector / guardrail log (not a
    # fresh standalone instance) — MCP pre-flight checks must see the same
    # state the actual middleware admission path mutates, or check_loop /
    # list_limits would silently report stale, disconnected state.
    detector = loops if loops is not None else runtime.loop_detector
    guard_log = guardrail_log if guardrail_log is not None else runtime.guardrail_log

    def get_rate_limit_state(args: dict[str, Any]) -> dict[str, Any]:
        key = args.get("key")
        if not isinstance(key, str) or not key:
            raise ValueError("mcp: key is required")
        decision = runtime.rate_limiter.peek(key, runtime.config.rate_limit)
        return {
            "key": key,
            "allowed": decision.allowed,
            "remaining": decision.remaining,
            "limit": decision.limit,
            "retry_after_ms": decision.retry_after_ms,
            "applied": decision.applied,
        }

    def get_token_budget(args: dict[str, Any]) -> dict[str, Any]:
        key = args.get("key")
        if not isinstance(key, str) or not key:
            raise ValueError("mcp: key is required")
        decision = runtime.token_budget.check(key, runtime.config.token_budget)
        if not decision.applied:
            return {"key": key, "allowed": True, "applied": False, "error": "no budget configured for this key"}

        result: dict[str, Any] = {
            "key": key,
            "remaining": decision.remaining,
            "limit": decision.limit,
            "applied": decision.applied,
            "allowed": decision.allowed,
        }
        estimated = args.get("estimated_tokens")
        if isinstance(estimated, (int, float)) and estimated > 0:
            result["estimated_tokens"] = int(estimated)
            result["would_fit"] = decision.remaining >= int(estimated)
        return result

    def get_circuit_breaker_state(args: dict[str, Any]) -> dict[str, Any]:
        state = runtime.circuit_breaker.get_state()
        result: dict[str, Any] = {"state": state, "allowed": state != "open"}
        upstream_id = args.get("upstream_id")
        if isinstance(upstream_id, str) and upstream_id:
            result["upstream_id"] = upstream_id
        return result

    def check_loop(args: dict[str, Any]) -> dict[str, Any]:
        depth = args.get("sequence_depth")
        if not isinstance(depth, (int, float)):
            raise ValueError("mcp: sequence_depth is required")
        depth = int(depth)

        fingerprint = args.get("fingerprint")
        if not isinstance(fingerprint, str) or not fingerprint:
            system_prompt = str(args.get("system_prompt") or "")
            user_input = str(args.get("user_input") or "")
            tool_defs = str(args.get("tool_definitions") or "")
            if not (system_prompt or user_input or tool_defs):
                raise ValueError("mcp: fingerprint or prompt fields are required")
            fingerprint = LoopDetector.fingerprint(system_prompt, user_input, tool_defs)

        # Defaults to False — a "check" tool is a pre-flight query
        # (AGENTS.md rule 5: "Pre-flight queries never consume. Peek,
        # never Allow"), and this tool's own description says exactly
        # that ("Does not record... unless 'record' is true"). A caller
        # that omits the field entirely must get the passive peek
        # behavior its own docs promise, not a silent check that
        # records/mutates state on their behalf.
        record = args.get("record", False)
        if record:
            allowed, reason = detector.check(fingerprint, depth)
        else:
            allowed, reason = detector.peek(fingerprint, depth)

        result: dict[str, Any] = {
            "allowed": allowed,
            "fingerprint": fingerprint,
            "sequence_depth": depth,
        }
        if reason:
            result["reason"] = reason
        return result

    def attest_budget(args: dict[str, Any]) -> dict[str, Any]:
        import base64

        from .budget_attestation import BudgetGrant, attest as attest_fn, new_root_budget_token, parse_budget_token, private_key_from_raw, private_key_to_raw

        signing_key_b64 = args.get("signing_key")
        if not isinstance(signing_key_b64, str) or not signing_key_b64:
            raise ValueError("mcp: signing_key is required")
        signing_key = private_key_from_raw(base64.b64decode(signing_key_b64))

        expires_in_seconds = args.get("expires_in_seconds")
        if not isinstance(expires_in_seconds, (int, float)) or expires_in_seconds <= 0:
            raise ValueError("mcp: expires_in_seconds is required and must be positive")

        providers = args.get("providers")
        models = args.get("models")
        expires_at = datetime.now(timezone.utc) + timedelta(seconds=expires_in_seconds)
        grant = BudgetGrant(
            max_tokens=int(args.get("max_tokens") or 0),
            providers=[p for p in providers if isinstance(p, str)] if isinstance(providers, list) else [],
            models=[m for m in models if isinstance(m, str)] if isinstance(models, list) else [],
            max_depth=int(args.get("max_depth") or 0),
            expires_at=expires_at,
        )

        delegate_public_key_b64 = args.get("delegate_public_key")
        delegate_public_key = base64.b64decode(delegate_public_key_b64) if isinstance(delegate_public_key_b64, str) and delegate_public_key_b64 else None

        parent_token_str = args.get("parent_token")
        try:
            if isinstance(parent_token_str, str) and parent_token_str:
                token, delegate_private_key = attest_fn(parse_budget_token(parent_token_str), signing_key, grant, delegate_public_key)
            else:
                token, delegate_private_key = new_root_budget_token(signing_key, grant, delegate_public_key)
        except ValueError as exc:
            return {"error": str(exc)}

        last_block = token.blocks[-1]
        result: dict[str, Any] = {
            "token": token.marshal(),
            "delegate_public_key": base64.b64encode(last_block.delegate_public_key).decode("ascii"),
            "max_tokens": grant.max_tokens,
            "max_depth": grant.max_depth,
            "expires_at": expires_at.isoformat(),
            "depth": len(token.blocks),
        }
        if delegate_private_key is not None:
            result["delegate_private_key"] = base64.b64encode(private_key_to_raw(delegate_private_key)).decode("ascii")
        return result

    def verify_budget(args: dict[str, Any]) -> dict[str, Any]:
        import base64

        from .budget_attestation import parse_budget_token, verify_chain, verify_presentation

        token_str = args.get("token")
        if not isinstance(token_str, str) or not token_str:
            raise ValueError("mcp: token is required")
        root_public_key_b64 = args.get("root_public_key")
        if not isinstance(root_public_key_b64, str) or not root_public_key_b64:
            raise ValueError("mcp: root_public_key is required")
        root_public_key = base64.b64decode(root_public_key_b64)

        try:
            token = parse_budget_token(token_str)
        except ValueError as exc:
            return {"valid": False, "error": str(exc)}

        context_str = args.get("context")
        signature_b64 = args.get("signature")
        proof_verified = False

        try:
            if isinstance(context_str, str) and context_str and isinstance(signature_b64, str) and signature_b64:
                grant = verify_presentation(token, root_public_key, context_str.encode("utf-8"), base64.b64decode(signature_b64))
                proof_verified = True
            else:
                grant = verify_chain(token, root_public_key)
        except ValueError as exc:
            return {"valid": False, "error": str(exc)}

        return {
            "valid": True,
            "proof_of_possession_verified": proof_verified,
            "depth": len(token.blocks),
            "effective_grant": {
                "max_tokens": grant.max_tokens,
                "providers": grant.providers or [],
                "models": grant.models or [],
                "max_depth": grant.max_depth,
                "expires_at": grant.expires_at.isoformat() if grant.expires_at else None,
            },
        }

    def list_limits(args: dict[str, Any]) -> dict[str, Any]:
        key = args.get("key")
        if not isinstance(key, str) or not key:
            raise ValueError("mcp: key is required")

        # "enabled" reflects whether guardrails are configured at all, not
        # just whether the tracking log exists (it always does) — an
        # instance with no guardrails configured has nothing to violate,
        # which is a different state from "configured and clean." Mirrors
        # Go's mcp.go.
        guardrail_stats = guard_log.stats()
        guardrail_stats["enabled"] = runtime.config.guardrails is not None

        return {
            "key": key,
            "rate_limit": get_rate_limit_state({"key": key}),
            "token_budget": get_token_budget({"key": key}),
            "circuit_breaker": get_circuit_breaker_state({}),
            "preset": {
                "name": runtime.config.preset.name,
                "requests_per_second": runtime.config.rate_limit.requests_per_second,
                "burst": runtime.config.rate_limit.burst,
            },
            "loop_detector": detector.stats(),
            "guardrails": guardrail_stats,
        }

    return [
        MCPTool(
            name="get_rate_limit_state",
            description=(
                "Query current rate limit state for a key BEFORE making API calls. "
                "Returns remaining tokens, limit, reset time, and whether the call "
                "would be allowed. Use this to avoid 429 errors."
            ),
            input_schema={
                "type": "object",
                "properties": {"key": {"type": "string", "description": "Rate limit key (user ID, API key, tenant ID)"}},
                "required": ["key"],
            },
            handler=get_rate_limit_state,
        ),
        MCPTool(
            name="get_token_budget",
            description=(
                "Check remaining LLM token budget before making an expensive call. "
                "Returns remaining tokens, limit, budget mode, and whether the "
                "estimated tokens fit within budget."
            ),
            input_schema={
                "type": "object",
                "properties": {
                    "key": {"type": "string", "description": "Budget key (user ID, tenant)"},
                    "estimated_tokens": {"type": "integer", "description": "How many tokens the agent expects to use"},
                },
                "required": ["key"],
            },
            handler=get_token_budget,
        ),
        MCPTool(
            name="get_circuit_breaker_state",
            description=(
                "Check circuit breaker health for upstream providers before "
                "attempting calls. Returns state (closed/open/half-open) and "
                "whether calls are allowed."
            ),
            input_schema={
                "type": "object",
                "properties": {"upstream_id": {"type": "string", "description": "Upstream provider or service to check (e.g. 'openai', 'anthropic')"}},
                "required": ["upstream_id"],
            },
            handler=get_circuit_breaker_state,
        ),
        MCPTool(
            name="check_loop",
            description=(
                "Pre-flight loop check: report whether an identical payload "
                "fingerprint has already been seen at a lower sequence depth "
                "(a runaway agent loop). Call before repeating a tool call or "
                "LLM request. Does not record the fingerprint unless 'record' is true."
            ),
            input_schema={
                "type": "object",
                "properties": {
                    "fingerprint": {"type": "string", "description": "SHA-256 payload fingerprint. Alternatively pass system_prompt/user_input/tool_definitions."},
                    "system_prompt": {"type": "string", "description": "System prompt to fingerprint (used when 'fingerprint' is absent)"},
                    "user_input": {"type": "string", "description": "User input to fingerprint (used when 'fingerprint' is absent)"},
                    "tool_definitions": {"type": "string", "description": "Serialized tool definitions to fingerprint (used when 'fingerprint' is absent)"},
                    "sequence_depth": {"type": "integer", "description": "Current agent sequence depth (how many chained steps deep this call is)"},
                    "record": {"type": "boolean", "description": "When true, record this fingerprint+depth so future checks can detect repeats. Defaults to false — a bare check never mutates state."},
                },
                "required": ["sequence_depth"],
            },
            handler=check_loop,
        ),
        MCPTool(
            name="list_limits",
            description=(
                "Full snapshot of all rate limits, token budgets, and circuit "
                "breaker states for a key. Convenience tool for agent initialization."
            ),
            input_schema={
                "type": "object",
                "properties": {"key": {"type": "string", "description": "Rate limit key to query"}},
                "required": ["key"],
            },
            handler=list_limits,
        ),
        MCPTool(
            name="attest_budget",
            description=(
                "Mint or delegate a cryptographic budget token an agent can hand to a sub-agent it invokes. "
                "Omit parent_token to mint a new root token (signing_key becomes the trust anchor verifiers "
                "must already know). Pass parent_token to delegate further — the new grant must narrow the "
                "parent's (less budget, fewer providers/models, less delegation depth, an earlier expiry); "
                "signing_key must be the private key matching parent_token's current holder."
            ),
            input_schema={
                "type": "object",
                "properties": {
                    "signing_key": {
                        "type": "string",
                        "description": "Base64 Ed25519 private key: the root authority key when minting (parent_token absent), or the current holder's key when delegating (parent_token present)",
                    },
                    "parent_token": {
                        "type": "string",
                        "description": "Existing serialized budget token to delegate from. Omit to mint a new root token.",
                    },
                    "delegate_public_key": {
                        "type": "string",
                        "description": "Base64 Ed25519 public key of the recipient, if it already generated its own keypair (recommended — its private key never transits through this call). Omit to have RateGuard generate a fresh keypair and return the private key.",
                    },
                    "max_tokens": {
                        "type": "integer",
                        "description": "Token budget for this grant. <= 0 means unlimited, but only if the parent grant is also unlimited.",
                    },
                    "providers": {
                        "type": "array",
                        "items": {"type": "string"},
                        "description": "Restrict to these LLM providers. Omit for 'any provider', but only if the parent grant also allows any.",
                    },
                    "models": {
                        "type": "array",
                        "items": {"type": "string"},
                        "description": "Restrict to these models, same rule as providers.",
                    },
                    "max_depth": {
                        "type": "integer",
                        "description": "How many further delegations this grant allows (0 = recipient may use it but not delegate further).",
                    },
                    "expires_in_seconds": {
                        "type": "integer",
                        "description": "Grant lifetime from now, in seconds. Required — budget tokens must expire.",
                    },
                },
                "required": ["signing_key", "max_depth", "expires_in_seconds"],
            },
            handler=attest_budget,
        ),
        MCPTool(
            name="verify_budget",
            description=(
                "Verify a budget token before honoring it. Always checks the signature chain, that every "
                "delegation narrowed its parent, and that nothing has expired. Pass context+signature for a "
                "full authorization check (proof that the presenter actually holds the token, not just read "
                "it) — without them this only confirms the token's terms are well-formed, not who is presenting it."
            ),
            input_schema={
                "type": "object",
                "properties": {
                    "token": {"type": "string", "description": "Serialized budget token to verify"},
                    "root_public_key": {
                        "type": "string",
                        "description": "Base64 Ed25519 public key of the trusted root authority (known out-of-band, like a CA root certificate)",
                    },
                    "context": {
                        "type": "string",
                        "description": "Challenge/context the presenter should have signed with their holder key, for proof-of-possession",
                    },
                    "signature": {
                        "type": "string",
                        "description": "Base64 signature over 'context', produced by the token holder's private key (rateguard sign()) — proves the presenter, not just a token they saw, holds the delegation",
                    },
                },
                "required": ["token", "root_public_key"],
            },
            handler=verify_budget,
        ),
    ]


def mcp_call(tools: list[MCPTool], tool_name: str, args: dict[str, Any] | None = None) -> MCPToolResult:
    """Execute an MCP tool by name and wrap the result as MCP content."""
    for tool in tools:
        if tool.name == tool_name:
            result = tool.handler(args or {})
            return MCPToolResult(content=[{"type": "text", "text": json.dumps(result)}])
    available = ", ".join(tool.name for tool in tools)
    raise ValueError(f"mcp: unknown tool {tool_name!r} — available: {available}")
