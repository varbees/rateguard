import type { Metadata } from "next";
import Link from "next/link";
import { Callout, DocH1, DocH2, DocsPager, P, Table } from "../../../components/docs/Docs";
import { CodeBlock } from "../../../components/docs/CodeBlock";

export const metadata: Metadata = {
  title: "Budget attestation",
  description:
    "Cryptographic delegation chains (Ed25519, Go) so one agent can hand a sub-agent a budget that only narrows, never widens — no shared secret, verifiable end-to-end.",
};

export default function BudgetAttestationPage() {
  return (
    <>
      <DocH1 kicker="Guides">Budget attestation</DocH1>
      <P>
        Multi-agent systems delegate: an orchestrator hands a sub-task to a tool-calling agent,
        which may hand a further sub-task to another agent — possibly across a process or trust
        boundary. That handoff has never carried an enforceable budget. Budget attestation closes
        the gap with a chain of Ed25519-signed blocks where each hop can only{" "}
        <strong>narrow</strong> what it received — less budget, fewer providers, less delegation
        depth, an earlier expiry — never widen it.
      </P>
      <Callout kind="note" title="RateGuard's own extension, not a compliance claim">
        This mirrors the shape the IETF Agent Identity Protocol draft (
        <code>draft-prakash-aip</code>, <code>draft-singla-agent-identity-protocol</code>) is
        standardizing around. The spec is still draft-level — RateGuard implements attenuated
        delegation chains as its own extension, not a claim of AIP compliance.
      </Callout>

      <DocH2 id="mint-and-delegate">Mint a root, then delegate</DocH2>
      <CodeBlock
        title="Go"
        code={`// authorityPrivateKey is the long-term key every verifier must already
// trust out-of-band — the same way a TLS client trusts a CA root certificate.
root, holderKey, err := rateguard.NewRootBudgetToken(authorityPrivateKey, rateguard.AttestOptions{
    Grant: rateguard.BudgetGrant{
        MaxTokens: 100_000,
        Providers: []string{"openai", "anthropic"},
        MaxDepth:  3,
        ExpiresAt: time.Now().Add(time.Hour),
    },
})

// parentPrivateKey must match the token's current holder key — proof the
// caller legitimately holds it, not just read a copy of it.
delegated, subAgentKey, err := rateguard.Attest(root, holderKey, rateguard.AttestOptions{
    Grant: rateguard.BudgetGrant{
        MaxTokens: 10_000,
        Providers: []string{"openai"},
        MaxDepth:  0, // may use it, may not delegate further
        ExpiresAt: time.Now().Add(10 * time.Minute),
    },
})`}
      />

      <DocH2 id="narrowing">Narrowing is enforced, not conventional</DocH2>
      <P>
        <code>Attest</code> rejects a grant that widens any field relative to its parent — a wider{" "}
        <code>MaxTokens</code>, a provider not in the parent&apos;s list, more delegation depth, or
        a later expiry all fail with an explicit error, at delegation time.
      </P>
      <Table
        head={["Field", "Rule"]}
        rows={[
          ["MaxTokens", "Unlimited only if the parent is also unlimited; otherwise ≤ parent's value."],
          ["Providers / Models", "Empty (any) only if the parent is also unrestricted; otherwise a subset of the parent's list."],
          ["MaxDepth", "≤ parent's MaxDepth − 1 — each delegation consumes one unit of depth."],
          ["ExpiresAt", "At or before the parent's expiry. Mandatory on every grant — an unexpiring budget token is a standing liability."],
        ]}
      />

      <DocH2 id="proof-of-possession">A token is data, not proof of possession</DocH2>
      <P>
        Anyone who intercepts a serialized token can read its terms — that&apos;s what{" "}
        <code>VerifyChain</code> checks: the signature chain is valid, every block narrowed its
        parent, nothing has expired. It does <strong>not</strong> prove the presenter is the
        legitimate holder. For an authorization decision, the holder must sign a
        verifier-supplied context with its private key:
      </P>
      <CodeBlock
        title="Go"
        code={`// The sub-agent proves possession over a verifier-supplied nonce.
sig, err := rateguard.Sign(delegated, subAgentKey, []byte("request-nonce"))

// The verifier checks the chain AND the proof of possession together.
grant, err := rateguard.VerifyPresentation(
    delegated, authorityPublicKey, []byte("request-nonce"), sig,
)`}
      />
      <Callout kind="tip">
        A signature over one context never verifies against a different context — a captured
        token plus a captured signature can&apos;t be replayed against a fresh challenge.
      </Callout>

      <DocH2 id="key-generation">Who generates the delegate keypair?</DocH2>
      <P>
        <code>DelegatePublicKey</code> on <code>AttestOptions</code> is optional. Omit it and
        RateGuard generates a fresh keypair, returning the private key for you to hand to the
        sub-agent you&apos;re spawning — the convenient path for a single hop. Supply it when the
        sub-agent already generated its own keypair and shared only the public half; its private
        key then never transits through the delegator, the recommended pattern for longer chains.
      </P>

      <DocH2 id="wire-format">Wire format</DocH2>
      <P>
        <code>Marshal</code> / <code>ParseBudgetToken</code> round-trip a token as compact JSON
        text — safe to pass as an MCP tool argument, an HTTP header, or a file handoff.
      </P>

      <DocH2 id="mcp">MCP tools</DocH2>
      <CodeBlock
        title="attest_budget / verify_budget"
        code={`// attest_budget — mint a root or delegate further
{
  "signing_key": "<base64 Ed25519 private key>",
  "parent_token": "<omit to mint a root token>",
  "max_tokens": 10000, "providers": ["openai"], "max_depth": 0,
  "expires_in_seconds": 600
}
// -> { "token": "...", "delegate_private_key": "...", "delegate_public_key": "..." }

// verify_budget — chain-only, or full presentation with context+signature
{
  "token": "...", "root_public_key": "<base64 Ed25519 public key>",
  "context": "request-nonce", "signature": "<base64, from Sign>"
}
// -> { "valid": true, "proof_of_possession_verified": true, "effective_grant": {...} }`}
      />
      <P>
        See <Link href="/docs/agents-mcp">Agents &amp; MCP</Link> for the other five pre-flight
        tools. Full walkthrough with output:{" "}
        <a href="https://github.com/varbees/rateguard/blob/main/packages/sdk-go/examples/budget-attestation/main.go">
          examples/budget-attestation
        </a>
        .
      </P>

      <DocH2 id="scope">Scope</DocH2>
      <P>
        Single-hop delegation, verified end-to-end, is the primary target for v0.1. The chain
        design supports multiple hops because attenuation only works if it composes, but longer
        chains are unproven in production here and should be adopted cautiously. Go only for now —
        Node and Python parity is tracked but not yet built.
      </P>
      <DocsPager slug="budget-attestation" />
    </>
  );
}
