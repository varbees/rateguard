package rateguard

import (
	"crypto/ed25519"
	"crypto/rand"
	"encoding/base64"
	"encoding/json"
	"fmt"
	"time"
)

// ── Budget attestation ──
//
// Multi-agent systems delegate: an orchestrator hands a sub-task to a
// tool-calling agent, which may hand a further sub-task to another agent,
// possibly across process or trust boundaries. Today that delegation carries
// no enforceable budget — the sub-agent either trusts the orchestrator's
// word about its spending limit, or the orchestrator has to stay in the loop
// for every call. Budget attestation closes that gap with a cryptographic
// token, in the shape the IETF Agent Identity Protocol draft
// (draft-prakash-aip, draft-singla-agent-identity-protocol) is standardizing
// around: a chain of Ed25519-signed blocks where each hop can only NARROW
// the grant it received — less budget, fewer providers, less delegation
// depth, an earlier expiry — never widen it.
//
// This is RateGuard's own extension, not a claim of AIP compliance — the
// IETF spec is still draft-level. v0.1 scope: single-hop delegation,
// verified end-to-end, is the primary target; the chain design supports
// multiple hops because attenuation only works if it composes, but longer
// chains are unproven in production here and should be adopted cautiously.
//
// Trust model: verifiers must already know the ROOT authority's Ed25519
// public key out-of-band (the same way a TLS client trusts a CA root
// certificate) — RateGuard does not provide key distribution or a registry.
// Everything after the root is self-contained: each block carries the next
// hop's public key, so verification never needs to phone home.
//
// A token is data — anyone who intercepts a serialized token can read its
// terms, but using it to authorize a call requires signing a
// verifier-supplied context with the current holder's PRIVATE key (see
// Sign/VerifyPresentation). Chain-only verification (VerifyChain) proves the
// terms are well-formed and unexpired; it does not prove the presenter is
// the legitimate holder.

// BudgetGrant is the resource constraint one link of a budget token carries.
type BudgetGrant struct {
	// MaxTokens is the token budget available under this grant. <= 0 means
	// unlimited — but a child grant may only be unlimited if its parent is
	// also unlimited; once a chain sets a limit, no descendant can remove it.
	MaxTokens int64
	// Providers restricts which LLM providers this grant covers. Empty means
	// any provider. A child may narrow an unrestricted parent to a specific
	// list, but may never widen a restricted parent's list.
	Providers []string
	// Models restricts which models this grant covers, same rules as Providers.
	Models []string
	// MaxDepth is how many further delegations are allowed starting from
	// this block (each delegation consumes exactly one unit). 0 means this
	// holder may use the grant but may not delegate it further.
	MaxDepth int
	// ExpiresAt is mandatory — an unexpiring budget token is a standing
	// liability. A child's expiry must be at or before its parent's.
	ExpiresAt time.Time
}

func (g BudgetGrant) validate() error {
	if g.MaxDepth < 0 {
		return fmt.Errorf("rateguard: budget grant MaxDepth must be >= 0")
	}
	if g.ExpiresAt.IsZero() {
		return fmt.Errorf("rateguard: budget grant ExpiresAt must be set")
	}
	return nil
}

// narrows reports whether g is a valid attenuation of parent: every field
// equal to or more restrictive, never looser.
func (g BudgetGrant) narrows(parent BudgetGrant) bool {
	if parent.MaxTokens > 0 {
		if g.MaxTokens <= 0 || g.MaxTokens > parent.MaxTokens {
			return false
		}
	}
	if len(parent.Providers) > 0 && !isSubsetOf(g.Providers, parent.Providers) {
		return false
	}
	if len(parent.Models) > 0 && !isSubsetOf(g.Models, parent.Models) {
		return false
	}
	if g.MaxDepth > parent.MaxDepth-1 {
		return false
	}
	if g.ExpiresAt.After(parent.ExpiresAt) {
		return false
	}
	return true
}

// isSubsetOf reports whether every entry in child appears in parent. An
// empty child against a restricted (non-empty) parent is a widening —
// "any provider" is looser than a specific list — so it is rejected.
func isSubsetOf(child, parent []string) bool {
	if len(child) == 0 {
		return false
	}
	allowed := make(map[string]bool, len(parent))
	for _, p := range parent {
		allowed[p] = true
	}
	for _, c := range child {
		if !allowed[c] {
			return false
		}
	}
	return true
}

func normalizeStrings(s []string) []string {
	if s == nil {
		return []string{}
	}
	return s
}

// budgetBlock is one link of a BudgetToken's chain.
type budgetBlock struct {
	Grant             BudgetGrant
	DelegatePublicKey ed25519.PublicKey // holder of this block onward
	Signature         []byte            // over signingPayload(Grant, DelegatePublicKey), made by the previous holder's private key (or the root authority key for block 0)
}

// BudgetToken is a chain of budget delegations, each narrower than the last.
type BudgetToken struct {
	Blocks []budgetBlock
}

// signingPayload is the canonical, deterministic byte encoding a block's
// signature commits to. Slices are normalized (nil == empty) and timestamps
// are normalized to UTC so the same logical grant always signs and verifies
// identically regardless of how it was constructed or how it round-tripped
// through Marshal/ParseBudgetToken.
func signingPayload(grant BudgetGrant, delegatePub ed25519.PublicKey) []byte {
	payload := struct {
		MaxTokens         int64     `json:"max_tokens"`
		Providers         []string  `json:"providers"`
		Models            []string  `json:"models"`
		MaxDepth          int       `json:"max_depth"`
		ExpiresAt         time.Time `json:"expires_at"`
		DelegatePublicKey string    `json:"delegate_public_key"`
	}{
		MaxTokens:         grant.MaxTokens,
		Providers:         normalizeStrings(grant.Providers),
		Models:            normalizeStrings(grant.Models),
		MaxDepth:          grant.MaxDepth,
		ExpiresAt:         grant.ExpiresAt.UTC(),
		DelegatePublicKey: base64.StdEncoding.EncodeToString(delegatePub),
	}
	// Marshal of this fixed, map-free struct cannot fail.
	encoded, _ := json.Marshal(payload)
	return encoded
}

func resolveDelegateKey(existing ed25519.PublicKey) (ed25519.PublicKey, ed25519.PrivateKey, error) {
	if existing != nil {
		return existing, nil, nil // caller already holds the matching private key
	}
	pub, priv, err := ed25519.GenerateKey(rand.Reader)
	if err != nil {
		return nil, nil, fmt.Errorf("rateguard: generate delegate keypair: %w", err)
	}
	return pub, priv, nil
}

// AttestOptions configures a new root grant or a narrowed delegation.
type AttestOptions struct {
	Grant BudgetGrant
	// DelegatePublicKey: if set, the token is issued to this
	// externally-generated public key — the delegate generated its own
	// keypair and shared only the public half, so its private key never
	// transits through the delegator. This is the recommended pattern for
	// multi-hop chains. If nil, a fresh keypair is generated and the private
	// key is returned to the caller — the convenience path for a delegator
	// bootstrapping a sub-agent it is about to spawn itself.
	DelegatePublicKey ed25519.PublicKey
}

// NewRootBudgetToken mints the genesis block of a budget token, signed by
// authorityPrivateKey — the long-term key every verifier must already trust
// out-of-band as the root of authority. Returns the token and, when
// opts.DelegatePublicKey is nil, the freshly generated delegate private key.
func NewRootBudgetToken(authorityPrivateKey ed25519.PrivateKey, opts AttestOptions) (*BudgetToken, ed25519.PrivateKey, error) {
	if err := opts.Grant.validate(); err != nil {
		return nil, nil, err
	}
	delegatePub, delegatePriv, err := resolveDelegateKey(opts.DelegatePublicKey)
	if err != nil {
		return nil, nil, err
	}
	sig := ed25519.Sign(authorityPrivateKey, signingPayload(opts.Grant, delegatePub))
	return &BudgetToken{
		Blocks: []budgetBlock{{Grant: opts.Grant, DelegatePublicKey: delegatePub, Signature: sig}},
	}, delegatePriv, nil
}

// Attest extends token with a new, narrower delegation. parentPrivateKey
// must correspond to token's current last-block DelegatePublicKey — proof
// that the caller is the legitimate current holder, not just anyone who saw
// the token. Returns the extended token and, when opts.DelegatePublicKey is
// nil, the freshly generated next-holder private key.
func Attest(token *BudgetToken, parentPrivateKey ed25519.PrivateKey, opts AttestOptions) (*BudgetToken, ed25519.PrivateKey, error) {
	if token == nil || len(token.Blocks) == 0 {
		return nil, nil, fmt.Errorf("rateguard: cannot attest from an empty token")
	}
	last := token.Blocks[len(token.Blocks)-1]
	parentPub, ok := parentPrivateKey.Public().(ed25519.PublicKey)
	if !ok || !last.DelegatePublicKey.Equal(parentPub) {
		return nil, nil, fmt.Errorf("rateguard: parent private key does not match the token's current holder key")
	}
	if err := opts.Grant.validate(); err != nil {
		return nil, nil, err
	}
	if !opts.Grant.narrows(last.Grant) {
		return nil, nil, fmt.Errorf("rateguard: new grant does not narrow the parent grant")
	}

	delegatePub, delegatePriv, err := resolveDelegateKey(opts.DelegatePublicKey)
	if err != nil {
		return nil, nil, err
	}
	sig := ed25519.Sign(parentPrivateKey, signingPayload(opts.Grant, delegatePub))

	extended := make([]budgetBlock, len(token.Blocks)+1)
	copy(extended, token.Blocks)
	extended[len(token.Blocks)] = budgetBlock{Grant: opts.Grant, DelegatePublicKey: delegatePub, Signature: sig}
	return &BudgetToken{Blocks: extended}, delegatePriv, nil
}

// VerifyChain validates a token's signature chain against rootPublicKey and
// checks every block narrows its parent and none has expired. It returns the
// effective grant (the final, narrowest block) on success.
//
// This does NOT prove the presenter legitimately holds the token — a token
// is data, readable by anyone who intercepts it. Use VerifyPresentation for
// an authorization decision.
func VerifyChain(token *BudgetToken, rootPublicKey ed25519.PublicKey) (BudgetGrant, error) {
	return verifyChainAt(token, rootPublicKey, time.Now())
}

func verifyChainAt(token *BudgetToken, rootPublicKey ed25519.PublicKey, now time.Time) (BudgetGrant, error) {
	if token == nil || len(token.Blocks) == 0 {
		return BudgetGrant{}, fmt.Errorf("rateguard: empty budget token")
	}

	var effective BudgetGrant
	signer := rootPublicKey
	for i, block := range token.Blocks {
		if !ed25519.Verify(signer, signingPayload(block.Grant, block.DelegatePublicKey), block.Signature) {
			return BudgetGrant{}, fmt.Errorf("rateguard: budget token block %d: invalid signature", i)
		}
		if i > 0 && !block.Grant.narrows(effective) {
			return BudgetGrant{}, fmt.Errorf("rateguard: budget token block %d: grant does not narrow its parent", i)
		}
		if now.After(block.Grant.ExpiresAt) {
			return BudgetGrant{}, fmt.Errorf("rateguard: budget token block %d: expired at %s", i, block.Grant.ExpiresAt)
		}
		effective = block.Grant
		signer = block.DelegatePublicKey
	}
	return effective, nil
}

// Sign produces a proof-of-possession signature over context using
// holderPrivateKey. context is typically a verifier-supplied nonce or a
// digest of the request being authorized — signing it binds this specific
// use to this specific holder, so a captured token alone cannot be replayed
// against a different challenge.
func Sign(token *BudgetToken, holderPrivateKey ed25519.PrivateKey, context []byte) ([]byte, error) {
	if token == nil || len(token.Blocks) == 0 {
		return nil, fmt.Errorf("rateguard: cannot sign with an empty token")
	}
	last := token.Blocks[len(token.Blocks)-1]
	holderPub, ok := holderPrivateKey.Public().(ed25519.PublicKey)
	if !ok || !last.DelegatePublicKey.Equal(holderPub) {
		return nil, fmt.Errorf("rateguard: private key does not match the token's current holder key")
	}
	return ed25519.Sign(holderPrivateKey, context), nil
}

// VerifyPresentation performs a full authorization check: the chain must be
// valid (see VerifyChain) AND signature must be a valid proof-of-possession
// over context, made by the token's current holder key. This is the check a
// receiving agent or MCP tool should run before honoring a budget token.
func VerifyPresentation(token *BudgetToken, rootPublicKey ed25519.PublicKey, context, signature []byte) (BudgetGrant, error) {
	grant, err := VerifyChain(token, rootPublicKey)
	if err != nil {
		return BudgetGrant{}, err
	}
	last := token.Blocks[len(token.Blocks)-1]
	if !ed25519.Verify(last.DelegatePublicKey, context, signature) {
		return BudgetGrant{}, fmt.Errorf("rateguard: proof-of-possession signature invalid")
	}
	return grant, nil
}

// ── Wire encoding ──
// MCP tool args, HTTP headers, and inter-process handoffs all need a
// string-safe form. Marshal/ParseBudgetToken round-trip through the same
// canonical field set signingPayload uses, so a verified token stays
// verifiable after transport.

type wireBudgetGrant struct {
	MaxTokens int64     `json:"max_tokens"`
	Providers []string  `json:"providers"`
	Models    []string  `json:"models"`
	MaxDepth  int       `json:"max_depth"`
	ExpiresAt time.Time `json:"expires_at"`
}

type wireBudgetBlock struct {
	Grant             wireBudgetGrant `json:"grant"`
	DelegatePublicKey string          `json:"delegate_public_key"`
	Signature         string          `json:"signature"`
}

// Marshal encodes the token as compact JSON text.
func (t *BudgetToken) Marshal() (string, error) {
	if t == nil {
		return "", fmt.Errorf("rateguard: cannot marshal a nil budget token")
	}
	wire := make([]wireBudgetBlock, len(t.Blocks))
	for i, b := range t.Blocks {
		wire[i] = wireBudgetBlock{
			Grant: wireBudgetGrant{
				MaxTokens: b.Grant.MaxTokens,
				Providers: normalizeStrings(b.Grant.Providers),
				Models:    normalizeStrings(b.Grant.Models),
				MaxDepth:  b.Grant.MaxDepth,
				ExpiresAt: b.Grant.ExpiresAt.UTC(),
			},
			DelegatePublicKey: base64.StdEncoding.EncodeToString(b.DelegatePublicKey),
			Signature:         base64.StdEncoding.EncodeToString(b.Signature),
		}
	}
	encoded, err := json.Marshal(wire)
	if err != nil {
		return "", fmt.Errorf("rateguard: marshal budget token: %w", err)
	}
	return string(encoded), nil
}

// ParseBudgetToken decodes a token previously produced by Marshal.
func ParseBudgetToken(s string) (*BudgetToken, error) {
	var wire []wireBudgetBlock
	if err := json.Unmarshal([]byte(s), &wire); err != nil {
		return nil, fmt.Errorf("rateguard: parse budget token: %w", err)
	}
	blocks := make([]budgetBlock, len(wire))
	for i, w := range wire {
		delegatePub, err := base64.StdEncoding.DecodeString(w.DelegatePublicKey)
		if err != nil {
			return nil, fmt.Errorf("rateguard: parse budget token block %d delegate key: %w", i, err)
		}
		sig, err := base64.StdEncoding.DecodeString(w.Signature)
		if err != nil {
			return nil, fmt.Errorf("rateguard: parse budget token block %d signature: %w", i, err)
		}
		blocks[i] = budgetBlock{
			Grant: BudgetGrant{
				MaxTokens: w.Grant.MaxTokens,
				Providers: w.Grant.Providers,
				Models:    w.Grant.Models,
				MaxDepth:  w.Grant.MaxDepth,
				ExpiresAt: w.Grant.ExpiresAt,
			},
			DelegatePublicKey: delegatePub,
			Signature:         sig,
		}
	}
	return &BudgetToken{Blocks: blocks}, nil
}
