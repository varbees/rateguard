/**
 * Evidence Chain — tamper-evident spend history.
 *
 * A signed receipt (spend-receipt.ts) proves a single statement was not
 * altered. It proves nothing about the SET of statements: an issuer holding
 * its own key can drop the expensive receipts, renumber what is left, and
 * re-sign a tidier history. Every individual receipt still verifies.
 *
 * An evidence chain closes that hole. Each entry commits to the hash of the
 * entry before it, so the log is append-only in a checkable way: remove or
 * reorder an entry and every subsequent hash fails to recompute. What the
 * chain yields is a single head hash standing for the entire history.
 *
 * ── What this does and does not prove (read before marketing it) ──
 *
 * The chain makes SELECTIVE edits detectable. It does not, by itself, make
 * wholesale rewriting detectable: an issuer with its own signing key can
 * rebuild the chain from entry zero and publish a new head. Two things are
 * required before the word "evidence" is honest, and RateGuard cannot supply
 * either from inside your process:
 *
 *  1. The signing key must live somewhere the application cannot read — a
 *     KMS or HSM. That is what the Signer interface is for. A key the
 *     audited process holds cannot produce independently verifiable logs,
 *     which is precisely the bar EU AI Act Art. 12 record-keeping sets.
 *  2. The head must be witnessed outside the application — published,
 *     timestamped, or written to append-only storage on a cadence. A head
 *     nobody recorded is a head you can silently replace.
 *
 * With both, this produces the audit INPUTS an assessor can work from.
 * RateGuard ships components for an evidence trail. It does not make a
 * deployment compliant, and nothing here should be sold as if it did.
 *
 * Cross-language discipline: the hashed payload contains ONLY integers and
 * strings, so Go, Node, and Python produce identical bytes.
 */

import { createHash, createPublicKey, sign as cryptoSign, type KeyObject } from 'node:crypto';

import { publicKeyToRaw } from './budget-attestation.js';
import {
  receiptSigningPayload,
  spendReceiptFromJSON,
  spendReceiptToJSON,
  verifySpendReceipt,
  type SpendReceipt,
  type SpendReceiptClaims,
} from './spend-receipt.js';

const EVIDENCE_CHAIN_VERSION = 'rateguard-evidence-chain/1';

/**
 * The prev_hash of entry 0: 32 zero bytes as hex. A fixed-width sentinel
 * rather than an empty string keeps the hashed payload one shape for every
 * entry, so all three SDKs agree.
 */
export const GENESIS_PREV_HASH = '0'.repeat(64);

/**
 * Signs bytes with a key the caller controls.
 *
 * Implement this against a KMS/HSM so the private key never enters the
 * process: `sign` ships the payload to the external signer and returns the
 * signature. `publicKey` returns the raw 32-byte Ed25519 public key the
 * signature verifies under — the key auditors pin.
 *
 * For development, or where an in-process key is genuinely acceptable,
 * {@link keySigner} wraps a KeyObject. Be deliberate about that choice: an
 * in-process key is what disqualifies a log from being independently
 * verifiable.
 */
export interface Signer {
  publicKey(): Buffer;
  sign(payload: Buffer): Buffer;
}

/**
 * Adapts a raw Ed25519 private key to {@link Signer}. The key stays in
 * process memory — see the Signer docs on why that limits what the
 * resulting chain proves.
 */
export function keySigner(privateKey: KeyObject): Signer {
  const pub = publicKeyToRaw(createPublicKey(privateKey));
  return {
    publicKey: () => pub,
    sign: (payload: Buffer) => cryptoSign(null, payload, privateKey),
  };
}

/**
 * Sign claims through a {@link Signer}, so the private key can live in a KMS
 * the process cannot read. Otherwise identical to issueSpendReceipt.
 */
export function issueSpendReceiptWithSigner(
  signer: Signer,
  claims: SpendReceiptClaims,
  issuedAtUnix?: number,
): SpendReceipt {
  const pub = signer.publicKey();
  if (pub.length !== 32) {
    throw new Error('rateguard: signer public key must be 32 bytes');
  }
  const issued = issuedAtUnix ?? Math.floor(Date.now() / 1000);
  const payload = receiptSigningPayload(claims, issued, pub);
  const signature = signer.sign(payload);
  if (signature.length !== 64) {
    throw new Error(
      `rateguard: signer returned a ${signature.length}-byte signature, want 64`,
    );
  }
  const receipt: SpendReceipt = { claims, issuedAtUnix: issued, issuerPublicKey: pub, signature };
  // A KMS misconfigured to a different key produces a signature that verifies
  // under nothing we advertise. Catching it here beats handing an auditor a
  // chain that fails months later. verifySpendReceipt also runs claim
  // validation, so malformed claims surface before anything is signed into
  // the chain.
  try {
    verifySpendReceipt(pub, receipt);
  } catch (err) {
    throw new Error(
      `rateguard: signer's signature does not verify under its own public key: ${(err as Error).message}`,
    );
  }
  return receipt;
}

/** One link: a receipt, its position, and the hashes binding it to the previous entry. */
export interface EvidenceChainEntry {
  /** 0-based position. Gaps are a broken chain. */
  seq: number;
  /** The previous entry's entryHash, hex. Entry 0 carries GENESIS_PREV_HASH. */
  prevHash: string;
  receipt: SpendReceipt;
  /** Hex SHA-256 over this entry's canonical payload. */
  entryHash: string;
}

/**
 * The bytes an entry's hash covers.
 *
 * The receipt is represented by its SIGNATURE, not by its claims. The
 * signature already covers every claim, the issue time, and the issuer key,
 * so hashing it binds all of them transitively while keeping this payload to
 * integers and strings — the same discipline the receipt payload follows,
 * and the reason all three SDKs produce identical bytes.
 */
function entryHashPayload(seq: number, prevHash: string, receiptSignature: Buffer): Buffer {
  const payload = {
    v: EVIDENCE_CHAIN_VERSION,
    seq,
    prev_hash: prevHash,
    receipt_signature: receiptSignature.toString('base64'),
  };
  return Buffer.from(JSON.stringify(payload), 'utf8');
}

function computeEntryHash(seq: number, prevHash: string, receiptSignature: Buffer): string {
  return createHash('sha256').update(entryHashPayload(seq, prevHash, receiptSignature)).digest('hex');
}

/**
 * An append-only, hash-linked log of spend receipts.
 *
 * The chain holds every entry in memory and grows without bound — it is a
 * record, not a cache, and silently dropping the oldest entries would make
 * the head unverifiable. Export and persist on a cadence that matches your
 * retention needs.
 */
export class EvidenceChain {
  private readonly entriesList: EvidenceChainEntry[] = [];
  private headHash: string = GENESIS_PREV_HASH;

  /**
   * Link a receipt onto the chain and return the entry created.
   *
   * The receipt's signature is verified under its own embedded key first: an
   * unverifiable receipt must never enter the chain, because the chain's
   * whole value is that every link holds.
   */
  append(receipt: SpendReceipt): EvidenceChainEntry {
    try {
      verifySpendReceipt(null, receipt);
    } catch (err) {
      throw new Error(
        `rateguard: refusing to chain an unverifiable receipt: ${(err as Error).message}`,
      );
    }
    const seq = this.entriesList.length;
    const entry: EvidenceChainEntry = {
      seq,
      prevHash: this.headHash,
      receipt,
      entryHash: computeEntryHash(seq, this.headHash, receipt.signature),
    };
    this.entriesList.push(entry);
    this.headHash = entry.entryHash;
    return entry;
  }

  /**
   * The hash of the last entry, or the genesis sentinel when empty. This
   * single value stands for the whole history: witness it externally
   * (publish it, timestamp it, write it to append-only storage) or the chain
   * proves only that nobody edited a log they could have rebuilt.
   */
  get head(): string {
    return this.headHash;
  }

  /** The number of entries. */
  get length(): number {
    return this.entriesList.length;
  }

  /** A copy of the chain, oldest first. */
  entries(): EvidenceChainEntry[] {
    return [...this.entriesList];
  }

  /** Build an {@link EvidencePackage} over the whole chain. */
  exportEvidence(exportedAtUnix?: number): EvidencePackage {
    const entries = this.entries();
    if (entries.length === 0) {
      throw new Error('rateguard: cannot export an empty evidence chain');
    }
    let totalTokens = 0;
    let totalCost = 0;
    for (const e of entries) {
      totalTokens += e.receipt.claims.totalTokens;
      totalCost += e.receipt.claims.estimatedCostMicroUSD;
    }
    return {
      v: EVIDENCE_CHAIN_VERSION,
      exportedAtUnix: exportedAtUnix ?? Math.floor(Date.now() / 1000),
      issuerPublicKey: entries[0]!.receipt.issuerPublicKey.toString('base64'),
      chainHead: this.headHash,
      entryCount: entries.length,
      entries,
      totalTokens,
      totalEstimatedCostMicroUSD: totalCost,
      caveats: evidencePackageCaveats(),
    };
  }
}

/**
 * Check a chain end to end: every receipt signature, every hash link, and
 * the sequence numbering. Throws on the first failure.
 *
 * trustedIssuerRaw pins the raw 32-byte public key the caller trusts. Pass
 * null to check only integrity under each receipt's embedded key — enough to
 * detect tampering, NOT enough to establish authenticity, since anyone can
 * mint a keypair and sign a whole chain with it.
 *
 * wantHead, when non-empty, asserts the chain ends at a head recorded
 * earlier. This is the check that catches a wholesale rewrite, and it only
 * means something if wantHead came from outside the audited system.
 */
export function verifyEvidenceChain(
  trustedIssuerRaw: Buffer | null,
  entries: EvidenceChainEntry[],
  wantHead = '',
): void {
  let prev = GENESIS_PREV_HASH;
  for (let i = 0; i < entries.length; i++) {
    const entry = entries[i]!;
    if (entry.seq !== i) {
      throw new Error(
        `rateguard: chain entry ${i} claims seq ${entry.seq} (entries missing or reordered)`,
      );
    }
    if (entry.prevHash !== prev) {
      throw new Error(
        `rateguard: chain broken at seq ${entry.seq}: prev_hash ${entry.prevHash} does not match the previous entry's hash ${prev}`,
      );
    }
    try {
      verifySpendReceipt(trustedIssuerRaw, entry.receipt);
    } catch (err) {
      throw new Error(`rateguard: chain entry ${entry.seq}: ${(err as Error).message}`);
    }
    const want = computeEntryHash(entry.seq, entry.prevHash, entry.receipt.signature);
    if (entry.entryHash !== want) {
      throw new Error(
        `rateguard: chain entry ${entry.seq} hash mismatch: recorded ${entry.entryHash}, recomputed ${want} (the entry was altered)`,
      );
    }
    prev = entry.entryHash;
  }
  if (wantHead !== '' && prev !== wantHead) {
    throw new Error(
      `rateguard: chain head is ${prev}, expected ${wantHead} (entries appended, dropped, or replaced since that head was recorded)`,
    );
  }
}

/**
 * A self-contained export of a chain: the entries, the head they produce,
 * the issuer key to verify under, and totals an assessor can reconcile
 * against a provider invoice.
 */
export interface EvidencePackage {
  v: string;
  exportedAtUnix: number;
  /**
   * Base64 raw 32 bytes — the key to pin. Publish it somewhere an auditor
   * can fetch independently of this file.
   */
  issuerPublicKey: string;
  chainHead: string;
  entryCount: number;
  entries: EvidenceChainEntry[];
  totalTokens: number;
  /**
   * RateGuard's ESTIMATE from its pricing table, never a provider invoice —
   * an assessor reconciling the two should expect drift.
   */
  totalEstimatedCostMicroUSD: number;
  caveats: string[];
}

/**
 * What the package cannot prove. Ships inside the export deliberately: an
 * evidence file that outlives its context gets read as proof of more than it
 * is.
 */
function evidencePackageCaveats(): string[] {
  return [
    'Costs are RateGuard estimates from its pricing table, not provider invoices. Reconcile against billing; expect drift.',
    'Signatures prove integrity under the issuer key. They establish authenticity only if that key was pinned from an independent source.',
    'If the issuer key lived inside the audited application, this log is not independently verifiable: the application could have rebuilt it. External KMS/HSM signing is required for that claim.',
    'The chain head proves no selective edit only if the head was witnessed outside the audited system before this export.',
  ];
}

/** JSON-transport shape (bytes as base64), mirrors Go's json tags. */
export function evidencePackageToJSON(pkg: EvidencePackage): Record<string, unknown> {
  return {
    v: pkg.v,
    exported_at_unix: pkg.exportedAtUnix,
    issuer_public_key: pkg.issuerPublicKey,
    chain_head: pkg.chainHead,
    entry_count: pkg.entryCount,
    entries: pkg.entries.map((e) => ({
      seq: e.seq,
      prev_hash: e.prevHash,
      receipt: spendReceiptToJSON(e.receipt),
      entry_hash: e.entryHash,
    })),
    total_tokens: pkg.totalTokens,
    total_estimated_cost_micro_usd: pkg.totalEstimatedCostMicroUSD,
    caveats: pkg.caveats,
  };
}

/** Parse the JSON-transport shape back into a package. */
export function evidencePackageFromJSON(data: Record<string, unknown>): EvidencePackage {
  const rawEntries = (data['entries'] ?? []) as Array<Record<string, unknown>>;
  return {
    v: String(data['v']),
    exportedAtUnix: Number(data['exported_at_unix']),
    issuerPublicKey: String(data['issuer_public_key']),
    chainHead: String(data['chain_head']),
    entryCount: Number(data['entry_count']),
    entries: rawEntries.map((e) => ({
      seq: Number(e['seq']),
      prevHash: String(e['prev_hash']),
      receipt: spendReceiptFromJSON(e['receipt'] as Record<string, unknown>),
      entryHash: String(e['entry_hash']),
    })),
    totalTokens: Number(data['total_tokens'] ?? 0),
    totalEstimatedCostMicroUSD: Number(data['total_estimated_cost_micro_usd'] ?? 0),
    caveats: ((data['caveats'] ?? []) as unknown[]).map(String),
  };
}

/** Render a package as indented JSON — the artifact to hand an assessor or archive. */
export function marshalEvidencePackage(pkg: EvidencePackage): string {
  return JSON.stringify(evidencePackageToJSON(pkg), null, 2);
}

/**
 * Re-verify an exported package: the chain links, every signature, the
 * recorded head, and the totals. Throws on the first failure.
 *
 * trustedIssuerRaw pins the key; null checks integrity only. The totals are
 * recomputed because a package is a document that travels — the numbers an
 * assessor reads must be the ones the receipts actually support.
 */
export function verifyEvidencePackage(
  trustedIssuerRaw: Buffer | null,
  pkg: EvidencePackage,
): void {
  if (pkg.v !== EVIDENCE_CHAIN_VERSION) {
    throw new Error(`rateguard: unsupported evidence package version ${JSON.stringify(pkg.v)}`);
  }
  if (pkg.entryCount !== pkg.entries.length) {
    throw new Error(
      `rateguard: evidence package claims ${pkg.entryCount} entries, carries ${pkg.entries.length}`,
    );
  }
  verifyEvidenceChain(trustedIssuerRaw, pkg.entries, pkg.chainHead);

  let totalTokens = 0;
  let totalCost = 0;
  for (const e of pkg.entries) {
    totalTokens += e.receipt.claims.totalTokens;
    totalCost += e.receipt.claims.estimatedCostMicroUSD;
  }
  if (totalTokens !== pkg.totalTokens) {
    throw new Error(
      `rateguard: evidence package claims ${pkg.totalTokens} total tokens, receipts sum to ${totalTokens}`,
    );
  }
  if (totalCost !== pkg.totalEstimatedCostMicroUSD) {
    throw new Error(
      `rateguard: evidence package claims ${pkg.totalEstimatedCostMicroUSD} micro-USD, receipts sum to ${totalCost}`,
    );
  }
}
