# Changelog

Notable changes to the RateGuard SDKs. All three (Go, Node, Python) share a version.

Format follows [Keep a Changelog](https://keepachangelog.com/en/1.1.0/);
versioning is [SemVer](https://semver.org/spec/v2.0.0.html). Pre-1.0, minor
versions may carry behaviour changes — they are called out explicitly below.

---

## [0.5.1] — unreleased

**Security patch. Publish this over 0.5.0 — do not use 0.5.0.** 0.5.0 was tagged
and published to npm and PyPI from a commit that predated two security fixes
below; Go never received 0.5.0 at all (the submodule tag was not pushed, so the
proxy stayed on 0.3.0). 0.5.1 is cut from a commit that contains everything and
tags all three registries together.

### Fixed — security

- **Negative provider usage refunded the budget (all three SDKs).** A hostile or
  buggy provider reporting `output_tokens: -1000000` had that negative committed
  against the budget, DECREASING recorded usage — an attacker-controlled refund
  that let a runaway agent spend past its cap. Token counts are now clamped to
  non-negative (garbage → "no usage" → the caller commits its reserved
  estimate). Go additionally guards an int64 overflow that wrapped a huge value
  to a negative. Pinned by adversarial suites and mutation tests in all three.
- **Two Go dependency vulnerabilities patched.** `golang.org/x/net` v0.47.0 →
  v0.53.0 (GO-2026-4918) and `go.opentelemetry.io/otel/sdk` v1.39.0 → v1.44.0
  (GO-2026-4394); the toolchain pin moves to 1.25.x to pick up seven stdlib
  fixes. govulncheck now runs in CI.

### Added

- **Every release is Sigstore-signed** — npm provenance, PyPI attestations, and
  a cosign-signed CycloneDX SBOM on the GitHub Release, all keyless (Fulcio +
  Rekor). See [SIGNING.md](SIGNING.md).
- Supply-chain scanning in CI (govulncheck / bun audit --prod / pip-audit),
  scoped to fail on shipped deps and report on dev tooling.
- Adversarial input suites (hostile usage values, malformed SSE, null bytes) and
  a named byte-transparency test covering large chunked streams.
- Mutation catalogue extended to 33 (freeze, circuit breaker, realtime cost cap,
  Redis fail-open, negative-usage clamp); 100% killed, balanced across SDKs.
- [FRAMEWORK.md](FRAMEWORK.md) — how three SDKs are held to one behaviour.

---

## [0.5.0] — 2026-07-17 *(published stale; superseded by 0.5.1)*

**The honesty release.** Two silently-wrong metering paths, a denial-of-wallet
hole in the flagship feature, a false headline claim, and docs that
misconfigured the thing the product exists to configure. Every one of these was
found by checking whether what had already shipped was actually true; none were
found by ~790 passing tests.

### Fixed — metering was silently wrong

- **Streaming usage reported ZERO for the most common shape in the ecosystem.**
  Python and Node gated SSE detection on the body containing a newline, so an
  OpenAI-compatible stream carrying usage only on the final chunk fell through
  to a JSON parser with the `data: ` prefix still attached. It failed silently:
  **budgets never decremented** for those calls. Go was correct, so this was
  also a parity break. Every per-language suite passed throughout — only real
  provider bytes caught it.

- **Budget reservations under-reserved long-context calls by ~25x.** The
  outbound transport reserved a flat 4096 tokens for every call, chosen at
  construction, before any request existed. Overshoot is bounded by
  `limit × (actual ÷ estimate)`, so a 100K-token RAG call could exceed its
  budget by roughly that factor — **the workload most able to burn a budget was
  the one least protected by it.** Reservations are now **measured** from the
  request: prompt tokens plus the output ceiling the request declares
  (`max_tokens` / `max_completion_tokens` / `maxOutputTokens`). An unrecognized
  body is bounded by its own size rather than reserve-all, which would have
  throttled whole applications on upgrade.

  > **Behaviour change.** If you relied on the flat 4096 reservation, set
  > `EstimatedTokens` / `estimatedTokens` / `estimated_tokens` explicitly to a
  > fixed value. Negative still means strict reserve-all (never overshoots, one
  > in-flight call per budget key).

### Fixed — parity

- `EstimateWith` (Go) — exported. Node and Python already exposed it.
- `EstimateRequestTokens`, `DefaultOutputAllowance`, `MaxEstimateBodyBytes` (Go) — exported for parity.
- Both were found by the new parity guard on its first run.

### Fixed — docs that did not work

- **The Node and Python config samples were wrong.** They showed flat options
  that do not exist: `tokenBudgetPerHour: 250_000`, `token_budget_per_hour=250_000`.
  Python raised `TypeError`; **Node silently ignored the unknown property and
  returned the preset's 10,000** — you asked for 250,000 tokens/hour and got 25x
  less, with no error anywhere. The presets page was worse: `requestsPerSecond: 300`
  annotated *"override preset RPS"* overrode nothing. Go's samples were correct
  throughout. The real option is nested (`tokenBudget` / `token_budget`).

### Performance

- **Spans are no longer recorded when nothing exports them.** With no OTLP
  endpoint configured — the default — the SDK still built a real
  `TracerProvider` with `AlwaysSample` and a `SimpleSpanProcessor` wrapping a
  **noop exporter**: every request allocated a recording span, computed its
  attribute set, deduped it, and handed it to an exporter that dropped it.
  Every user paid full OpenTelemetry cost for spans nobody could read.
- **Prompt tokens are counted incrementally** rather than joined into one string
  first. 100K-char context: **4.69ms → 2.26ms**, garbage **386KB → 214KB**.

### Changed — the headline claim is now a number

- **"No latency overhead" was false and is gone.** It is now *"No proxy. No
  extra service. **No network hop**"*, with a measured table in the README:
  **~26–37µs per admission decision**, **~320–350µs** on an outbound call, vs
  the **1–30ms** network round trip a gateway adds. Published as **ranges** —
  across `-count=6` the admission decision swung 26–37µs on one laptop, and a
  single decimal place off hardware like that is just whichever run flattered
  us. The reproduce command sits above the table.
- Removed "governed"/"ungoverned" from the landing and denial-of-wallet pages —
  vocabulary a prior 5-way review had already killed.

### Added — verification

- **Live provider matrix** (`scripts/live-matrix.sh`) — the suite runs against
  real APIs, not mocks. Verified against **NVIDIA NIM, Groq, and DeepSeek**.
  Each asserts real usage from real SSE, the budget **charged exactly what the
  provider reported**, a real budget **blocking a real runaway**, freeze halting
  live calls, and usage reaching a verifiable evidence chain. Harnesses now
  exist in all three SDKs (Go behind `-tags=live`, Node and Python env-gated).
- **Real provider bytes frozen as conformance vectors.** Notably: **Groq emits
  the same usage three times per call** (top-level `usage`, a nested
  `x_groq.usage`, then top-level again) — a summing extractor would bill **150
  tokens for a 50-token call**. MAX-per-field is what makes it correct, and that
  is now pinned. DeepSeek carries `prompt_cache_hit_tokens`; NIM sends a null
  `audio_tokens`.
- **CI, for the first time.** 800+ tests across three SDKs and no pipeline —
  every run was manual, which is how the SSE bug stayed green. Adds Go
  (`-race`), Node, Python (3.10 + 3.13, `mypy --strict`), a zero-dependency
  import check, cross-SDK parity, and doc-sample verification.
- **Parity guard** (`scripts/parity_guard.py`) — mechanizes the rule that a
  feature landing in Go lands in Node and Python. It was previously enforced by
  memory, which is not a mechanism. 88 capabilities locked.
- **Doc-sample checker** (`scripts/check_doc_samples.py`) — every Node and
  Python sample is typechecked against the real API. A sample that doesn't
  compile is a lie with syntax highlighting.
- **Budget enforcement under concurrency** — 200 goroutines racing one budget;
  reserve-all cannot overshoot; distinct keys cannot leak into each other; an
  abandoned reservation is reclaimed by its TTL.
- **Redis failure posture, stated and proven.** RateGuard fails **closed
  inbound** (503 — nothing else stands between a flood and your handlers) and
  **open outbound** (a Redis blip must not break every LLM call). Fail-open is
  only safe because Redis guards *pacing*, not *spend* — budgets are in-memory
  and never touch it — so that is now a test, not an argument.
- **Agent rule 5 mechanized** — "pre-flight queries never consume." A security
  property: if asking *"can I afford this?"* spends budget, the careful agent
  burns fastest. Every query tool is covered.

### Release process

- **Pushing a tag now publishes.** v0.3.0 and v0.4.0 were cut and never
  published; npm and PyPI served 0.2.0 the whole time, and v0.4.0's own commit
  message says it was cut to close that gap. The checklist wasn't missing — its
  publish steps were manual, interactive, and last, so they got deferred. Now
  `git push origin vX.Y.Z` verifies, publishes, and **confirms the registries
  actually serve it**.

---

## [0.4.0] — 2026-07-17 *(cut, never published)*

- Evidence chain: tamper-evident spend history, external `Signer` interface for
  KMS/HSM custody, offline-verifiable evidence package export.
- `.rgemb` static-embedder models pinned by SHA-256 and verified before parse.
- CJK-aware token estimation with a pluggable `Tokenizer`.
- Enforcement event audit trail across all three SDKs.
- Runtime kill switch (`Freeze`).

## [0.3.0] — 2026-07 *(cut, reached the Go proxy only)*

- The Enforcement Release: per-customer cost attribution, `PricingProvider` for
  user-owned custom pricing, CrewAI/litellm adapter.

## [0.2.0] — 2026-06

Last version published to npm and PyPI before 0.5.0.

## [0.1.0] — 2026-05

Initial release.
