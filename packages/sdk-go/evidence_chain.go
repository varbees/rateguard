package rateguard

import (
	"crypto/ed25519"
	"crypto/sha256"
	"encoding/base64"
	"encoding/hex"
	"encoding/json"
	"errors"
	"fmt"
	"sync"
	"time"
)

// ── Evidence Chain — tamper-evident spend history ──
//
// A signed receipt (spend_receipt.go) proves a single statement was not
// altered. It proves nothing about the SET of statements: an issuer holding
// its own key can drop the expensive receipts, renumber what is left, and
// re-sign a tidier history. Every individual receipt still verifies.
//
// An evidence chain closes that hole. Each entry commits to the hash of the
// entry before it, so the log is append-only in a checkable way: remove or
// reorder an entry and every subsequent hash fails to recompute. What the
// chain yields is a single head hash that stands for the entire history.
//
// ── What this does and does not prove (read before marketing it) ──
//
// The chain makes SELECTIVE edits detectable. It does not, by itself, make
// wholesale rewriting detectable: an issuer with its own signing key can
// rebuild the chain from entry zero and publish a new head. Two things are
// required before the word "evidence" is honest, and RateGuard cannot
// supply either from inside your process:
//
//  1. The signing key must live somewhere the application cannot read — a
//     KMS or HSM. That is what the Signer interface is for: implement it
//     against your KMS and RateGuard never sees key material. A key the
//     audited process holds cannot produce independently verifiable logs,
//     which is precisely the bar EU AI Act Art. 12 record-keeping sets.
//  2. The head must be witnessed outside the application — published,
//     timestamped, or written to append-only storage on a cadence. A head
//     nobody recorded is a head you can silently replace.
//
// With both, this produces the audit INPUTS an assessor can work from.
// RateGuard ships components for an evidence trail. It does not make a
// deployment compliant, and nothing here should be sold as if it did.

const (
	evidenceChainVersion = "rateguard-evidence-chain/1"

	// genesisPrevHash is the prev_hash of entry 0: 32 zero bytes as hex.
	// A fixed-width sentinel rather than an empty string keeps the hashed
	// payload one shape for every entry, so all three SDKs agree.
	genesisPrevHash = "0000000000000000000000000000000000000000000000000000000000000000"
)

// Signer signs bytes with a key the caller controls.
//
// Implement this against a KMS/HSM so the private key never enters the
// process: Sign ships the payload to the external signer and returns the
// signature. Public returns the Ed25519 public key the signature verifies
// under, which is the key auditors pin.
//
// For development, or where an in-process key is genuinely acceptable,
// KeySigner wraps a raw ed25519.PrivateKey. Be deliberate about that
// choice: an in-process key is what disqualifies a log from being
// independently verifiable.
type Signer interface {
	Public() ed25519.PublicKey
	Sign(payload []byte) ([]byte, error)
}

// keySigner is an in-process Signer over a raw private key.
type keySigner struct{ priv ed25519.PrivateKey }

// KeySigner adapts a raw Ed25519 private key to Signer. The key stays in
// process memory — see the Signer docs on why that limits what the
// resulting chain proves.
func KeySigner(priv ed25519.PrivateKey) (Signer, error) {
	if len(priv) != ed25519.PrivateKeySize {
		return nil, fmt.Errorf("rateguard: signer private key must be %d bytes", ed25519.PrivateKeySize)
	}
	return keySigner{priv: priv}, nil
}

func (k keySigner) Public() ed25519.PublicKey {
	pub, _ := k.priv.Public().(ed25519.PublicKey)
	return pub
}

func (k keySigner) Sign(payload []byte) ([]byte, error) {
	return ed25519.Sign(k.priv, payload), nil
}

// IssueSpendReceiptWithSigner signs claims through a Signer, so the private
// key can live in a KMS the process cannot read. Otherwise identical to
// IssueSpendReceipt.
func IssueSpendReceiptWithSigner(signer Signer, claims SpendReceiptClaims) (*SpendReceipt, error) {
	return IssueSpendReceiptWithSignerAt(signer, claims, time.Now())
}

// IssueSpendReceiptWithSignerAt is IssueSpendReceiptWithSigner with an
// explicit issue time — for deterministic tests and conformance vectors.
func IssueSpendReceiptWithSignerAt(signer Signer, claims SpendReceiptClaims, issuedAt time.Time) (*SpendReceipt, error) {
	if signer == nil {
		return nil, errors.New("rateguard: nil signer")
	}
	pub := signer.Public()
	if len(pub) != ed25519.PublicKeySize {
		return nil, fmt.Errorf("rateguard: signer public key must be %d bytes", ed25519.PublicKeySize)
	}
	if err := claims.validate(); err != nil {
		return nil, err
	}
	issuedAtUnix := issuedAt.UTC().Unix()
	payload := receiptSigningPayload(claims, issuedAtUnix, pub)
	sig, err := signer.Sign(payload)
	if err != nil {
		return nil, fmt.Errorf("rateguard: signer failed: %w", err)
	}
	if len(sig) != ed25519.SignatureSize {
		return nil, fmt.Errorf("rateguard: signer returned a %d-byte signature, want %d", len(sig), ed25519.SignatureSize)
	}
	// A KMS misconfigured to a different key produces a signature that
	// verifies under nothing we advertise. Catching it here beats handing an
	// auditor a chain that fails months later.
	if !ed25519.Verify(pub, payload, sig) {
		return nil, errors.New("rateguard: signer's signature does not verify under its own public key")
	}
	return &SpendReceipt{
		Claims:          claims,
		IssuedAtUnix:    issuedAtUnix,
		IssuerPublicKey: append([]byte(nil), pub...),
		Signature:       sig,
	}, nil
}

// EvidenceChainEntry is one link: a receipt, its position, and the hashes
// that bind it to the entry before it.
type EvidenceChainEntry struct {
	// Seq is the 0-based position. Gaps are a broken chain.
	Seq int64 `json:"seq"`
	// PrevHash is the previous entry's EntryHash, hex. Entry 0 carries
	// genesisPrevHash.
	PrevHash string       `json:"prev_hash"`
	Receipt  SpendReceipt `json:"receipt"`
	// EntryHash is hex SHA-256 over this entry's canonical payload.
	EntryHash string `json:"entry_hash"`
}

// entryHashPayload builds the bytes an entry's hash covers.
//
// The receipt is represented by its SIGNATURE, not by its claims. The
// signature already covers every claim, the issue time, and the issuer key,
// so hashing it binds all of them transitively while keeping this payload
// to integers and strings — the same discipline the receipt payload
// follows, and the reason all three SDKs produce identical bytes.
func entryHashPayload(seq int64, prevHash string, receiptSignature []byte) []byte {
	payload := struct {
		V                string `json:"v"`
		Seq              int64  `json:"seq"`
		PrevHash         string `json:"prev_hash"`
		ReceiptSignature string `json:"receipt_signature"`
	}{
		V:                evidenceChainVersion,
		Seq:              seq,
		PrevHash:         prevHash,
		ReceiptSignature: base64.StdEncoding.EncodeToString(receiptSignature),
	}
	// Marshal of this fixed, map-free struct cannot fail.
	encoded, _ := json.Marshal(payload)
	return encoded
}

func computeEntryHash(seq int64, prevHash string, receiptSignature []byte) string {
	sum := sha256.Sum256(entryHashPayload(seq, prevHash, receiptSignature))
	return hex.EncodeToString(sum[:])
}

// EvidenceChain is an append-only, hash-linked log of spend receipts. It is
// safe for concurrent use.
//
// The chain holds every entry in memory and grows without bound — it is a
// record, not a cache, and silently dropping the oldest entries would make
// the head unverifiable. Export and persist on a cadence that matches your
// retention needs.
type EvidenceChain struct {
	mu      sync.Mutex
	entries []EvidenceChainEntry
	head    string
}

// NewEvidenceChain starts an empty chain.
func NewEvidenceChain() *EvidenceChain {
	return &EvidenceChain{head: genesisPrevHash}
}

// Append links a receipt onto the chain and returns the entry created.
//
// The receipt's signature is verified under its own embedded key first: an
// unverifiable receipt must never enter the chain, because the chain's whole
// value is that every link holds.
func (c *EvidenceChain) Append(receipt *SpendReceipt) (EvidenceChainEntry, error) {
	if receipt == nil {
		return EvidenceChainEntry{}, errors.New("rateguard: nil receipt")
	}
	if err := VerifySpendReceipt(nil, receipt); err != nil {
		return EvidenceChainEntry{}, fmt.Errorf("rateguard: refusing to chain an unverifiable receipt: %w", err)
	}

	c.mu.Lock()
	defer c.mu.Unlock()

	seq := int64(len(c.entries))
	entry := EvidenceChainEntry{
		Seq:       seq,
		PrevHash:  c.head,
		Receipt:   *receipt,
		EntryHash: computeEntryHash(seq, c.head, receipt.Signature),
	}
	c.entries = append(c.entries, entry)
	c.head = entry.EntryHash
	return entry, nil
}

// Head is the hash of the last entry, or the genesis sentinel when empty.
// This single value stands for the whole history: witness it externally
// (publish it, timestamp it, write it to append-only storage) or the chain
// proves only that nobody edited a log they could have rebuilt.
func (c *EvidenceChain) Head() string {
	c.mu.Lock()
	defer c.mu.Unlock()
	return c.head
}

// Len is the number of entries.
func (c *EvidenceChain) Len() int {
	c.mu.Lock()
	defer c.mu.Unlock()
	return len(c.entries)
}

// Entries returns a copy of the chain, oldest first.
func (c *EvidenceChain) Entries() []EvidenceChainEntry {
	c.mu.Lock()
	defer c.mu.Unlock()
	return append([]EvidenceChainEntry(nil), c.entries...)
}

// VerifyEvidenceChain checks a chain end to end: every receipt signature,
// every hash link, and the sequence numbering.
//
// trustedIssuer pins the public key the caller trusts. Pass nil to check
// only integrity under each receipt's embedded key — enough to detect
// tampering, NOT enough to establish authenticity, since anyone can mint a
// keypair and sign a whole chain with it.
//
// wantHead, when non-empty, asserts the chain ends at a head recorded
// earlier. This is the check that catches a wholesale rewrite, and it only
// means something if wantHead came from outside the audited system.
func VerifyEvidenceChain(trustedIssuer ed25519.PublicKey, entries []EvidenceChainEntry, wantHead string) error {
	prev := genesisPrevHash
	for i, entry := range entries {
		if entry.Seq != int64(i) {
			return fmt.Errorf("rateguard: chain entry %d claims seq %d (entries missing or reordered)", i, entry.Seq)
		}
		if entry.PrevHash != prev {
			return fmt.Errorf("rateguard: chain broken at seq %d: prev_hash %s does not match the previous entry's hash %s", entry.Seq, entry.PrevHash, prev)
		}
		receipt := entry.Receipt
		if err := VerifySpendReceipt(trustedIssuer, &receipt); err != nil {
			return fmt.Errorf("rateguard: chain entry %d: %w", entry.Seq, err)
		}
		want := computeEntryHash(entry.Seq, entry.PrevHash, receipt.Signature)
		if entry.EntryHash != want {
			return fmt.Errorf("rateguard: chain entry %d hash mismatch: recorded %s, recomputed %s (the entry was altered)", entry.Seq, entry.EntryHash, want)
		}
		prev = entry.EntryHash
	}
	if wantHead != "" && prev != wantHead {
		return fmt.Errorf("rateguard: chain head is %s, expected %s (entries appended, dropped, or replaced since that head was recorded)", prev, wantHead)
	}
	return nil
}

// EvidencePackage is a self-contained export of a chain: the entries, the
// head they produce, the issuer key to verify under, and totals an assessor
// can reconcile against a provider invoice.
type EvidencePackage struct {
	V string `json:"v"`
	// ExportedAtUnix is when the package was produced, unix seconds UTC.
	ExportedAtUnix int64 `json:"exported_at_unix"`
	// IssuerPublicKey is base64 raw 32 bytes — the key to pin. Publish it
	// somewhere an auditor can fetch independently of this file.
	IssuerPublicKey string `json:"issuer_public_key"`
	// ChainHead is the head hash over the exported entries.
	ChainHead  string               `json:"chain_head"`
	EntryCount int                  `json:"entry_count"`
	Entries    []EvidenceChainEntry `json:"entries"`
	// TotalTokens and TotalEstimatedCostMicroUSD sum the exported receipts.
	// The cost is RateGuard's ESTIMATE from its pricing table, never a
	// provider invoice — an assessor reconciling the two should expect
	// drift, and the estimate is not an accounting record.
	TotalTokens                int64 `json:"total_tokens"`
	TotalEstimatedCostMicroUSD int64 `json:"total_estimated_cost_micro_usd"`
	// Caveats travels with the package so its limits reach whoever opens
	// it, not just whoever read the docs.
	Caveats []string `json:"caveats"`
}

// evidencePackageCaveats states what the package cannot prove. It ships
// inside the export deliberately: an evidence file that outlives its
// context gets read as proof of more than it is.
func evidencePackageCaveats() []string {
	return []string{
		"Costs are RateGuard estimates from its pricing table, not provider invoices. Reconcile against billing; expect drift.",
		"Signatures prove integrity under the issuer key. They establish authenticity only if that key was pinned from an independent source.",
		"If the issuer key lived inside the audited application, this log is not independently verifiable: the application could have rebuilt it. External KMS/HSM signing is required for that claim.",
		"The chain head proves no selective edit only if the head was witnessed outside the audited system before this export.",
	}
}

// ExportEvidence builds an EvidencePackage over the whole chain.
func (c *EvidenceChain) ExportEvidence() (*EvidencePackage, error) {
	return c.ExportEvidenceAt(time.Now())
}

// ExportEvidenceAt is ExportEvidence with an explicit timestamp — for
// deterministic tests and reproducible exports.
func (c *EvidenceChain) ExportEvidenceAt(exportedAt time.Time) (*EvidencePackage, error) {
	entries := c.Entries()
	if len(entries) == 0 {
		return nil, errors.New("rateguard: cannot export an empty evidence chain")
	}

	var totalTokens, totalCost int64
	for _, e := range entries {
		totalTokens += e.Receipt.Claims.TotalTokens
		totalCost += e.Receipt.Claims.EstimatedCostMicroUSD
	}

	return &EvidencePackage{
		V:                          evidenceChainVersion,
		ExportedAtUnix:             exportedAt.UTC().Unix(),
		IssuerPublicKey:            base64.StdEncoding.EncodeToString(entries[0].Receipt.IssuerPublicKey),
		ChainHead:                  c.Head(),
		EntryCount:                 len(entries),
		Entries:                    entries,
		TotalTokens:                totalTokens,
		TotalEstimatedCostMicroUSD: totalCost,
		Caveats:                    evidencePackageCaveats(),
	}, nil
}

// MarshalEvidencePackage renders a package as indented JSON — the artifact
// to hand an assessor or archive.
func MarshalEvidencePackage(pkg *EvidencePackage) ([]byte, error) {
	if pkg == nil {
		return nil, errors.New("rateguard: nil evidence package")
	}
	return json.MarshalIndent(pkg, "", "  ")
}

// VerifyEvidencePackage re-verifies an exported package: the chain links,
// every signature, the recorded head, and the totals.
//
// trustedIssuer pins the key; pass nil to check integrity only. The totals
// are recomputed because a package is a document that travels — the numbers
// an assessor reads must be the ones the receipts actually support.
func VerifyEvidencePackage(trustedIssuer ed25519.PublicKey, pkg *EvidencePackage) error {
	if pkg == nil {
		return errors.New("rateguard: nil evidence package")
	}
	if pkg.V != evidenceChainVersion {
		return fmt.Errorf("rateguard: unsupported evidence package version %q", pkg.V)
	}
	if pkg.EntryCount != len(pkg.Entries) {
		return fmt.Errorf("rateguard: evidence package claims %d entries, carries %d", pkg.EntryCount, len(pkg.Entries))
	}
	if err := VerifyEvidenceChain(trustedIssuer, pkg.Entries, pkg.ChainHead); err != nil {
		return err
	}

	var totalTokens, totalCost int64
	for _, e := range pkg.Entries {
		totalTokens += e.Receipt.Claims.TotalTokens
		totalCost += e.Receipt.Claims.EstimatedCostMicroUSD
	}
	if totalTokens != pkg.TotalTokens {
		return fmt.Errorf("rateguard: evidence package claims %d total tokens, receipts sum to %d", pkg.TotalTokens, totalTokens)
	}
	if totalCost != pkg.TotalEstimatedCostMicroUSD {
		return fmt.Errorf("rateguard: evidence package claims %d micro-USD, receipts sum to %d", pkg.TotalEstimatedCostMicroUSD, totalCost)
	}
	return nil
}
