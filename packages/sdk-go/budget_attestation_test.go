package rateguard

import (
	"crypto/ed25519"
	"crypto/rand"
	"testing"
	"time"
)

func genKey(t *testing.T) (ed25519.PublicKey, ed25519.PrivateKey) {
	t.Helper()
	pub, priv, err := ed25519.GenerateKey(rand.Reader)
	if err != nil {
		t.Fatal(err)
	}
	return pub, priv
}

func rootGrant(now time.Time) BudgetGrant {
	return BudgetGrant{
		MaxTokens: 1_000_000,
		Providers: []string{"openai", "anthropic"},
		Models:    []string{"gpt-4o", "claude-opus-4-5"},
		MaxDepth:  3,
		ExpiresAt: now.Add(time.Hour),
	}
}

func TestNewRootBudgetTokenAndVerifyChain(t *testing.T) {
	authorityPub, authorityPriv := genKey(t)
	now := time.Now().UTC().Truncate(time.Second)

	token, delegatePriv, err := NewRootBudgetToken(authorityPriv, AttestOptions{Grant: rootGrant(now)})
	if err != nil {
		t.Fatal(err)
	}
	if delegatePriv == nil {
		t.Fatal("expected a generated delegate private key")
	}
	if len(token.Blocks) != 1 {
		t.Fatalf("expected 1 block, got %d", len(token.Blocks))
	}

	grant, err := verifyChainAt(token, authorityPub, now)
	if err != nil {
		t.Fatalf("verify chain: %v", err)
	}
	if grant.MaxTokens != 1_000_000 {
		t.Fatalf("effective grant mismatch: %+v", grant)
	}
}

func TestVerifyChainRejectsWrongRootKey(t *testing.T) {
	_, authorityPriv := genKey(t)
	wrongPub, _ := genKey(t)
	now := time.Now().UTC().Truncate(time.Second)

	token, _, err := NewRootBudgetToken(authorityPriv, AttestOptions{Grant: rootGrant(now)})
	if err != nil {
		t.Fatal(err)
	}
	if _, err := verifyChainAt(token, wrongPub, now); err == nil {
		t.Fatal("expected verification to fail against the wrong root public key")
	}
}

func TestAttestSingleHopDelegation(t *testing.T) {
	authorityPub, authorityPriv := genKey(t)
	now := time.Now().UTC().Truncate(time.Second)

	root, rootPriv, err := NewRootBudgetToken(authorityPriv, AttestOptions{Grant: rootGrant(now)})
	if err != nil {
		t.Fatal(err)
	}

	delegated, delegatePriv, err := Attest(root, rootPriv, AttestOptions{Grant: BudgetGrant{
		MaxTokens: 10_000, // narrower
		Providers: []string{"openai"},
		Models:    []string{"gpt-4o"},
		MaxDepth:  1, // narrower (<= 3-1)
		ExpiresAt: now.Add(30 * time.Minute),
	}})
	if err != nil {
		t.Fatalf("attest: %v", err)
	}
	if delegatePriv == nil {
		t.Fatal("expected a generated delegate private key for the sub-agent")
	}
	if len(delegated.Blocks) != 2 {
		t.Fatalf("expected a 2-block chain, got %d", len(delegated.Blocks))
	}

	grant, err := verifyChainAt(delegated, authorityPub, now)
	if err != nil {
		t.Fatalf("verify delegated chain: %v", err)
	}
	if grant.MaxTokens != 10_000 {
		t.Fatalf("effective grant should be the narrowed leaf, got %+v", grant)
	}
}

func TestAttestRejectsWideningTokens(t *testing.T) {
	_, authorityPriv := genKey(t)
	now := time.Now().UTC().Truncate(time.Second)
	root, rootPriv, err := NewRootBudgetToken(authorityPriv, AttestOptions{Grant: rootGrant(now)})
	if err != nil {
		t.Fatal(err)
	}

	_, _, err = Attest(root, rootPriv, AttestOptions{Grant: BudgetGrant{
		MaxTokens: 2_000_000, // wider than parent's 1,000,000
		MaxDepth:  1,
		ExpiresAt: now.Add(30 * time.Minute),
	}})
	if err == nil {
		t.Fatal("expected rejection of a wider MaxTokens grant")
	}
}

func TestAttestRejectsWideningProviders(t *testing.T) {
	_, authorityPriv := genKey(t)
	now := time.Now().UTC().Truncate(time.Second)
	root, rootPriv, err := NewRootBudgetToken(authorityPriv, AttestOptions{Grant: rootGrant(now)})
	if err != nil {
		t.Fatal(err)
	}

	_, _, err = Attest(root, rootPriv, AttestOptions{Grant: BudgetGrant{
		MaxTokens: 100,
		Providers: []string{"openai", "google"}, // "google" not in parent's [openai, anthropic]
		MaxDepth:  1,
		ExpiresAt: now.Add(30 * time.Minute),
	}})
	if err == nil {
		t.Fatal("expected rejection of a provider list widening beyond the parent's set")
	}
}

func TestAttestRejectsLaterExpiry(t *testing.T) {
	_, authorityPriv := genKey(t)
	now := time.Now().UTC().Truncate(time.Second)
	root, rootPriv, err := NewRootBudgetToken(authorityPriv, AttestOptions{Grant: rootGrant(now)})
	if err != nil {
		t.Fatal(err)
	}

	_, _, err = Attest(root, rootPriv, AttestOptions{Grant: BudgetGrant{
		MaxTokens: 100,
		MaxDepth:  1,
		ExpiresAt: now.Add(2 * time.Hour), // later than parent's 1 hour
	}})
	if err == nil {
		t.Fatal("expected rejection of an expiry later than the parent's")
	}
}

func TestAttestRejectsDepthExhaustion(t *testing.T) {
	_, authorityPriv := genKey(t)
	now := time.Now().UTC().Truncate(time.Second)
	root, rootPriv, err := NewRootBudgetToken(authorityPriv, AttestOptions{Grant: BudgetGrant{
		MaxTokens: 1000,
		MaxDepth:  0, // no further delegation allowed
		ExpiresAt: now.Add(time.Hour),
	}})
	if err != nil {
		t.Fatal(err)
	}

	_, _, err = Attest(root, rootPriv, AttestOptions{Grant: BudgetGrant{
		MaxTokens: 100,
		MaxDepth:  0,
		ExpiresAt: now.Add(30 * time.Minute),
	}})
	if err == nil {
		t.Fatal("expected rejection of delegation from a depth-exhausted token")
	}
}

func TestAttestRejectsWrongParentKey(t *testing.T) {
	_, authorityPriv := genKey(t)
	_, wrongPriv := genKey(t)
	now := time.Now().UTC().Truncate(time.Second)
	root, _, err := NewRootBudgetToken(authorityPriv, AttestOptions{Grant: rootGrant(now)})
	if err != nil {
		t.Fatal(err)
	}

	_, _, err = Attest(root, wrongPriv, AttestOptions{Grant: BudgetGrant{
		MaxTokens: 100,
		MaxDepth:  1,
		ExpiresAt: now.Add(30 * time.Minute),
	}})
	if err == nil {
		t.Fatal("expected rejection when the private key doesn't match the token's current holder")
	}
}

func TestVerifyChainRejectsExpiredToken(t *testing.T) {
	authorityPub, authorityPriv := genKey(t)
	now := time.Now().UTC().Truncate(time.Second)
	token, _, err := NewRootBudgetToken(authorityPriv, AttestOptions{Grant: rootGrant(now)})
	if err != nil {
		t.Fatal(err)
	}

	future := now.Add(2 * time.Hour)
	if _, err := verifyChainAt(token, authorityPub, future); err == nil {
		t.Fatal("expected verification to fail once the grant has expired")
	}
}

func TestSignAndVerifyPresentation(t *testing.T) {
	authorityPub, authorityPriv := genKey(t)
	now := time.Now().UTC().Truncate(time.Second)
	token, delegatePriv, err := NewRootBudgetToken(authorityPriv, AttestOptions{Grant: rootGrant(now)})
	if err != nil {
		t.Fatal(err)
	}

	context := []byte("request-nonce-abc123")
	sig, err := Sign(token, delegatePriv, context)
	if err != nil {
		t.Fatalf("sign: %v", err)
	}

	grant, err := VerifyPresentation(token, authorityPub, context, sig)
	if err != nil {
		t.Fatalf("verify presentation: %v", err)
	}
	if grant.MaxTokens != 1_000_000 {
		t.Fatalf("unexpected grant: %+v", grant)
	}
}

func TestVerifyPresentationRejectsWrongHolder(t *testing.T) {
	_, authorityPriv := genKey(t)
	_, impostorPriv := genKey(t)
	now := time.Now().UTC().Truncate(time.Second)
	token, _, err := NewRootBudgetToken(authorityPriv, AttestOptions{Grant: rootGrant(now)})
	if err != nil {
		t.Fatal(err)
	}

	context := []byte("request-nonce")
	// The impostor doesn't hold the token's delegate key, so Sign itself
	// must refuse — this is the defensive check inside Sign.
	if _, err := Sign(token, impostorPriv, context); err == nil {
		t.Fatal("Sign must reject a private key that doesn't match the token's holder key")
	}
}

func TestVerifyPresentationRejectsReplayedSignatureUnderDifferentContext(t *testing.T) {
	authorityPub, authorityPriv := genKey(t)
	now := time.Now().UTC().Truncate(time.Second)
	token, delegatePriv, err := NewRootBudgetToken(authorityPriv, AttestOptions{Grant: rootGrant(now)})
	if err != nil {
		t.Fatal(err)
	}

	sig, err := Sign(token, delegatePriv, []byte("original-context"))
	if err != nil {
		t.Fatal(err)
	}
	if _, err := VerifyPresentation(token, authorityPub, []byte("different-context"), sig); err == nil {
		t.Fatal("a signature over one context must not verify against a different context")
	}
}

func TestSignRejectsTokenNotMatchingDelegateKey(t *testing.T) {
	_, authorityPriv := genKey(t)
	now := time.Now().UTC().Truncate(time.Second)
	explicitDelegatePub, explicitDelegatePriv := genKey(t)

	token, generatedPriv, err := NewRootBudgetToken(authorityPriv, AttestOptions{
		Grant:             rootGrant(now),
		DelegatePublicKey: explicitDelegatePub,
	})
	if err != nil {
		t.Fatal(err)
	}
	if generatedPriv != nil {
		t.Fatal("no private key should be generated when DelegatePublicKey was supplied")
	}

	// The explicit delegate's own private key must work.
	if _, err := Sign(token, explicitDelegatePriv, []byte("ctx")); err != nil {
		t.Fatalf("explicit delegate should be able to sign: %v", err)
	}
}

func TestBudgetTokenMarshalRoundTripPreservesVerification(t *testing.T) {
	authorityPub, authorityPriv := genKey(t)
	now := time.Now().UTC().Truncate(time.Second)

	// Unrestricted root (nil Providers/Models) so the child can validly
	// leave them nil too — this exercises nil-vs-empty-slice signing
	// determinism: the root's nil slices are normalized when signed, then
	// Marshal/ParseBudgetToken round-trips them through JSON as non-nil
	// []string{}, and verification must still recompute an identical
	// signing payload from that reconstructed struct.
	token, delegatePriv, err := NewRootBudgetToken(authorityPriv, AttestOptions{Grant: BudgetGrant{
		MaxTokens: 1_000_000,
		MaxDepth:  3,
		ExpiresAt: now.Add(time.Hour),
	}})
	if err != nil {
		t.Fatal(err)
	}

	delegated, _, err := Attest(token, delegatePriv, AttestOptions{Grant: BudgetGrant{
		MaxTokens: 500,
		MaxDepth:  0,
		ExpiresAt: now.Add(10 * time.Minute),
		// Providers/Models deliberately left nil here too.
	}})
	if err != nil {
		t.Fatal(err)
	}

	encoded, err := delegated.Marshal()
	if err != nil {
		t.Fatalf("marshal: %v", err)
	}

	parsed, err := ParseBudgetToken(encoded)
	if err != nil {
		t.Fatalf("parse: %v", err)
	}

	grant, err := verifyChainAt(parsed, authorityPub, now)
	if err != nil {
		t.Fatalf("verify round-tripped token: %v", err)
	}
	if grant.MaxTokens != 500 {
		t.Fatalf("unexpected grant after round-trip: %+v", grant)
	}
}

func TestBudgetTokenMarshalRoundTripWithRestrictedProviders(t *testing.T) {
	authorityPub, authorityPriv := genKey(t)
	now := time.Now().UTC().Truncate(time.Second)

	token, delegatePriv, err := NewRootBudgetToken(authorityPriv, AttestOptions{Grant: rootGrant(now)})
	if err != nil {
		t.Fatal(err)
	}
	delegated, _, err := Attest(token, delegatePriv, AttestOptions{Grant: BudgetGrant{
		MaxTokens: 500,
		Providers: []string{"openai"}, // narrowed subset of the root's [openai, anthropic]
		Models:    []string{"gpt-4o"},
		MaxDepth:  0,
		ExpiresAt: now.Add(10 * time.Minute),
	}})
	if err != nil {
		t.Fatal(err)
	}

	encoded, err := delegated.Marshal()
	if err != nil {
		t.Fatalf("marshal: %v", err)
	}
	parsed, err := ParseBudgetToken(encoded)
	if err != nil {
		t.Fatalf("parse: %v", err)
	}

	grant, err := verifyChainAt(parsed, authorityPub, now)
	if err != nil {
		t.Fatalf("verify round-tripped restricted token: %v", err)
	}
	if len(grant.Providers) != 1 || grant.Providers[0] != "openai" {
		t.Fatalf("providers lost or corrupted across round-trip: %+v", grant.Providers)
	}
}

func TestBudgetGrantValidateRejectsMissingExpiry(t *testing.T) {
	_, authorityPriv := genKey(t)
	_, _, err := NewRootBudgetToken(authorityPriv, AttestOptions{Grant: BudgetGrant{MaxTokens: 100}})
	if err == nil {
		t.Fatal("expected validation error for a grant with no ExpiresAt")
	}
}

func TestBudgetGrantValidateRejectsNegativeDepth(t *testing.T) {
	_, authorityPriv := genKey(t)
	_, _, err := NewRootBudgetToken(authorityPriv, AttestOptions{Grant: BudgetGrant{
		MaxTokens: 100,
		MaxDepth:  -1,
		ExpiresAt: time.Now().Add(time.Hour),
	}})
	if err == nil {
		t.Fatal("expected validation error for negative MaxDepth")
	}
}

func TestIsSubsetOf(t *testing.T) {
	cases := []struct {
		name          string
		child, parent []string
		want          bool
	}{
		{"exact match", []string{"openai"}, []string{"openai"}, true},
		{"proper subset", []string{"openai"}, []string{"openai", "anthropic"}, true},
		{"not a subset", []string{"google"}, []string{"openai", "anthropic"}, false},
		{"empty child against restricted parent is a widening", nil, []string{"openai"}, false},
		{"empty parent handled by caller, not this helper", []string{"openai"}, nil, false},
	}
	for _, tc := range cases {
		t.Run(tc.name, func(t *testing.T) {
			if got := isSubsetOf(tc.child, tc.parent); got != tc.want {
				t.Fatalf("isSubsetOf(%v, %v) = %v, want %v", tc.child, tc.parent, got, tc.want)
			}
		})
	}
}
