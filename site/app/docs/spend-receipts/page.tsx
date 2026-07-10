import type { Metadata } from "next";
import Link from "next/link";
import { Callout, DocH1, DocH2, DocsPager, P } from "../../../components/docs/Docs";
import { CodeTabs } from "../../../components/docs/CodeTabs";
import { CodeBlock } from "../../../components/docs/CodeBlock";

export const metadata: Metadata = {
  title: "Spend receipts & FOCUS export",
  description:
    "Ed25519-signed, offline-verifiable proof of what an agent actually spent — and FinOps FOCUS-aligned cost exports for the tooling your finance team already uses.",
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
