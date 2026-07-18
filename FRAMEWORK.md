# How we prove three SDKs are one product

RateGuard ships in Go, Node, and Python. "Ships in three languages" usually means
three codebases that drift, three test suites that pass for different reasons, and
a README that hopes they behave the same. This document is the opposite claim: a
repeatable, measurable framework that holds the three to *identical behaviour* —
and every part of it runs on any repo, not just this one.

It exists because we learned the hard way that a green test suite proves almost
nothing. Two of these three SDKs once silently metered **zero tokens** for the most
common streaming shape in the ecosystem, while ~800 tests passed. The framework
below is what we built so that can't happen quietly again.

## The four questions, and the tool that answers each

A test count answers none of the questions that matter. These four do.

### 1. What is this system? — `graphify`

Before you can trust a codebase you have to see it. We map the whole repo into a
knowledge graph — every function, every call, clustered into subsystems, with the
cross-cutting concepts (the money path, the parity machinery) surfaced as
hyperedges. It's how you find that a test helper is one of your most-connected
nodes, or that two "unrelated" modules share a hidden dependency.

```
/graphify .        # → an interactive graph + an audit report
```

Output is a navigable map, not a wall of text. Language-agnostic; runs on any repo.

### 2. Do the language surfaces actually match? — `scripts/parity_guard.py`

Agent rule 3: a feature landing in Go lands in Node and Python. For months that was
enforced by a human remembering it — which is not a mechanism. The parity guard
extracts each SDK's public surface (Go via `go doc`, Node via the TypeScript
checker, Python via `__all__`), normalizes the naming conventions away, and asserts
every capability resolves in all three. It found real gaps on its first run.

```
python3 scripts/parity_guard.py     # 88 capabilities, must resolve in all 3
```

Names only — behaviour is question 3.

### 3. Do the three behave identically? — `conformance/*.json`

Matching function names prove nothing about matching *output*. So the hard
behaviour — token-bucket admission, usage extraction, Ed25519 signing, evidence
chains — is pinned by shared oracle vectors: one JSON file of
`(input → expected output)` sequences that all three SDKs replay against their own
implementation. If Go and Python disagree about what a byte sequence means, a vector
fails. The SSE-usage vectors carry **real captured bytes** from NVIDIA NIM, Groq,
and DeepSeek — including Groq's habit of reporting the same usage three times per
call, which a naive summing extractor would bill 3×.

Eight vector files today. This is the layer that turns "same API" into "same
product."

### 4. Are the tests real, or theatre? — `scripts/mutate.py`

This is the one nobody else ships, and it's the most important. Coverage measures
whether a line *ran*. It cannot measure whether a test would *notice the line being
wrong* — and those are different questions. We inject a defect into a money path,
run the suite, and check whether anything fails. The number that comes out is the
**mutation score**, and unlike coverage it cannot be gamed by asserting nothing.

```
python3 scripts/mutate.py     # 100% (31/31), ~50s, all three SDKs
```

Every mutation in the catalogue reproduces a bug this codebase *actually shipped* or
deliberately rejected: MAX→SUM (the Groq triple-usage overbill), measured→constant
(a 25× budget under-reservation), estimate→zero (the denial-of-wallet hole),
negative-usage-not-clamped (an attacker-controlled budget refund), peek→record (a
pre-flight query that mutates state). A catalogue seeded with your own bug history
asks the only question worth asking: *if we regressed to the bug we already had,
would anyone notice?* A survivor means we could ship it again today and stay green.

The engine reports its own weakness, too: if the catalogue is lopsided across SDKs
(more mutations for the one we read most), it says so — because a benchmark that
scrutinises the reference implementation harder than the ports is measuring our
attention, not our tests. That asymmetry is exactly what let the original bug
through, and closing it found two more real gaps in the ports.

## And one more: does it survive reality? — `scripts/live-matrix.sh`

Everything above proves the SDKs are *self-consistent*. It cannot prove they are
*true* — every test inherits the same assumptions about what providers send. So the
same suite also runs against real provider APIs (NVIDIA NIM, Groq, DeepSeek). This
is what caught the zero-token bug that ~800 self-consistent tests missed. A skipped
provider is reported as a skip, never a pass; the grid exits non-zero if everything
skips.

## Why this is the honest way to earn trust in an SDK

Most SDKs ask you to trust them because they have a lot of tests and a nice README.
This framework replaces "trust us" with numbers you can reproduce:

| Question | Answer today | Reproduce |
|---|---|---|
| What is it | 4,458-node graph | `/graphify .` |
| Surfaces match | 88 capabilities | `parity_guard.py` |
| Behaviour matches | 8 conformance vectors | `go test` / `vitest` / `pytest` |
| Tests are real | **100% mutation score (31/31)** | `mutate.py` |
| Survives providers | NIM · Groq · DeepSeek | `live-matrix.sh` |

None of this is RateGuard-specific. Point the four legs at any multi-language SDK —
generated or hand-written — and they answer the same questions. We built it to keep
one product honest across three languages; it happens to be a general method for
proving any SDK is what it claims to be.
