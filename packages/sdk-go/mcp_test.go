package rateguard

import (
	"crypto/ed25519"
	"encoding/base64"
	"testing"
)

func TestMCPTools(t *testing.T) {
	sdk := New(Config{Preset: "dev"})

	tools := sdk.MCPTools()
	if len(tools) != 7 {
		t.Fatalf("expected 7 MCP tools, got %d", len(tools))
	}

	expected := map[string]bool{
		"get_rate_limit_state":      false,
		"get_token_budget":          false,
		"get_circuit_breaker_state": false,
		"check_loop":                false,
		"list_limits":               false,
		"attest_budget":             false,
		"verify_budget":             false,
	}

	for _, tool := range tools {
		if _, ok := expected[tool.Name]; !ok {
			t.Errorf("unexpected tool: %s", tool.Name)
		}
		expected[tool.Name] = true
		if tool.Description == "" {
			t.Errorf("tool %s missing description", tool.Name)
		}
		if tool.InputSchema == nil {
			t.Errorf("tool %s missing input schema", tool.Name)
		}
	}

	for name, found := range expected {
		if !found {
			t.Errorf("expected tool %s not found", name)
		}
	}
}

func TestMCPGetRateLimitState(t *testing.T) {
	sdk := New(Config{Preset: "dev"})

	result, err := sdk.mcpGetRateLimitState(map[string]any{"key": "test-user"})
	if err != nil {
		t.Fatalf("unexpected error: %v", err)
	}

	if result["key"] != "test-user" {
		t.Errorf("expected key 'test-user', got %v", result["key"])
	}
	if allowed, ok := result["allowed"].(bool); !ok || !allowed {
		t.Errorf("expected allowed=true, got %v", result["allowed"])
	}
}

func TestMCPGetRateLimitStateDoesNotConsume(t *testing.T) {
	sdk := New(Config{Preset: "dev"})

	first, err := sdk.mcpGetRateLimitState(map[string]any{"key": "peek-user"})
	if err != nil {
		t.Fatalf("unexpected error: %v", err)
	}
	second, err := sdk.mcpGetRateLimitState(map[string]any{"key": "peek-user"})
	if err != nil {
		t.Fatalf("unexpected error: %v", err)
	}

	if first["remaining"] != second["remaining"] {
		t.Errorf("pre-flight query consumed budget: first remaining %v, second %v", first["remaining"], second["remaining"])
	}
}

func TestMCPCheckLoop(t *testing.T) {
	sdk := New(Config{Preset: "dev"})

	args := map[string]any{
		"system_prompt":  "you are a helpful agent",
		"user_input":     "book the flight",
		"sequence_depth": float64(1),
		"record":         true,
	}
	result, err := sdk.mcpCheckLoop(args)
	if err != nil {
		t.Fatalf("unexpected error: %v", err)
	}
	if allowed, _ := result["allowed"].(bool); !allowed {
		t.Fatalf("first check should be allowed, got %v", result)
	}

	// Same payload at a deeper sequence depth → loop.
	args["sequence_depth"] = float64(3)
	result, err = sdk.mcpCheckLoop(args)
	if err != nil {
		t.Fatalf("unexpected error: %v", err)
	}
	if allowed, _ := result["allowed"].(bool); allowed {
		t.Fatalf("repeat at higher depth should be blocked, got %v", result)
	}
	if result["reason"] == nil {
		t.Error("blocked check should include a reason")
	}
}

// TestMCPCheckLoopDefaultsToPeekNotRecord reproduces a real gap: the tool's
// own description says "Does not record the fingerprint unless 'record' is
// true," but the handler defaulted 'record' to true when the field was
// omitted — a caller trusting the tool's own docs and calling it as a bare
// pre-flight check was silently mutating loop-detector state on every call
// (AGENTS.md rule 5: pre-flight queries must never consume/record).
func TestMCPCheckLoopDefaultsToPeekNotRecord(t *testing.T) {
	sdk := New(Config{Preset: "dev"})

	args := map[string]any{
		"system_prompt":  "you are a helpful agent",
		"user_input":     "book the flight",
		"sequence_depth": float64(1),
		// 'record' deliberately omitted — must behave as a passive peek.
	}
	if _, err := sdk.mcpCheckLoop(args); err != nil {
		t.Fatalf("first bare check: unexpected error: %v", err)
	}

	// Same fingerprint at a deeper sequence depth: if the first call had
	// been recorded (the bug), this trips "loop detected". Since the
	// first call must NOT have recorded anything, this must still report
	// allowed — nothing exists yet for this fingerprint to compare against.
	args["sequence_depth"] = float64(3)
	result, err := sdk.mcpCheckLoop(args)
	if err != nil {
		t.Fatalf("second bare check: unexpected error: %v", err)
	}
	if allowed, _ := result["allowed"].(bool); !allowed {
		t.Fatalf("bare checks (no 'record') must never trip the loop detector, got %v", result)
	}
}

func TestMCPGetCircuitBreakerState(t *testing.T) {
	sdk := New(Config{Preset: "dev"})

	result, err := sdk.mcpGetCircuitBreakerState(map[string]any{"upstream_id": "openai"})
	if err != nil {
		t.Fatalf("unexpected error: %v", err)
	}

	state, ok := result["state"].(string)
	if !ok {
		t.Fatalf("expected state to be string, got %T", result["state"])
	}
	if state != "closed" {
		t.Errorf("expected state 'closed', got %s", state)
	}
}

func TestMCPListLimits(t *testing.T) {
	sdk := New(Config{Preset: "dev"})

	result, err := sdk.mcpListLimits(map[string]any{"key": "test-user"})
	if err != nil {
		t.Fatalf("unexpected error: %v", err)
	}

	if result["key"] != "test-user" {
		t.Errorf("expected key 'test-user', got %v", result["key"])
	}
	if _, ok := result["rate_limit"]; !ok {
		t.Error("expected rate_limit in result")
	}
	if _, ok := result["circuit_breaker"]; !ok {
		t.Error("expected circuit_breaker in result")
	}
	if _, ok := result["preset"]; !ok {
		t.Error("expected preset in result")
	}
}

func TestMCPCall(t *testing.T) {
	sdk := New(Config{Preset: "dev"})

	result, err := sdk.MCPCall("get_rate_limit_state", map[string]any{"key": "test"})
	if err != nil {
		t.Fatalf("unexpected error: %v", err)
	}
	if len(result.Content) != 1 {
		t.Fatalf("expected 1 content block, got %d", len(result.Content))
	}
	if result.Content[0].Type != "text" {
		t.Errorf("expected content type 'text', got %s", result.Content[0].Type)
	}

	_, err = sdk.MCPCall("nonexistent", nil)
	if err == nil {
		t.Error("expected error for unknown tool")
	}
}

func TestMCPAttestBudgetMintsRootToken(t *testing.T) {
	sdk := New(Config{Preset: "dev"})
	_, authorityPriv := genKey(t)

	result, err := sdk.mcpAttestBudget(map[string]any{
		"signing_key":        base64.StdEncoding.EncodeToString(authorityPriv),
		"max_tokens":         float64(100000),
		"max_depth":          float64(2),
		"expires_in_seconds": float64(3600),
	})
	if err != nil {
		t.Fatalf("unexpected error: %v", err)
	}
	if result["error"] != nil {
		t.Fatalf("unexpected result error: %v", result["error"])
	}
	if result["token"] == nil || result["token"] == "" {
		t.Fatal("expected a non-empty token")
	}
	if result["delegate_private_key"] == nil {
		t.Fatal("expected a generated delegate_private_key when delegate_public_key was omitted")
	}
	if depth, _ := result["depth"].(int); depth != 1 {
		t.Fatalf("expected depth 1 for a root token, got %v", result["depth"])
	}
}

func TestMCPAttestBudgetRejectsMissingSigningKey(t *testing.T) {
	sdk := New(Config{Preset: "dev"})
	_, err := sdk.mcpAttestBudget(map[string]any{
		"max_tokens":         float64(100),
		"max_depth":          float64(1),
		"expires_in_seconds": float64(60),
	})
	if err == nil {
		t.Fatal("expected an error when signing_key is missing")
	}
}

func TestMCPAttestBudgetDelegationNarrowsAndVerifies(t *testing.T) {
	sdk := New(Config{Preset: "dev"})
	authorityPub, authorityPriv := genKey(t)

	root, err := sdk.mcpAttestBudget(map[string]any{
		"signing_key":        base64.StdEncoding.EncodeToString(authorityPriv),
		"max_tokens":         float64(100000),
		"providers":          []any{"openai", "anthropic"},
		"max_depth":          float64(2),
		"expires_in_seconds": float64(3600),
	})
	if err != nil || root["error"] != nil {
		t.Fatalf("mint root: err=%v result=%v", err, root)
	}
	rootPrivKey := root["delegate_private_key"].(string)

	delegated, err := sdk.mcpAttestBudget(map[string]any{
		"signing_key":        rootPrivKey,
		"parent_token":       root["token"],
		"max_tokens":         float64(1000),
		"providers":          []any{"openai"},
		"max_depth":          float64(0),
		"expires_in_seconds": float64(60),
	})
	if err != nil {
		t.Fatalf("unexpected error: %v", err)
	}
	if delegated["error"] != nil {
		t.Fatalf("unexpected delegation error: %v", delegated["error"])
	}
	if depth, _ := delegated["depth"].(int); depth != 2 {
		t.Fatalf("expected a 2-block chain after delegation, got %v", delegated["depth"])
	}

	verify, err := sdk.mcpVerifyBudget(map[string]any{
		"token":           delegated["token"],
		"root_public_key": base64.StdEncoding.EncodeToString(authorityPub),
	})
	if err != nil {
		t.Fatalf("unexpected error: %v", err)
	}
	if v, _ := verify["valid"].(bool); !v {
		t.Fatalf("expected the delegated chain to verify, got %+v", verify)
	}
	grant, _ := verify["effective_grant"].(map[string]any)
	if grant["max_tokens"] != int64(1000) {
		t.Fatalf("expected effective_grant to reflect the narrowed leaf, got %+v", grant)
	}
}

func TestMCPAttestBudgetRejectsWideningDelegation(t *testing.T) {
	sdk := New(Config{Preset: "dev"})
	_, authorityPriv := genKey(t)

	root, err := sdk.mcpAttestBudget(map[string]any{
		"signing_key":        base64.StdEncoding.EncodeToString(authorityPriv),
		"max_tokens":         float64(1000),
		"max_depth":          float64(2),
		"expires_in_seconds": float64(3600),
	})
	if err != nil || root["error"] != nil {
		t.Fatalf("mint root: err=%v result=%v", err, root)
	}

	delegated, err := sdk.mcpAttestBudget(map[string]any{
		"signing_key":        root["delegate_private_key"],
		"parent_token":       root["token"],
		"max_tokens":         float64(999999), // wider than the parent's 1000
		"max_depth":          float64(0),
		"expires_in_seconds": float64(60),
	})
	if err != nil {
		t.Fatalf("unexpected Go error (widening is an in-band result, not a Go error): %v", err)
	}
	if delegated["error"] == nil {
		t.Fatal("expected an in-band error result for a widening delegation attempt")
	}
}

func TestMCPVerifyBudgetRejectsWrongRootKey(t *testing.T) {
	sdk := New(Config{Preset: "dev"})
	_, authorityPriv := genKey(t)
	wrongPub, _ := genKey(t)

	root, err := sdk.mcpAttestBudget(map[string]any{
		"signing_key":        base64.StdEncoding.EncodeToString(authorityPriv),
		"max_tokens":         float64(1000),
		"max_depth":          float64(1),
		"expires_in_seconds": float64(3600),
	})
	if err != nil || root["error"] != nil {
		t.Fatalf("mint root: err=%v result=%v", err, root)
	}

	verify, err := sdk.mcpVerifyBudget(map[string]any{
		"token":           root["token"],
		"root_public_key": base64.StdEncoding.EncodeToString(wrongPub),
	})
	if err != nil {
		t.Fatalf("unexpected Go error: %v", err)
	}
	if v, _ := verify["valid"].(bool); v {
		t.Fatal("expected verification to fail against the wrong root public key")
	}
}

func TestMCPVerifyBudgetWithProofOfPossession(t *testing.T) {
	sdk := New(Config{Preset: "dev"})
	authorityPub, authorityPriv := genKey(t)

	root, err := sdk.mcpAttestBudget(map[string]any{
		"signing_key":        base64.StdEncoding.EncodeToString(authorityPriv),
		"max_tokens":         float64(1000),
		"max_depth":          float64(1),
		"expires_in_seconds": float64(3600),
	})
	if err != nil || root["error"] != nil {
		t.Fatalf("mint root: err=%v result=%v", err, root)
	}

	token, err := ParseBudgetToken(root["token"].(string))
	if err != nil {
		t.Fatal(err)
	}
	delegatePrivBytes, err := base64.StdEncoding.DecodeString(root["delegate_private_key"].(string))
	if err != nil {
		t.Fatal(err)
	}
	sig, err := Sign(token, ed25519.PrivateKey(delegatePrivBytes), []byte("nonce-1"))
	if err != nil {
		t.Fatal(err)
	}

	verify, err := sdk.mcpVerifyBudget(map[string]any{
		"token":           root["token"],
		"root_public_key": base64.StdEncoding.EncodeToString(authorityPub),
		"context":         "nonce-1",
		"signature":       base64.StdEncoding.EncodeToString(sig),
	})
	if err != nil {
		t.Fatalf("unexpected error: %v", err)
	}
	if v, _ := verify["valid"].(bool); !v {
		t.Fatalf("expected valid presentation, got %+v", verify)
	}
	if pop, _ := verify["proof_of_possession_verified"].(bool); !pop {
		t.Fatal("expected proof_of_possession_verified to be true when context+signature verify")
	}
}

func TestMCPVerifyBudgetWithoutProofDoesNotClaimIt(t *testing.T) {
	sdk := New(Config{Preset: "dev"})
	authorityPub, authorityPriv := genKey(t)

	root, err := sdk.mcpAttestBudget(map[string]any{
		"signing_key":        base64.StdEncoding.EncodeToString(authorityPriv),
		"max_tokens":         float64(1000),
		"max_depth":          float64(1),
		"expires_in_seconds": float64(3600),
	})
	if err != nil || root["error"] != nil {
		t.Fatalf("mint root: err=%v result=%v", err, root)
	}

	verify, err := sdk.mcpVerifyBudget(map[string]any{
		"token":           root["token"],
		"root_public_key": base64.StdEncoding.EncodeToString(authorityPub),
	})
	if err != nil {
		t.Fatalf("unexpected error: %v", err)
	}
	if v, _ := verify["valid"].(bool); !v {
		t.Fatalf("expected the chain itself to be valid, got %+v", verify)
	}
	if pop, _ := verify["proof_of_possession_verified"].(bool); pop {
		t.Fatal("proof_of_possession_verified must be false when no context/signature were supplied")
	}
}
