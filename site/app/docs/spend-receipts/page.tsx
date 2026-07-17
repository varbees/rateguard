import type { Metadata } from "next";
import Link from "next/link";
import { Callout, DocH1, DocH2, DocsPager, P } from "../../../components/docs/Docs";
import { CodeTabs } from "../../../components/docs/CodeTabs";
import { CodeBlock } from "../../../components/docs/CodeBlock";

export const metadata: Metadata = {
  title: "Spend receipts, evidence chain & FOCUS export",
  description:
    "Ed25519-signed proof of what an agent actually spent, a hash-linked evidence chain that makes the record tamper-evident, KMS signing, and FinOps FOCUS-aligned cost exports.",
};

export default function SpendReceiptsPage() {
  return (
    <>
      <DocH1 kicker="Guides">Spend receipts &amp; FOCUS export</DocH1>
      <P>
        <Link href="/docs/budget-attestation">Budget attestation</Link> answers &quot;was this
        agent <em>authorized</em> to spend?&quot; A spend receipt answers the other half:
        &quot;what <em>did</em> it spend?&quot; — an Ed25519-signed, offline-verifiable statement
        that a key consumed N tokens at an estimated cost over a window. Together they close the
        loop: <strong>grant → spend → proof</strong>. That chain is technical evidence for the
        audit-trail era (EU AI Act record-keeping, NIST AI RMF, ISO 42001) — evidence, not
        certification.
      </P>

      <DocH2 id="issue">Issue and verify</DocH2>
      <P>
        Receipts are caller-fed, like GenAI spans: you supply the claims from your own metering
        (the outbound transport, GenAI spans, or a realtime session guard&apos;s totals) and a
        signing key you control. RateGuard holds no keys.
      </P>
      <CodeTabs
        tabs={[
          {
            label: "Go",
            code: `receipt, err := rateguard.IssueSpendReceipt(issuerKey, rateguard.SpendReceiptClaims{
    Key:                   "tenant-a:agent-7",
    Provider:              "openai",
    Model:                 "gpt-4o",
    WindowStartUnix:       windowStart.Unix(),
    WindowEndUnix:         windowEnd.Unix(),
    InputTokens:           120_000,
    OutputTokens:          34_500,
    TotalTokens:           154_500,
    EstimatedCostMicroUSD: 645_000, // $0.645 — integer micro-USD, never floats
    AttestationTokenID:    "att-9f2c", // optional: bind to the grant
})

// Any party holding the trusted issuer key can verify offline:
err = rateguard.VerifySpendReceipt(trustedIssuerPub, receipt)`,
          },
          {
            label: "Node.js",
            code: `const receipt = issueSpendReceipt(issuerKey, {
  key: 'tenant-a:agent-7',
  provider: 'openai',
  model: 'gpt-4o',
  windowStartUnix, windowEndUnix,
  inputTokens: 120_000,
  outputTokens: 34_500,
  totalTokens: 154_500,
  estimatedCostMicroUSD: 645_000, // $0.645 — integer micro-USD, never floats
  attestationTokenId: 'att-9f2c', // optional: bind to the grant
});

// Any party holding the trusted issuer key can verify offline:
verifySpendReceipt(trustedIssuerPub, receipt); // throws on failure`,
          },
          {
            label: "Python",
            code: `receipt = issue_spend_receipt(issuer_key, SpendReceiptClaims(
    key="tenant-a:agent-7",
    provider="openai",
    model="gpt-4o",
    window_start_unix=window_start,
    window_end_unix=window_end,
    input_tokens=120_000,
    output_tokens=34_500,
    total_tokens=154_500,
    estimated_cost_micro_usd=645_000,  # $0.645 — integer micro-USD, never floats
    attestation_token_id="att-9f2c",   # optional: bind to the grant
))

# Any party holding the trusted issuer key can verify offline:
verify_spend_receipt(trusted_issuer_pub, receipt)  # raises on failure`,
          },
        ]}
      />
      <Callout>
        The signing payload contains integers and strings only — unix seconds for time, integer
        micro-USD for money. Nothing a runtime can render two ways. The conformance suite pins
        payload <strong>and signature</strong> byte-for-byte across all three SDKs
        (<code>conformance/spend_receipt_vectors.json</code>): a receipt issued in one language
        verifies in any other.
      </Callout>
      <P>
        Verification pins the issuer key you trust; passing no trusted key checks integrity only
        (tamper detection under the embedded key — not authenticity, since anyone can mint a
        keypair). Tampering with any claim, or the issue time, fails verification.
      </P>

      <DocH2 id="evidence-chain">Evidence chain: proving the set, not just the statement</DocH2>
      <P>
        A signed receipt proves one statement was not altered. It proves nothing about the{" "}
        <em>set</em> of statements. An issuer holding its own key can drop the expensive receipts,
        renumber what is left, and re-sign a tidier history — and every remaining receipt still
        verifies. A pile of valid receipts is not a record.
      </P>
      <P>
        <code>EvidenceChain</code> links each entry to the hash of the entry before it. Remove,
        reorder, or edit one and every subsequent hash fails to recompute. The chain yields a
        single <strong>head</strong> that stands for the whole history.
      </P>
      <CodeTabs
        tabs={[
          {
            label: "Go",
            code: `chain := rateguard.NewEvidenceChain()
entry, err := chain.Append(receipt) // refuses receipts that don't verify

// The head stands for the entire history. Witness it externally.
head := chain.Head()

// Verify end to end: signatures, links, sequence, and the head you recorded.
err = rateguard.VerifyEvidenceChain(trustedIssuerKey, chain.Entries(), witnessedHead)`,
          },
          {
            label: "Node.js",
            code: `const chain = new EvidenceChain();
const entry = chain.append(receipt); // refuses receipts that don't verify

// The head stands for the entire history. Witness it externally.
const head = chain.head;

// Verify end to end: signatures, links, sequence, and the head you recorded.
verifyEvidenceChain(trustedIssuerKey, chain.entries(), witnessedHead);`,
          },
          {
            label: "Python",
            code: `chain = EvidenceChain()
entry = chain.append(receipt)  # refuses receipts that don't verify

# The head stands for the entire history. Witness it externally.
head = chain.head

# Verify end to end: signatures, links, sequence, and the head you recorded.
verify_evidence_chain(trusted_issuer_key, chain.entries(), witnessed_head)`,
          },
        ]}
      />

      <DocH2 id="external-signer">Keep the key out of your process</DocH2>
      <P>
        A log signed by a key the audited application holds is not independently verifiable — the
        application could have produced any history it liked. That is the bar record-keeping
        regimes actually set, and it is not one an in-process SDK can clear on its own.
      </P>
      <P>
        The <code>Signer</code> interface is the answer: implement it against your KMS or HSM and
        RateGuard never sees key material. It ships the signing payload out and takes a signature
        back. A signer that advertises one key but signs with another — a KMS pointed at the wrong
        alias — is rejected at issue time, rather than months later in an auditor&apos;s hands.
      </P>
      <CodeTabs
        tabs={[
          {
            label: "Go",
            code: `// Implement Signer against your KMS; the key never enters the process.
type KMSSigner struct{ /* ... */ }

func (s KMSSigner) Public() ed25519.PublicKey          { /* published key */ }
func (s KMSSigner) Sign(payload []byte) ([]byte, error) { /* KMS round trip */ }

receipt, err := rateguard.IssueSpendReceiptWithSigner(kms, claims)

// In-process key (dev, or where you've decided it's acceptable):
signer, err := rateguard.KeySigner(privateKey)`,
          },
          {
            label: "Node.js",
            code: `// Implement Signer against your KMS; the key never enters the process.
const kms: Signer = {
  publicKey: () => publishedKey,
  sign: (payload) => kmsRoundTrip(payload),
};

const receipt = issueSpendReceiptWithSigner(kms, claims);

// In-process key (dev, or where you've decided it's acceptable):
const signer = keySigner(privateKey);`,
          },
          {
            label: "Python",
            code: `# Implement Signer against your KMS; the key never enters the process.
class KMSSigner:
    def public_key(self) -> bytes: ...   # published key
    def sign(self, payload: bytes) -> bytes: ...  # KMS round trip

receipt = issue_spend_receipt_with_signer(KMSSigner(), claims)

# In-process key (dev, or where you've decided it's acceptable):
signer = KeySigner(private_key)`,
          },
        ]}
      />

      <DocH2 id="evidence-package">Evidence package</DocH2>
      <P>
        <code>ExportEvidence</code> produces the artifact you hand an assessor: the entries, the
        head they produce, the issuer key to pin, and totals that are <em>recomputed</em> on verify
        — so the summary can never become a place to hide spend. Its caveats travel inside the
        file, because an evidence export that outlives its context gets read as proof of more than
        it is.
      </P>
      <CodeTabs
        tabs={[
          {
            label: "Go",
            code: `pkg, err := chain.ExportEvidence()
data, err := rateguard.MarshalEvidencePackage(pkg)

// Re-verify a package that arrived from somewhere else.
err = rateguard.VerifyEvidencePackage(trustedIssuerKey, pkg)`,
          },
          {
            label: "Node.js",
            code: `const pkg = chain.exportEvidence();
const json = marshalEvidencePackage(pkg);

// Re-verify a package that arrived from somewhere else.
verifyEvidencePackage(trustedIssuerKey, pkg);`,
          },
          {
            label: "Python",
            code: `pkg = chain.export_evidence()
json_text = pkg.to_json()

# Re-verify a package that arrived from somewhere else.
verify_evidence_package(trusted_issuer_key, pkg)`,
          },
        ]}
      />
      <Callout>
        What this proves, exactly. The chain catches <strong>selective</strong> edits on its own. It
        does not, by itself, catch a <strong>wholesale rewrite</strong>: an issuer with its own key
        can rebuild the chain from entry zero and publish a new head. Closing that needs two things
        RateGuard cannot supply from inside your process — a signing key the application cannot
        read, and a head witnessed <em>outside</em> the application (published, timestamped, or
        written to append-only storage on a cadence). With both, you have audit{" "}
        <strong>inputs</strong> an assessor can work from. RateGuard ships components for an
        evidence trail; it does not make a deployment compliant, and you should not tell anyone it
        does.
      </Callout>

      <DocH2 id="focus">FOCUS-aligned cost export</DocH2>
      <P>
        FOCUS (the FinOps Open Cost and Usage Specification) is the column contract enterprise
        cost tooling ingests. RateGuard maps receipts onto it: tokens ride{" "}
        <code>ConsumedQuantity</code>/<code>ConsumedUnit</code> — the spec&apos;s own home for
        virtual-currency usage — and RateGuard detail rides in <code>x_rateguard_*</code>{" "}
        extension columns, the spec&apos;s sanctioned convention. Each row carries the
        receipt&apos;s signature, tying the spreadsheet back to its cryptographic proof.
      </P>
      <CodeTabs
        tabs={[
          {
            label: "Go",
            code: `rows := []rateguard.FOCUSRow{rateguard.FOCUSRowFromReceipt(receipt)}
err := rateguard.WriteFOCUSCSV(file, rows)`,
          },
          {
            label: "Node.js",
            code: `const csv = writeFOCUSCSV([focusRowFromReceipt(receipt)]);`,
          },
          {
            label: "Python",
            code: `write_focus_csv(file, [focus_row_from_receipt(receipt)])`,
          },
        ]}
      />
      <Callout>
        Honest scope: <code>BilledCost</code> is deliberately 0 — RateGuard bills nothing — and{" "}
        <code>EffectiveCost</code> carries a pricing-table <strong>estimate</strong>. Providers
        themselves note runtime token counts can drift from the billing meter. Reconcile against
        provider invoices for accounting truth; use receipts for enforcement evidence.
      </Callout>

      <DocsPager slug="spend-receipts" />
    </>
  );
}
