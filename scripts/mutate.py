#!/usr/bin/env python3
"""Mutation testing for the money paths — one engine, three SDKs, one score.

    python3 scripts/mutate.py              # every SDK, print the score
    python3 scripts/mutate.py --sdk go     # one SDK
    python3 scripts/mutate.py --list       # what would be mutated, and why
    python3 scripts/mutate.py --json       # machine-readable, for CI

── Why this exists ──

Line coverage measures whether code RAN. It cannot measure whether a test would
NOTICE the code being wrong. Those are different questions, and only the second
one matters:

    coverage:      "did this line execute?"     — vanity
    mutation score: "would you catch it if it lied?" — the real number

This repo has the receipts. Over one session, ~800 green tests failed to notice
that Python and Node metered ZERO tokens for the most common streaming shape in
the ecosystem; that the outbound transport under-reserved long-context calls
25x; and that three separate tests asserted on fields and conditions that could
never fail. Every one was found by hand-mutating the source and asking "does
anything scream?" — three for three. That is mutation testing performed by a
human. This automates the loop.

── Why not Stryker / mutmut / gremlins ──

They are good and they are three different tools with three configs, three
report formats, and no shared score. This codebase's whole thesis is that three
SDKs behave identically, so a testing framework that cannot answer "are all
three equally well tested?" is answering the wrong question.

Generic mutation tools also mutate EVERYTHING and drown you in equivalent
mutants. Standard SDET practice is to scope mutation testing to critical
modules — auth, billing. Here the critical module IS billing.

── The catalogue is the interesting part ──

These are not random operators. Each mutation reproduces a defect this codebase
ACTUALLY SHIPPED or deliberately decided against. A mutation suite seeded with
your own bug history is worth more than a generic one, because it asks the only
question that matters: if we regressed to the bug we already had, would anyone
notice?

A SURVIVING mutant means: we could ship that bug again, today, and every test
would stay green.
"""

from __future__ import annotations

import argparse
import json
import subprocess
import sys
import time
from dataclasses import dataclass, field
from pathlib import Path

REPO = Path(__file__).resolve().parent.parent


@dataclass(frozen=True)
class Mutation:
    """One defect, injected on purpose."""

    id: str
    sdk: str
    path: str          # relative to REPO
    find: str
    replace: str
    models: str        # the real bug this reproduces — the whole point
    expect: str = ""   # which test SHOULD scream (documentation, not enforced)


@dataclass
class Result:
    mutation: Mutation
    killed: bool
    seconds: float
    detail: str = ""
    output: str = field(default="", repr=False)


# ── Test commands, per SDK ──
#
# Deliberately the FAST suites. Mutation testing runs these once per mutant, so
# a slow command turns a 3-minute audit into an hour and nobody runs it again.
SUITES: dict[str, list[str]] = {
    "go": ["go", "test", "./..."],
    "node": ["bunx", "vitest", "run", "--silent"],
    "python": [sys.executable, "-m", "pytest", "-q", "-x", "--ignore=tests/live", "-p", "no:cacheprovider"],
}

SDK_DIRS: dict[str, Path] = {
    "go": REPO / "packages" / "sdk-go",
    "node": REPO / "packages" / "sdk-node",
    "python": REPO / "packages" / "sdk-python",
}

# Node compiles to dist/; the suite imports src/ directly, so no rebuild needed.
SDK_ENV: dict[str, dict[str, str]] = {"node": {"CI": "true"}}


CATALOGUE: list[Mutation] = [
    # ── The Groq bug: usage merged with MAX, not SUM ──
    #
    # Groq emits the SAME usage three times per call (top-level `usage`, a
    # nested `x_groq.usage`, then top-level again). Summing bills 150 tokens
    # for a 50-token call. Anthropic splits input/output across events and
    # repeats fields — summing double-counts there too. MAX is load-bearing.
    Mutation(
        id="go/usage-merge-max-to-sum",
        sdk="go",
        path="packages/sdk-go/sse_usage.go",
        find="\t\tif usage.TotalTokens > merged.TotalTokens {\n\t\t\tmerged.TotalTokens = usage.TotalTokens\n\t\t}",
        replace="\t\tmerged.TotalTokens += usage.TotalTokens",
        models="Groq's triple-usage: MAX degraded to SUM → 150 tokens billed for a 50-token call",
        expect="TestConformanceSSEUsage (groq_live_capture_triple_usage)",
    ),
    # ── The 4096 bug: reservations measured, not assumed ──
    #
    # A constant chosen before any request existed under-reserved long-context
    # calls ~25x. Overshoot is bounded by limit * (actual/estimate), so the
    # workload most able to burn a budget was the least protected.
    Mutation(
        id="go/estimate-ignores-prompt",
        sdk="go",
        path="packages/sdk-go/request_estimate.go",
        find="return input + output",
        replace="return output",
        models="the flat-4096 hole: reservation stops counting the prompt → 25x under-reserve",
        expect="TestEstimateRequestTokensLongContext",
    ),
    Mutation(
        id="go/estimate-ignores-declared-ceiling",
        sdk="go",
        path="packages/sdk-go/request_estimate.go",
        find="case payload.MaxCompletionTokens != nil && *payload.MaxCompletionTokens > 0:",
        replace="case false:",
        models="output ceiling ignored → max_completion_tokens silently unused",
        expect="TestEstimateRequestTokensPrefersCompletionCeiling",
    ),
    # ── Budget boundary: >= vs > is one token of overspend, forever ──
    Mutation(
        id="go/budget-boundary-off-by-one",
        sdk="go",
        path="packages/sdk-go/token_budget.go",
        find="if usedHour >= limits.Hour {",
        replace="if usedHour > limits.Hour {",
        models="off-by-one at the hourly cap: spend one token past every budget",
        expect="token budget suite",
    ),
    # ── Reservations must count against the limit ──
    #
    # If in-flight reservations stop counting, concurrent callers all read the
    # same stale remainder and collectively blow the budget.
    Mutation(
        id="go/reservations-not-counted",
        sdk="go",
        path="packages/sdk-go/token_budget.go",
        find="records := activeTokenBudgetRecords(state.records, state.reservations, now, limits.maxWindow())",
        replace="records := activeTokenBudgetRecords(state.records, nil, now, limits.maxWindow())",
        models="in-flight reservations invisible → concurrent overshoot",
        expect="TestBudgetNeverOvershootsWithFullReservation",
    ),
    # ── Rule 5: pre-flight queries never consume ──
    #
    # If asking "can I afford this?" spends, the careful agent burns fastest.
    Mutation(
        id="go/rule5-checkloop-records-by-default",
        sdk="go",
        path="packages/sdk-go/mcp.go",
        find="\trecord := false\n\tif v, ok := args[\"record\"].(bool); ok {",
        replace="\trecord := true\n\tif v, ok := args[\"record\"].(bool); ok {",
        models="rule 5 violation: a passive check mutates state → self-inflicted loop reports",
        expect="TestRule5_CheckLoopDoesNotRecordByDefault",
    ),
    # ── Unmeasurable usage must charge the estimate, never zero ──
    #
    # A stream without include_usage reports nothing. Charging zero lets a
    # runaway agent stream forever for free — the denial-of-wallet path.
    Mutation(
        id="go/unmeasurable-usage-charges-zero",
        sdk="go",
        path="packages/sdk-go/outbound.go",
        find="\tcase reservedEstimate > 0:\n\t\ts.tokens.commitReservation(budgetKey, reservationID, reservedEstimate)",
        replace="\tcase false:\n\t\ts.tokens.commitReservation(budgetKey, reservationID, reservedEstimate)",
        models="the DoW hole (b7f0fb6): provider reports no usage → charge 0 → a runaway streams free",
        expect="outbound streaming-without-usage suite",
    ),
    # ── The kill switch ──
    #
    # Freeze is the operator's stop button — the thing you reach for at 3am
    # while the bill climbs. A freeze that does not halt is worse than no
    # freeze: you believe you stopped it.
    Mutation(
        id="go/freeze-does-not-halt",
        sdk="go",
        path="packages/sdk-go/freeze.go",
        find="\treturn f.global || (customer != \"\" && f.customers[customer])",
        replace="\treturn false",
        models="the stop button does nothing — operator believes the bleeding stopped",
        expect="freeze suite / TestLiveFreezeHaltsRealCalls",
    ),
    Mutation(
        id="go/freeze-ignores-per-customer-scope",
        sdk="go",
        path="packages/sdk-go/freeze.go",
        find="\treturn f.global || (customer != \"\" && f.customers[customer])",
        replace="\treturn f.global",
        models="Freeze(\"customer\") silently no-ops — only global freeze works",
        expect="per-customer freeze suite",
    ),
    # ── The circuit breaker ──
    #
    # A breaker that never opens hammers a provider that is already failing,
    # burning budget on calls that cannot succeed.
    Mutation(
        id="go/breaker-never-opens",
        sdk="go",
        path="packages/sdk-go/circuit_breaker.go",
        find="\t\tif b.total >= b.minSamplesToTrip && b.errorRateLocked() > b.errorRateThreshold {",
        replace="\t\tif false {",
        models="breaker never trips → keep paying for calls to a dead provider",
        expect="circuit breaker suite",
    ),
    # ── Rule 5 parity: Node and Python must peek by default too ──
    #
    # Go had this mutation from the start; Node and Python did not — the same
    # reference-SDK bias the catalogue was built to eliminate.
    Mutation(
        id="python/rule5-checkloop-records-by-default",
        sdk="python",
        path="packages/sdk-python/rateguard/core/mcp.py",
        find='        record = args.get("record", False)',
        replace='        record = args.get("record", True)',
        models="rule 5 violation: a passive check mutates state → agent halts over its own diligence",
        expect="rule 5 / check_loop peek suite",
    ),
    # ── CJK: a token is not four bytes ──
    Mutation(
        id="go/tokenizer-cjk-undercount",
        sdk="go",
        path="packages/sdk-go/tokenizer.go",
        find="return cjk + (other+3)/4",
        replace="return (cjk + other + 3) / 4",
        models="pre-CJK chars/4 estimate → 4x under-count on CJK prompts",
        expect="TestConformanceTokenEstimate / tokenizer vectors",
    ),
    # ── SSE detection: the bug that started all of this ──
    Mutation(
        id="node/sse-detection-requires-newline",
        sdk="node",
        path="packages/sdk-node/src/core/utils.ts",
        find="  return text.split(/\\r?\\n/).some((line) => line.trim().startsWith('data:'));",
        replace="  return text.includes('\\n') && text.includes('data:');",
        models="e6eba43 exactly: single-event streams metered ZERO tokens",
        expect="conformance sse_usage_vectors (openai_compatible_single_usage_final_chunk)",
    ),
    Mutation(
        id="python/sse-detection-requires-newline",
        sdk="python",
        path="packages/sdk-python/rateguard/core/utils.py",
        find='    return any(line.strip().startswith("data:") for line in text.splitlines())',
        replace='    return "data:" in text and "\\n" in text',
        models="e6eba43 exactly: single-event streams metered ZERO tokens",
        expect="test_conformance sse vectors",
    ),
    # ── Estimation parity: Node/Python must measure the request too ──
    Mutation(
        id="node/estimate-ignores-prompt",
        sdk="node",
        path="packages/sdk-node/src/core/request-estimate.ts",
        find="  return input + output;",
        replace="  return output;",
        models="the flat-4096 hole, Node side",
        expect="request-estimate.test.ts long-context case",
    ),
    Mutation(
        id="python/estimate-ignores-prompt",
        sdk="python",
        path="packages/sdk-python/rateguard/core/request_estimate.py",
        find="    return input_tokens + output_tokens",
        replace="    return output_tokens",
        models="the flat-4096 hole, Python side",
        expect="test_request_estimate long-context case",
    ),
    # ── Unknown bodies must be bounded by size, not waved through ──
    Mutation(
        id="python/unknown-body-reserves-nothing",
        sdk="python",
        path="packages/sdk-python/rateguard/core/request_estimate.py",
        find="    return estimate_with(tokenizer, text) + DEFAULT_OUTPUT_ALLOWANCE",
        replace="    return DEFAULT_OUTPUT_ALLOWANCE",
        models="unparseable body ignores its own size → large unknown prompts under-reserved",
        expect="test_unknown_schema_is_bounded_by_size",
    ),
    # ── Reservation accounting, Node and Python ──
    #
    # These mirror go/reservations-not-counted deliberately. The catalogue had
    # 8 Go mutations to Node's 3 and Python's 4 — meaning the REFERENCE SDK was
    # the best-defended one, while Node and Python (the two that silently
    # metered zero for months) were the least. That is the exact bias that let
    # the SSE bug through: we scrutinise the SDK we trust. Parity in the
    # catalogue is the point of a cross-language product.
    Mutation(
        id="node/reservations-not-counted",
        sdk="node",
        path="packages/sdk-node/src/core/token-budget.ts",
        find="    const records = activeRecords(state.records, state.reservations, now, maxWindow);",
        replace="    const records = activeRecords(state.records, new Map(), now, maxWindow);",
        models="in-flight reservations invisible → concurrent callers read a stale remainder and overshoot",
        expect="token-budget concurrency/reservation suite",
    ),
    Mutation(
        id="python/reservations-not-counted",
        sdk="python",
        path="packages/sdk-python/rateguard/core/token_budget.py",
        find="        if not state.reservations:\n            return state.records",
        replace="        if True:\n            return state.records",
        models="in-flight reservations invisible → concurrent callers read a stale remainder and overshoot",
        expect="token budget reservation suite",
    ),
    # ── CJK parity ──
    Mutation(
        id="node/tokenizer-cjk-undercount",
        sdk="node",
        path="packages/sdk-node/src/core/tokenizer.ts",
        find="  return cjk + Math.floor((other + 3) / 4);",
        replace="  return Math.floor((cjk + other + 3) / 4);",
        models="chars/4 on CJK → 4x under-count",
        expect="conformance token_estimate_vectors",
    ),
    Mutation(
        id="python/tokenizer-cjk-undercount",
        sdk="python",
        path="packages/sdk-python/rateguard/core/tokenizer.py",
        find="    return cjk + (other + 3) // 4",
        replace="    return (cjk + other + 3) // 4",
        models="chars/4 on CJK → 4x under-count",
        expect="test_conformance token estimate vectors",
    ),
]


def run(cmd: list[str], cwd: Path, env_extra: dict[str, str] | None = None, timeout: int = 300) -> tuple[int, str]:
    import os

    env = os.environ.copy()
    env.update(env_extra or {})
    try:
        p = subprocess.run(cmd, cwd=cwd, capture_output=True, text=True, timeout=timeout, env=env)
        return p.returncode, (p.stdout + p.stderr)
    except subprocess.TimeoutExpired:
        return 124, "TIMEOUT"


def apply_mutation(m: Mutation) -> str:
    """Apply the mutation. Returns the original text for restoration."""
    path = REPO / m.path
    original = path.read_text()
    if m.find not in original:
        raise LookupError(
            f"{m.id}: the code it mutates no longer exists in {m.path}.\n"
            f"  looking for: {m.find[:90]!r}\n"
            f"  A stale mutation is worse than none — it silently stops testing "
            f"anything. Fix or delete it."
        )
    if original.count(m.find) != 1:
        raise LookupError(
            f"{m.id}: pattern matches {original.count(m.find)} times in {m.path}; "
            f"it must match exactly once or the mutation is ambiguous."
        )
    path.write_text(original.replace(m.find, m.replace, 1))
    return original


def evaluate(m: Mutation, verbose: bool) -> Result:
    """Inject one defect, run the suite, see whether anything screams."""
    path = REPO / m.path
    started = time.monotonic()
    original = apply_mutation(m)
    try:
        code, output = run(SUITES[m.sdk], SDK_DIRS[m.sdk], SDK_ENV.get(m.sdk))
        killed = code != 0
        detail = ""
        if killed:
            # Name the first test that noticed — proves WHICH assertion earned it.
            for line in output.splitlines():
                s = line.strip()
                if s.startswith("--- FAIL:") or s.startswith("FAILED ") or "×" in s[:4]:
                    detail = s[:110]
                    break
        return Result(m, killed, time.monotonic() - started, detail, output if verbose else "")
    finally:
        # ALWAYS restore. A crashed run must never leave mutated source behind.
        path.write_text(original)


def verify_clean(where: str) -> None:
    code, out = run(["git", "status", "--porcelain"], REPO)
    dirty = [l for l in out.splitlines() if l.strip()]
    if dirty:
        print(f"\n  ⚠ working tree not clean {where}:", file=sys.stderr)
        for l in dirty[:5]:
            print(f"      {l}", file=sys.stderr)
        if where == "before starting":
            print("  Mutation testing rewrites source files. Commit or stash first.", file=sys.stderr)
            sys.exit(2)
        print("  A mutation may not have been restored — CHECK BEFORE COMMITTING.", file=sys.stderr)
        sys.exit(3)


def main() -> int:
    ap = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    ap.add_argument("--sdk", choices=["go", "node", "python"], help="only this SDK")
    ap.add_argument("--list", action="store_true", help="print the catalogue and exit")
    ap.add_argument("--json", action="store_true", help="machine-readable output")
    ap.add_argument("--verbose", action="store_true", help="keep suite output for survivors")
    ap.add_argument("--min-score", type=float, default=100.0, help="fail below this score (default 100)")
    args = ap.parse_args()

    selected = [m for m in CATALOGUE if not args.sdk or m.sdk == args.sdk]

    if args.list:
        for m in selected:
            print(f"{m.id}\n    models: {m.models}\n    expect: {m.expect or '—'}\n")
        return 0

    verify_clean("before starting")

    if not args.json:
        print(f"Injecting {len(selected)} known defects into the money paths.")
        print("A SURVIVOR means we could ship that bug again today and stay green.\n")

    results: list[Result] = []
    for m in selected:
        if not args.json:
            print(f"  {m.id:46}", end="", flush=True)
        try:
            r = evaluate(m, args.verbose)
        except LookupError as e:
            print(f"\n  ✗ STALE: {e}", file=sys.stderr)
            return 4
        results.append(r)
        if not args.json:
            mark = "killed " if r.killed else "SURVIVED"
            print(f" {mark} {r.seconds:5.1f}s  {r.detail}")

    verify_clean("after finishing")

    killed = sum(1 for r in results if r.killed)
    score = 100.0 * killed / len(results) if results else 0.0

    if args.json:
        print(json.dumps({
            "score": round(score, 1),
            "killed": killed,
            "total": len(results),
            "survivors": [
                {"id": r.mutation.id, "sdk": r.mutation.sdk, "models": r.mutation.models}
                for r in results if not r.killed
            ],
        }, indent=2))
    else:
        print(f"\n  mutation score: {score:.0f}%  ({killed}/{len(results)} defects detected)")
        by_sdk: dict[str, list[Result]] = {}
        for r in results:
            by_sdk.setdefault(r.mutation.sdk, []).append(r)
        for sdk, rs in sorted(by_sdk.items()):
            k = sum(1 for r in rs if r.killed)
            print(f"    {sdk:7} {100.0*k/len(rs):3.0f}%  ({k}/{len(rs)})")

        # A score is only comparable across SDKs if the catalogues are.
        # 100% over 4 mutations is not the same claim as 100% over 11, and
        # printing them in one column implies it is. Worse, the asymmetry has a
        # direction: the reference SDK accumulates mutations because it is the
        # one we read, while the ports — which is where the SSE bug actually
        # lived — accumulate fewer. Say it out loud rather than let the table
        # flatter us.
        if not args.sdk and len(by_sdk) > 1:
            sizes = {sdk: len(rs) for sdk, rs in by_sdk.items()}
            most, fewest = max(sizes.values()), min(sizes.values())
            if most >= fewest * 2:
                lagging = sorted(s for s, n in sizes.items() if n == fewest)
                leading = sorted(s for s, n in sizes.items() if n == most)
                print(
                    f"\n  ⚠ catalogue is asymmetric: {', '.join(leading)}={most} vs "
                    f"{', '.join(lagging)}={fewest}."
                )
                print(
                    f"    {', '.join(lagging)} scoring 100% over {fewest} mutations is a weaker "
                    f"claim than {', '.join(leading)} over {most} — these numbers are not "
                    f"comparable.\n    Untested ports are exactly where the SSE bug lived."
                )

        survivors = [r for r in results if not r.killed]
        if survivors:
            print(f"\n  {len(survivors)} SURVIVED — these bugs could ship today:\n")
            for r in survivors:
                print(f"    {r.mutation.id}")
                print(f"      models:  {r.mutation.models}")
                print(f"      should have been caught by: {r.mutation.expect or '(nothing named)'}")
                print()

    return 0 if score >= args.min_score else 1


if __name__ == "__main__":
    sys.exit(main())
