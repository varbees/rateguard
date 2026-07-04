// Command budget-attestation walks through a two-hop delegation: an
// orchestrator mints a root budget, delegates a narrower slice to a
// sub-agent, and the sub-agent proves possession before spending it.
//
// Run: go run ./examples/budget-attestation
package main

import (
	"crypto/ed25519"
	"crypto/rand"
	"fmt"
	"time"

	rateguard "github.com/varbees/rateguard/packages/sdk-go"
)

func main() {
	// The orchestrator's long-term signing key. Every verifier in this
	// system must already trust this public key out-of-band — the same way
	// a TLS client trusts a CA root certificate.
	authorityPub, authorityPriv, err := ed25519.GenerateKey(rand.Reader)
	must(err)
	fmt.Println("1. Orchestrator's root authority key generated.")
	fmt.Println("   (Every verifier trusts this public key out-of-band, like a CA root.)")

	// Mint the root budget: 100K tokens, OpenAI/Anthropic only, up to 3 more
	// hops of delegation, expires in an hour.
	root, orchestratorPriv, err := rateguard.NewRootBudgetToken(authorityPriv, rateguard.AttestOptions{
		Grant: rateguard.BudgetGrant{
			MaxTokens: 100_000,
			Providers: []string{"openai", "anthropic"},
			MaxDepth:  3,
			ExpiresAt: time.Now().Add(time.Hour),
		},
	})
	must(err)
	fmt.Printf("\n2. Root budget minted: 100,000 tokens, openai+anthropic, depth 3, expires in 1h.\n")

	// Delegate a narrower slice to a sub-agent: 10K tokens, OpenAI only, no
	// further delegation, expires in 10 minutes. Every field is equal to or
	// tighter than the parent's — that's enforced, not just convention.
	delegated, subAgentPriv, err := rateguard.Attest(root, orchestratorPriv, rateguard.AttestOptions{
		Grant: rateguard.BudgetGrant{
			MaxTokens: 10_000,
			Providers: []string{"openai"},
			MaxDepth:  0,
			ExpiresAt: time.Now().Add(10 * time.Minute),
		},
	})
	must(err)
	fmt.Println("3. Delegated a narrower slice to a sub-agent: 10,000 tokens, openai only,")
	fmt.Println("   depth 0 (may not delegate further), expires in 10m.")

	// Try to widen instead of narrow — this must be rejected.
	_, _, err = rateguard.Attest(root, orchestratorPriv, rateguard.AttestOptions{
		Grant: rateguard.BudgetGrant{
			MaxTokens: 999_999, // wider than the root's 100,000
			MaxDepth:  3,
			ExpiresAt: time.Now().Add(time.Hour),
		},
	})
	fmt.Printf("\n4. Attempted to delegate a WIDER grant (999,999 tokens) — rejected: %v\n", err)

	// The sub-agent hands the token to a verifier along with a signature
	// over some context (a nonce, a request digest) — proof it actually
	// holds the delegated key, not just a copy of the token's public data.
	context := []byte("request-id-8f3c1a")
	sig, err := rateguard.Sign(delegated, subAgentPriv, context)
	must(err)

	grant, err := rateguard.VerifyPresentation(delegated, authorityPub, context, sig)
	must(err)
	fmt.Printf("\n5. Verifier checked the full chain + proof of possession: VALID.\n")
	fmt.Printf("   Effective grant: %d tokens, providers=%v, depth=%d\n", grant.MaxTokens, grant.Providers, grant.MaxDepth)

	// Serialize for a real handoff (MCP tool args, an HTTP header, a file).
	encoded, err := delegated.Marshal()
	must(err)
	fmt.Printf("\n6. Serialized token (%d bytes) — this is what actually crosses a process boundary:\n", len(encoded))
	fmt.Printf("   %.100s...\n", encoded)

	// A verifier who only has the token (no signature) can inspect its terms
	// but must not treat that as proof of who is presenting it.
	_, err = rateguard.VerifyChain(delegated, authorityPub)
	must(err)
	fmt.Println("\n7. Chain-only check (no context/signature) confirms the terms are well-formed")
	fmt.Println("   and unexpired — but this alone does NOT prove who is presenting the token.")
}

func must(err error) {
	if err != nil {
		panic(err)
	}
}
