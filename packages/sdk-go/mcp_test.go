package rateguard

import (
	"testing"
)

func TestMCPTools(t *testing.T) {
	sdk := New(Config{Preset: "dev"})

	tools := sdk.MCPTools()
	if len(tools) != 5 {
		t.Fatalf("expected 5 MCP tools, got %d", len(tools))
	}

	expected := map[string]bool{
		"get_rate_limit_state":      false,
		"get_token_budget":          false,
		"get_circuit_breaker_state": false,
		"check_loop":                false,
		"list_limits":               false,
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
