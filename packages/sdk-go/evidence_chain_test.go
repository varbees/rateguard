package rateguard

import (
	"crypto/ed25519"
	"encoding/base64"
	"encoding/hex"
	"encoding/json"
	"errors"
	"os"
	"strings"
	"testing"
	"time"
)

func testClaims(key string, tokens, costMicroUSD int64) SpendReceiptClaims {
	return SpendReceiptClaims{
		Key:                   key,
		Provider:              "openai",
		Model:                 "gpt-4o",
		WindowStartUnix:       1_700_000_000,
		WindowEndUnix:         1_700_003_600,
		InputTokens:           tokens / 2,
		OutputTokens:          tokens - tokens/2,
		TotalTokens:           tokens,
		EstimatedCostMicroUSD: costMicroUSD,
	}
}

// chainOf builds a chain of n receipts signed by a fresh key.
func chainOf(t *testing.T, n int) (*EvidenceChain, ed25519.PublicKey, ed25519.PrivateKey) {
	t.Helper()
	pub, priv, err := ed25519.GenerateKey(nil)
	if err != nil {
		t.Fatalf("generate key: %v", err)
	}
	chain := NewEvidenceChain()
	for i := range n {
		r, err := IssueSpendReceiptAt(priv, testClaims("agent-1", int64(100*(i+1)), int64(1000*(i+1))), time.Unix(1_700_000_000, 0))
		if err != nil {
			t.Fatalf("issue receipt %d: %v", i, err)
		}
		if _, err := chain.Append(r); err != nil {
			t.Fatalf("append receipt %d: %v", i, err)
		}
	}
	return chain, pub, priv
}

func TestEvidenceChainLinksAndVerifies(t *testing.T) {
	chain, pub, _ := chainOf(t, 4)

	if chain.Len() != 4 {
		t.Fatalf("Len() = %d, want 4", chain.Len())
	}
	entries := chain.Entries()
	if entries[0].PrevHash != genesisPrevHash {
		t.Errorf("entry 0 prev_hash = %s, want genesis", entries[0].PrevHash)
	}
	for i := 1; i < len(entries); i++ {
		if entries[i].PrevHash != entries[i-1].EntryHash {
			t.Errorf("entry %d prev_hash does not link to entry %d hash", i, i-1)
		}
		if entries[i].Seq != int64(i) {
			t.Errorf("entry %d seq = %d", i, entries[i].Seq)
		}
	}
	if chain.Head() != entries[len(entries)-1].EntryHash {
		t.Error("Head() is not the last entry's hash")
	}
	if err := VerifyEvidenceChain(pub, entries, chain.Head()); err != nil {
		t.Errorf("verify intact chain: %v", err)
	}
}

func TestEvidenceChainEmptyHeadIsGenesis(t *testing.T) {
	c := NewEvidenceChain()
	if c.Head() != genesisPrevHash {
		t.Errorf("empty chain head = %s, want genesis", c.Head())
	}
	if err := VerifyEvidenceChain(nil, c.Entries(), genesisPrevHash); err != nil {
		t.Errorf("verify empty chain: %v", err)
	}
	if _, err := c.ExportEvidence(); err == nil {
		t.Error("expected error exporting an empty chain")
	}
}

// The attack the chain exists to catch: drop an expensive receipt from the
// middle. Every REMAINING receipt still has a valid signature — only the
// links expose the deletion.
func TestEvidenceChainDetectsDeletedEntry(t *testing.T) {
	chain, pub, _ := chainOf(t, 4)
	entries := chain.Entries()

	for _, e := range entries {
		receipt := e.Receipt
		if err := VerifySpendReceipt(pub, &receipt); err != nil {
			t.Fatalf("precondition: every receipt must verify on its own: %v", err)
		}
	}

	doctored := append(append([]EvidenceChainEntry{}, entries[:2]...), entries[3:]...)
	err := VerifyEvidenceChain(pub, doctored, "")
	if err == nil {
		t.Fatal("expected verification to fail for a chain with a deleted entry")
	}
	if !strings.Contains(err.Error(), "seq") && !strings.Contains(err.Error(), "chain broken") {
		t.Errorf("error = %v, want a sequence/link failure", err)
	}
}

func TestEvidenceChainDetectsReorderedEntries(t *testing.T) {
	chain, pub, _ := chainOf(t, 3)
	entries := chain.Entries()
	swapped := []EvidenceChainEntry{entries[1], entries[0], entries[2]}
	if err := VerifyEvidenceChain(pub, swapped, ""); err == nil {
		t.Fatal("expected verification to fail for reordered entries")
	}
}

// Altering a claim breaks the receipt signature before the hash is even
// consulted — asserted so the two layers stay independently effective.
func TestEvidenceChainDetectsAlteredClaim(t *testing.T) {
	chain, pub, _ := chainOf(t, 3)
	entries := chain.Entries()
	entries[1].Receipt.Claims.EstimatedCostMicroUSD = 1

	err := VerifyEvidenceChain(pub, entries, "")
	if err == nil {
		t.Fatal("expected verification to fail for an altered claim")
	}
	if !strings.Contains(err.Error(), "signature") {
		t.Errorf("error = %v, want a signature failure", err)
	}
}

// Rewriting a recorded hash must fail even though nothing else changed.
func TestEvidenceChainDetectsRewrittenHash(t *testing.T) {
	chain, pub, _ := chainOf(t, 3)
	entries := chain.Entries()
	entries[2].EntryHash = strings.Repeat("ab", 32)

	err := VerifyEvidenceChain(pub, entries, "")
	if err == nil {
		t.Fatal("expected verification to fail for a rewritten hash")
	}
	if !strings.Contains(err.Error(), "hash mismatch") {
		t.Errorf("error = %v, want a hash mismatch", err)
	}
}

// The wantHead check is what catches a WHOLESALE rewrite: an issuer holding
// the key rebuilds an internally-consistent chain, and only a head recorded
// externally exposes it. This is the property the docs hang the "witness
// the head" instruction on, so it gets a test.
func TestEvidenceChainHeadCatchesWholesaleRewrite(t *testing.T) {
	chain, pub, priv := chainOf(t, 3)
	witnessedHead := chain.Head()

	rebuilt := NewEvidenceChain()
	for i := range 2 { // the expensive third receipt quietly omitted
		r, err := IssueSpendReceiptAt(priv, testClaims("agent-1", int64(100*(i+1)), int64(1000*(i+1))), time.Unix(1_700_000_000, 0))
		if err != nil {
			t.Fatalf("issue: %v", err)
		}
		if _, err := rebuilt.Append(r); err != nil {
			t.Fatalf("append: %v", err)
		}
	}

	// The rebuilt chain is internally flawless — that is the point.
	if err := VerifyEvidenceChain(pub, rebuilt.Entries(), ""); err != nil {
		t.Fatalf("rebuilt chain should verify on its own: %v", err)
	}
	// Only the externally-witnessed head exposes it.
	err := VerifyEvidenceChain(pub, rebuilt.Entries(), witnessedHead)
	if err == nil {
		t.Fatal("expected the witnessed head to reject a rebuilt chain")
	}
	if !strings.Contains(err.Error(), "head") {
		t.Errorf("error = %v, want a head mismatch", err)
	}
}

func TestEvidenceChainPinsIssuer(t *testing.T) {
	chain, _, _ := chainOf(t, 2)
	otherPub, _, err := ed25519.GenerateKey(nil)
	if err != nil {
		t.Fatalf("generate key: %v", err)
	}
	// A chain signed by an attacker's own key is internally valid; pinning
	// is the only thing that rejects it.
	if err := VerifyEvidenceChain(nil, chain.Entries(), ""); err != nil {
		t.Errorf("unpinned verify: %v", err)
	}
	if err := VerifyEvidenceChain(otherPub, chain.Entries(), ""); err == nil {
		t.Error("expected pinning to reject a chain from a different issuer")
	}
}

func TestEvidenceChainRejectsUnverifiableReceipt(t *testing.T) {
	_, priv, err := ed25519.GenerateKey(nil)
	if err != nil {
		t.Fatalf("generate key: %v", err)
	}
	r, err := IssueSpendReceipt(priv, testClaims("agent-1", 100, 1000))
	if err != nil {
		t.Fatalf("issue: %v", err)
	}
	r.Claims.TotalTokens = 999999 // signature no longer covers this

	c := NewEvidenceChain()
	if _, err := c.Append(r); err == nil {
		t.Fatal("expected Append to reject a receipt whose signature does not verify")
	}
	if c.Len() != 0 {
		t.Errorf("rejected receipt still entered the chain (len %d)", c.Len())
	}
	if _, err := c.Append(nil); err == nil {
		t.Error("expected Append(nil) to error")
	}
}

func TestEvidenceChainConcurrentAppend(t *testing.T) {
	_, priv, err := ed25519.GenerateKey(nil)
	if err != nil {
		t.Fatalf("generate key: %v", err)
	}
	c := NewEvidenceChain()
	const n = 50
	done := make(chan error, n)
	for i := range n {
		go func(i int) {
			r, err := IssueSpendReceiptAt(priv, testClaims("agent-1", int64(i+1), int64(i+1)), time.Unix(1_700_000_000, 0))
			if err != nil {
				done <- err
				return
			}
			_, err = c.Append(r)
			done <- err
		}(i)
	}
	for range n {
		if err := <-done; err != nil {
			t.Fatalf("concurrent append: %v", err)
		}
	}
	// Interleaved appends must still produce ONE unbroken chain.
	if c.Len() != n {
		t.Fatalf("Len() = %d, want %d", c.Len(), n)
	}
	if err := VerifyEvidenceChain(nil, c.Entries(), c.Head()); err != nil {
		t.Errorf("chain built concurrently does not verify: %v", err)
	}
}

// ── Signer ──

// failingSigner stands in for a KMS that is down or denies the request.
type failingSigner struct{ pub ed25519.PublicKey }

func (f failingSigner) Public() ed25519.PublicKey   { return f.pub }
func (f failingSigner) Sign([]byte) ([]byte, error) { return nil, errors.New("kms unavailable") }

// wrongKeySigner stands in for a KMS pointed at the wrong key: it advertises
// one public key and signs with another.
type wrongKeySigner struct {
	pub  ed25519.PublicKey
	priv ed25519.PrivateKey
}

func (w wrongKeySigner) Public() ed25519.PublicKey { return w.pub }
func (w wrongKeySigner) Sign(p []byte) ([]byte, error) {
	return ed25519.Sign(w.priv, p), nil
}

func TestKeySignerMatchesDirectIssue(t *testing.T) {
	pub, priv, err := ed25519.GenerateKey(nil)
	if err != nil {
		t.Fatalf("generate key: %v", err)
	}
	signer, err := KeySigner(priv)
	if err != nil {
		t.Fatalf("KeySigner: %v", err)
	}
	claims := testClaims("agent-1", 100, 1000)
	at := time.Unix(1_700_000_000, 0)

	direct, err := IssueSpendReceiptAt(priv, claims, at)
	if err != nil {
		t.Fatalf("direct issue: %v", err)
	}
	viaSigner, err := IssueSpendReceiptWithSignerAt(signer, claims, at)
	if err != nil {
		t.Fatalf("signer issue: %v", err)
	}
	// Ed25519 is deterministic: the same key over the same payload must
	// produce the same signature. The signer path is a routing change, not
	// a format change.
	if string(direct.Signature) != string(viaSigner.Signature) {
		t.Error("signer path produced a different signature than the direct path")
	}
	if err := VerifySpendReceipt(pub, viaSigner); err != nil {
		t.Errorf("verify signer-issued receipt: %v", err)
	}
	if _, err := KeySigner(ed25519.PrivateKey("short")); err == nil {
		t.Error("expected KeySigner to reject a short key")
	}
}

func TestIssueWithSignerSurfacesSignerFailure(t *testing.T) {
	pub, _, err := ed25519.GenerateKey(nil)
	if err != nil {
		t.Fatalf("generate key: %v", err)
	}
	_, err = IssueSpendReceiptWithSigner(failingSigner{pub: pub}, testClaims("agent-1", 100, 1000))
	if err == nil {
		t.Fatal("expected a signer failure to surface")
	}
	if !strings.Contains(err.Error(), "kms unavailable") {
		t.Errorf("error = %v, want the underlying signer error", err)
	}
	if _, err := IssueSpendReceiptWithSigner(nil, testClaims("a", 1, 1)); err == nil {
		t.Error("expected nil signer to error")
	}
}

// A KMS signing with a key other than the one it advertises would mint
// receipts that fail verification later, in an auditor's hands. Catch it at
// issue time instead.
func TestIssueWithSignerRejectsMismatchedKey(t *testing.T) {
	pub, _, err := ed25519.GenerateKey(nil)
	if err != nil {
		t.Fatalf("generate key: %v", err)
	}
	_, otherPriv, err := ed25519.GenerateKey(nil)
	if err != nil {
		t.Fatalf("generate key: %v", err)
	}
	_, err = IssueSpendReceiptWithSigner(wrongKeySigner{pub: pub, priv: otherPriv}, testClaims("agent-1", 100, 1000))
	if err == nil {
		t.Fatal("expected a mismatched signer key to be rejected at issue time")
	}
	if !strings.Contains(err.Error(), "does not verify") {
		t.Errorf("error = %v, want a verification failure", err)
	}
}

// ── Evidence package ──

func TestEvidencePackageExportsAndVerifies(t *testing.T) {
	chain, pub, _ := chainOf(t, 3)
	pkg, err := chain.ExportEvidenceAt(time.Unix(1_700_010_000, 0))
	if err != nil {
		t.Fatalf("export: %v", err)
	}

	if pkg.EntryCount != 3 || len(pkg.Entries) != 3 {
		t.Errorf("EntryCount = %d, len(Entries) = %d, want 3", pkg.EntryCount, len(pkg.Entries))
	}
	if pkg.ChainHead != chain.Head() {
		t.Error("package head does not match the chain head")
	}
	// 100 + 200 + 300 tokens, 1000 + 2000 + 3000 micro-USD.
	if pkg.TotalTokens != 600 {
		t.Errorf("TotalTokens = %d, want 600", pkg.TotalTokens)
	}
	if pkg.TotalEstimatedCostMicroUSD != 6000 {
		t.Errorf("TotalEstimatedCostMicroUSD = %d, want 6000", pkg.TotalEstimatedCostMicroUSD)
	}
	if len(pkg.Caveats) == 0 {
		t.Error("package must carry its caveats")
	}
	if err := VerifyEvidencePackage(pub, pkg); err != nil {
		t.Errorf("verify package: %v", err)
	}
}

func TestEvidencePackageRoundTripsThroughJSON(t *testing.T) {
	chain, pub, _ := chainOf(t, 3)
	pkg, err := chain.ExportEvidenceAt(time.Unix(1_700_010_000, 0))
	if err != nil {
		t.Fatalf("export: %v", err)
	}
	data, err := MarshalEvidencePackage(pkg)
	if err != nil {
		t.Fatalf("marshal: %v", err)
	}

	// The package is a file that travels; it must verify after a round trip
	// through JSON, or the export is decorative.
	var decoded EvidencePackage
	if err := json.Unmarshal(data, &decoded); err != nil {
		t.Fatalf("unmarshal: %v", err)
	}
	if err := VerifyEvidencePackage(pub, &decoded); err != nil {
		t.Errorf("verify round-tripped package: %v", err)
	}
	if _, err := MarshalEvidencePackage(nil); err == nil {
		t.Error("expected nil package to error")
	}
}

// Totals are what an assessor reads. Editing them without touching a receipt
// must fail, or the summary is a place to hide spend.
func TestEvidencePackageDetectsEditedTotals(t *testing.T) {
	chain, pub, _ := chainOf(t, 3)
	pkg, err := chain.ExportEvidenceAt(time.Unix(1_700_010_000, 0))
	if err != nil {
		t.Fatalf("export: %v", err)
	}

	orig := pkg.TotalEstimatedCostMicroUSD
	pkg.TotalEstimatedCostMicroUSD = 1
	if err := VerifyEvidencePackage(pub, pkg); err == nil {
		t.Error("expected an edited cost total to be rejected")
	}
	pkg.TotalEstimatedCostMicroUSD = orig

	pkg.TotalTokens = 1
	if err := VerifyEvidencePackage(pub, pkg); err == nil {
		t.Error("expected an edited token total to be rejected")
	}
}

func TestEvidencePackageRejectsMalformed(t *testing.T) {
	chain, pub, _ := chainOf(t, 2)
	pkg, err := chain.ExportEvidenceAt(time.Unix(1_700_010_000, 0))
	if err != nil {
		t.Fatalf("export: %v", err)
	}

	if err := VerifyEvidencePackage(pub, nil); err == nil {
		t.Error("expected nil package to error")
	}

	bad := *pkg
	bad.V = "something-else/9"
	if err := VerifyEvidencePackage(pub, &bad); err == nil {
		t.Error("expected an unknown version to be rejected")
	}

	miscount := *pkg
	miscount.EntryCount = 99
	if err := VerifyEvidencePackage(pub, &miscount); err == nil {
		t.Error("expected an entry-count mismatch to be rejected")
	}

	rewritten := *pkg
	rewritten.ChainHead = strings.Repeat("cd", 32)
	if err := VerifyEvidencePackage(pub, &rewritten); err == nil {
		t.Error("expected a rewritten head to be rejected")
	}
}

// ── Cross-language conformance ──
//
// Rule 13: parity claims must be conformance-tested, not assumed. The entry
// hash covers a compact-JSON payload; Go, Node, and Python must produce the
// same bytes, and therefore the same hashes and head, from the same inputs.
// conformance/evidence_chain_vectors.json is the shared oracle all three
// replay (conformance.test.ts, test_conformance.py).

type evidenceChainVectors struct {
	SeedHex         string `json:"seed_hex"`
	IssuedAtUnix    int64  `json:"issued_at_unix"`
	GenesisPrevHash string `json:"genesis_prev_hash"`
	Claims          []struct {
		Key                   string `json:"key"`
		Provider              string `json:"provider"`
		Model                 string `json:"model"`
		WindowStartUnix       int64  `json:"window_start_unix"`
		WindowEndUnix         int64  `json:"window_end_unix"`
		InputTokens           int64  `json:"input_tokens"`
		OutputTokens          int64  `json:"output_tokens"`
		TotalTokens           int64  `json:"total_tokens"`
		EstimatedCostMicroUSD int64  `json:"estimated_cost_micro_usd"`
	} `json:"claims"`
	Entries []struct {
		Seq                 int64  `json:"seq"`
		PrevHash            string `json:"prev_hash"`
		ReceiptSignatureB64 string `json:"receipt_signature_b64"`
		EntryHash           string `json:"entry_hash"`
	} `json:"entries"`
	ChainHead                  string `json:"chain_head"`
	TotalTokens                int64  `json:"total_tokens"`
	TotalEstimatedCostMicroUSD int64  `json:"total_estimated_cost_micro_usd"`
}

func TestConformanceEvidenceChain(t *testing.T) {
	data, err := os.ReadFile("../../conformance/evidence_chain_vectors.json")
	if err != nil {
		t.Fatalf("read vectors: %v", err)
	}
	var v evidenceChainVectors
	if err := json.Unmarshal(data, &v); err != nil {
		t.Fatalf("parse vectors: %v", err)
	}
	if v.GenesisPrevHash != genesisPrevHash {
		t.Errorf("genesis prev_hash = %s, want %s", v.GenesisPrevHash, genesisPrevHash)
	}

	seed, err := hex.DecodeString(v.SeedHex)
	if err != nil {
		t.Fatalf("decode seed: %v", err)
	}
	priv := ed25519.NewKeyFromSeed(seed)
	issuedAt := time.Unix(v.IssuedAtUnix, 0)

	chain := NewEvidenceChain()
	for i, c := range v.Claims {
		r, err := IssueSpendReceiptAt(priv, SpendReceiptClaims{
			Key:                   c.Key,
			Provider:              c.Provider,
			Model:                 c.Model,
			WindowStartUnix:       c.WindowStartUnix,
			WindowEndUnix:         c.WindowEndUnix,
			InputTokens:           c.InputTokens,
			OutputTokens:          c.OutputTokens,
			TotalTokens:           c.TotalTokens,
			EstimatedCostMicroUSD: c.EstimatedCostMicroUSD,
		}, issuedAt)
		if err != nil {
			t.Fatalf("issue receipt %d: %v", i, err)
		}
		entry, err := chain.Append(r)
		if err != nil {
			t.Fatalf("append receipt %d: %v", i, err)
		}

		want := v.Entries[i]
		if entry.Seq != want.Seq {
			t.Errorf("entry %d seq = %d, want %d", i, entry.Seq, want.Seq)
		}
		if entry.PrevHash != want.PrevHash {
			t.Errorf("entry %d prev_hash = %s, want %s", i, entry.PrevHash, want.PrevHash)
		}
		if got := base64.StdEncoding.EncodeToString(entry.Receipt.Signature); got != want.ReceiptSignatureB64 {
			t.Errorf("entry %d signature = %s, want %s", i, got, want.ReceiptSignatureB64)
		}
		if entry.EntryHash != want.EntryHash {
			t.Errorf("entry %d hash = %s, want %s", i, entry.EntryHash, want.EntryHash)
		}
	}

	if chain.Head() != v.ChainHead {
		t.Errorf("chain head = %s, want %s", chain.Head(), v.ChainHead)
	}

	pkg, err := chain.ExportEvidenceAt(time.Unix(v.IssuedAtUnix, 0))
	if err != nil {
		t.Fatalf("export: %v", err)
	}
	if pkg.TotalTokens != v.TotalTokens {
		t.Errorf("total tokens = %d, want %d", pkg.TotalTokens, v.TotalTokens)
	}
	if pkg.TotalEstimatedCostMicroUSD != v.TotalEstimatedCostMicroUSD {
		t.Errorf("total cost = %d, want %d", pkg.TotalEstimatedCostMicroUSD, v.TotalEstimatedCostMicroUSD)
	}
}
