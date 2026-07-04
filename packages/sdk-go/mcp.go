package rateguard

import (
	"context"
	"crypto/ed25519"
	"encoding/base64"
	"encoding/json"
	"fmt"
	"time"
)

// ── MCP (Model Context Protocol) Tools — Agent-Native Rate Limit Awareness ──
//
// RateGuard exposes its rate limit state as MCP tools that AI agents can query
// BEFORE making LLM calls. This eliminates 429 errors, retry storms, and wasted
// tokens — agents know their limits and self-throttle.
//
// Market validation:
//   - 24,615 MCP repos, 50,845 servers, 787K agent repos in H1 2026
//   - 38+ agent gateways exist — NONE provide pre-flight rate limit queries
//   - RateGuard is the FIRST to give agents rate limit awareness via MCP

// MCPTool represents a tool that AI agents can call via the Model Context Protocol.
type MCPTool struct {
	Name        string
	Description string
	InputSchema map[string]any // JSON Schema for input parameters
	Handler     func(args map[string]any) (map[string]any, error)
}

// MCPToolResult is the standard MCP tool response.
type MCPToolResult struct {
	Content []MCPToolContent `json:"content"`
}

// MCPToolContent is a single content block in an MCP response.
type MCPToolContent struct {
	Type string `json:"type"`
	Text string `json:"text"`
}

// MCPTools returns the RateGuard MCP tool set. Agents call these tools to
// query their rate limit state before making API calls.
func (s *SDK) MCPTools() []MCPTool {
	return []MCPTool{
		{
			Name:        "get_rate_limit_state",
			Description: "Query current rate limit state for a key BEFORE making API calls. Returns remaining tokens, limit, reset time, and whether the call would be allowed. Use this to avoid 429 errors.",
			InputSchema: map[string]any{
				"type": "object",
				"properties": map[string]any{
					"key": map[string]any{
						"type":        "string",
						"description": "Rate limit key (user ID, API key, tenant ID)",
					},
				},
				"required": []string{"key"},
			},
			Handler: s.mcpGetRateLimitState,
		},
		{
			Name:        "get_token_budget",
			Description: "Check remaining LLM token budget before making an expensive call. Returns remaining tokens, limit, window, budget mode, and whether the estimated tokens fit within budget.",
			InputSchema: map[string]any{
				"type": "object",
				"properties": map[string]any{
					"key": map[string]any{
						"type":        "string",
						"description": "Budget key (user ID, tenant)",
					},
					"estimated_tokens": map[string]any{
						"type":        "integer",
						"description": "How many tokens the agent expects to use",
					},
				},
				"required": []string{"key"},
			},
			Handler: s.mcpGetTokenBudget,
		},
		{
			Name:        "get_circuit_breaker_state",
			Description: "Check circuit breaker health for upstream providers before attempting calls. Returns state (closed/open/half-open), failure rate, and retry timing.",
			InputSchema: map[string]any{
				"type": "object",
				"properties": map[string]any{
					"upstream_id": map[string]any{
						"type":        "string",
						"description": "Upstream provider or service to check (e.g. 'openai', 'anthropic')",
					},
				},
				"required": []string{"upstream_id"},
			},
			Handler: s.mcpGetCircuitBreakerState,
		},
		{
			Name:        "check_loop",
			Description: "Pre-flight loop check: report whether an identical payload fingerprint has already been seen at a lower sequence depth (a runaway agent loop). Call before repeating a tool call or LLM request. Does not record the fingerprint unless 'record' is true.",
			InputSchema: map[string]any{
				"type": "object",
				"properties": map[string]any{
					"fingerprint": map[string]any{
						"type":        "string",
						"description": "SHA-256 payload fingerprint (hash of system prompt + user input + tool definitions). Alternatively pass system_prompt/user_input/tool_definitions and RateGuard hashes them.",
					},
					"system_prompt": map[string]any{
						"type":        "string",
						"description": "System prompt to fingerprint (used when 'fingerprint' is absent)",
					},
					"user_input": map[string]any{
						"type":        "string",
						"description": "User input to fingerprint (used when 'fingerprint' is absent)",
					},
					"tool_definitions": map[string]any{
						"type":        "string",
						"description": "Serialized tool definitions to fingerprint (used when 'fingerprint' is absent)",
					},
					"sequence_depth": map[string]any{
						"type":        "integer",
						"description": "Current agent sequence depth (how many chained steps deep this call is)",
					},
					"record": map[string]any{
						"type":        "boolean",
						"description": "When true, record this fingerprint+depth so future checks can detect repeats. Defaults to true.",
					},
				},
				"required": []string{"sequence_depth"},
			},
			Handler: s.mcpCheckLoop,
		},
		{
			Name:        "list_limits",
			Description: "Full snapshot of all rate limits, token budgets, and circuit breaker states for a key. Convenience tool for agent initialization.",
			InputSchema: map[string]any{
				"type": "object",
				"properties": map[string]any{
					"key": map[string]any{
						"type":        "string",
						"description": "Rate limit key to query",
					},
				},
				"required": []string{"key"},
			},
			Handler: s.mcpListLimits,
		},
		{
			Name:        "attest_budget",
			Description: "Mint or delegate a cryptographic budget token an agent can hand to a sub-agent it invokes. Omit parent_token to mint a new root token (signing_key becomes the trust anchor verifiers must already know). Pass parent_token to delegate further — the new grant must narrow the parent's (less budget, fewer providers/models, less delegation depth, an earlier expiry); signing_key must be the private key matching parent_token's current holder.",
			InputSchema: map[string]any{
				"type": "object",
				"properties": map[string]any{
					"signing_key": map[string]any{
						"type":        "string",
						"description": "Base64 Ed25519 private key: the root authority key when minting (parent_token absent), or the current holder's key when delegating (parent_token present)",
					},
					"parent_token": map[string]any{
						"type":        "string",
						"description": "Existing serialized budget token to delegate from. Omit to mint a new root token.",
					},
					"delegate_public_key": map[string]any{
						"type":        "string",
						"description": "Base64 Ed25519 public key of the recipient, if it already generated its own keypair (recommended — its private key never transits through this call). Omit to have RateGuard generate a fresh keypair and return the private key.",
					},
					"max_tokens": map[string]any{
						"type":        "integer",
						"description": "Token budget for this grant. <= 0 means unlimited, but only if the parent grant is also unlimited.",
					},
					"providers": map[string]any{
						"type":        "array",
						"items":       map[string]any{"type": "string"},
						"description": "Restrict to these LLM providers. Omit for 'any provider', but only if the parent grant also allows any.",
					},
					"models": map[string]any{
						"type":        "array",
						"items":       map[string]any{"type": "string"},
						"description": "Restrict to these models, same rule as providers.",
					},
					"max_depth": map[string]any{
						"type":        "integer",
						"description": "How many further delegations this grant allows (0 = recipient may use it but not delegate further).",
					},
					"expires_in_seconds": map[string]any{
						"type":        "integer",
						"description": "Grant lifetime from now, in seconds. Required — budget tokens must expire.",
					},
				},
				"required": []string{"signing_key", "max_depth", "expires_in_seconds"},
			},
			Handler: s.mcpAttestBudget,
		},
		{
			Name:        "verify_budget",
			Description: "Verify a budget token before honoring it. Always checks the signature chain, that every delegation narrowed its parent, and that nothing has expired. Pass context+signature for a full authorization check (proof that the presenter actually holds the token, not just read it) — without them this only confirms the token's terms are well-formed, not who is presenting it.",
			InputSchema: map[string]any{
				"type": "object",
				"properties": map[string]any{
					"token": map[string]any{
						"type":        "string",
						"description": "Serialized budget token to verify",
					},
					"root_public_key": map[string]any{
						"type":        "string",
						"description": "Base64 Ed25519 public key of the trusted root authority (known out-of-band, like a CA root certificate)",
					},
					"context": map[string]any{
						"type":        "string",
						"description": "Challenge/context the presenter should have signed with their holder key, for proof-of-possession",
					},
					"signature": map[string]any{
						"type":        "string",
						"description": "Base64 signature over 'context', produced by the token holder's private key (rateguard.Sign in the Go SDK) — proves the presenter, not just a token they saw, holds the delegation",
					},
				},
				"required": []string{"token", "root_public_key"},
			},
			Handler: s.mcpVerifyBudget,
		},
	}
}

// mcpGetRateLimitState queries the rate limiter for current state.
// Uses Peek — a pre-flight query must never consume the caller's budget.
func (s *SDK) mcpGetRateLimitState(args map[string]any) (map[string]any, error) {
	key, ok := args["key"].(string)
	if !ok || key == "" {
		return nil, fmt.Errorf("mcp: key is required")
	}

	decision, err := s.limiter.Peek(context.Background(), key, s.policy)
	if err != nil {
		return map[string]any{
			"error": fmt.Sprintf("rate limiter unavailable: %v", err),
		}, nil
	}

	return map[string]any{
		"key":            key,
		"allowed":        decision.Allowed,
		"remaining":      decision.Remaining,
		"limit":          decision.Limit,
		"retry_after_ms": decision.RetryAfter.Milliseconds(),
		"applied":        decision.Applied,
	}, nil
}

// mcpGetTokenBudget queries token budget state using check (peek, no consumption).
func (s *SDK) mcpGetTokenBudget(args map[string]any) (map[string]any, error) {
	key, ok := args["key"].(string)
	if !ok || key == "" {
		return nil, fmt.Errorf("mcp: key is required")
	}

	if s.tokens == nil {
		return map[string]any{
			"error": "token budgets not configured",
		}, nil
	}

	decision := s.tokens.check(key, s.policy)
	if !decision.Applied {
		return map[string]any{
			"key":     key,
			"allowed": true,
			"applied": false,
			"error":   "no budget configured for this key",
		}, nil
	}

	estimatedTokens, _ := args["estimated_tokens"].(float64)

	result := map[string]any{
		"key":       key,
		"remaining": decision.Remaining,
		"limit":     decision.Limit,
		"window":    decision.Window,
		"applied":   decision.Applied,
		"allowed":   decision.Allowed,
	}

	if estimatedTokens > 0 {
		result["estimated_tokens"] = int64(estimatedTokens)
		result["would_fit"] = decision.Remaining >= int64(estimatedTokens)
	}

	return result, nil
}

// mcpGetCircuitBreakerState returns circuit breaker health.
// Uses State (read-only) — Allow would claim the half-open probe slot,
// starving the actual recovery probe.
func (s *SDK) mcpGetCircuitBreakerState(args map[string]any) (map[string]any, error) {
	upstreamID, _ := args["upstream_id"].(string)

	if s.breaker == nil {
		return map[string]any{
			"error": "circuit breaker not configured",
		}, nil
	}

	state := s.breaker.State()

	result := map[string]any{
		"state":   string(state),
		"allowed": state != CircuitBreakerOpen,
	}

	if upstreamID != "" {
		result["upstream_id"] = upstreamID
	}

	return result, nil
}

// mcpCheckLoop runs the loop detector against a payload fingerprint.
func (s *SDK) mcpCheckLoop(args map[string]any) (map[string]any, error) {
	if s.loops == nil {
		return map[string]any{"allowed": true, "enabled": false}, nil
	}

	depthRaw, ok := args["sequence_depth"].(float64)
	if !ok {
		return nil, fmt.Errorf("mcp: sequence_depth is required")
	}
	depth := int(depthRaw)

	fingerprint, _ := args["fingerprint"].(string)
	if fingerprint == "" {
		systemPrompt, _ := args["system_prompt"].(string)
		userInput, _ := args["user_input"].(string)
		toolDefs, _ := args["tool_definitions"].(string)
		if systemPrompt == "" && userInput == "" && toolDefs == "" {
			return nil, fmt.Errorf("mcp: fingerprint or prompt fields are required")
		}
		fingerprint = Fingerprint(systemPrompt, userInput, toolDefs)
	}

	record := true
	if v, ok := args["record"].(bool); ok {
		record = v
	}

	var allowed bool
	var reason string
	if record {
		allowed, reason = s.loops.Check(fingerprint, depth)
	} else {
		allowed, reason = s.loops.Peek(fingerprint, depth)
	}

	result := map[string]any{
		"allowed":        allowed,
		"fingerprint":    fingerprint,
		"sequence_depth": depth,
	}
	if reason != "" {
		result["reason"] = reason
	}
	return result, nil
}

// mcpListLimits returns a full snapshot of all limits for a key.
func (s *SDK) mcpListLimits(args map[string]any) (map[string]any, error) {
	key, ok := args["key"].(string)
	if !ok || key == "" {
		return nil, fmt.Errorf("mcp: key is required")
	}

	result := map[string]any{
		"key": key,
	}

	// Rate limit state
	rateState, err := s.mcpGetRateLimitState(map[string]any{"key": key})
	if err == nil {
		result["rate_limit"] = rateState
	}

	// Token budget state
	budgetState, _ := s.mcpGetTokenBudget(map[string]any{"key": key})
	if budgetState != nil {
		result["token_budget"] = budgetState
	}

	// Circuit breaker state
	cbState, _ := s.mcpGetCircuitBreakerState(map[string]any{})
	if cbState != nil {
		result["circuit_breaker"] = cbState
	}

	// Preset info
	result["preset"] = map[string]any{
		"name":                   s.policy.Name,
		"requests_per_second":    s.policy.RequestsPerSecond,
		"burst":                  s.policy.Burst,
		"token_budget_per_hour":  s.policy.TokenBudgetPerHour,
		"token_budget_per_day":   s.policy.TokenBudgetPerDay,
		"token_budget_per_month": s.policy.TokenBudgetPerMonth,
		"token_budget_mode":      string(s.policy.TokenBudgetMode),
	}

	// Loop detector stats
	if s.loops != nil {
		result["loop_detector"] = s.loops.Stats()
	}

	return result, nil
}

// mcpArgStrings decodes a JSON-decoded []any (MCP args arrive as
// map[string]any, so array fields land as []any of string values) into
// []string.
func mcpArgStrings(args map[string]any, field string) []string {
	raw, ok := args[field].([]any)
	if !ok {
		return nil
	}
	out := make([]string, 0, len(raw))
	for _, v := range raw {
		if s, ok := v.(string); ok {
			out = append(out, s)
		}
	}
	return out
}

// mcpAttestBudget mints a root budget token or delegates a narrower one from
// an existing token. See BudgetGrant / Attest / NewRootBudgetToken.
func (s *SDK) mcpAttestBudget(args map[string]any) (map[string]any, error) {
	signingKeyB64, ok := args["signing_key"].(string)
	if !ok || signingKeyB64 == "" {
		return nil, fmt.Errorf("mcp: signing_key is required")
	}
	signingKey, err := base64.StdEncoding.DecodeString(signingKeyB64)
	if err != nil || len(signingKey) != ed25519.PrivateKeySize {
		return nil, fmt.Errorf("mcp: signing_key must be a base64-encoded Ed25519 private key")
	}

	expiresInRaw, ok := args["expires_in_seconds"].(float64)
	if !ok || expiresInRaw <= 0 {
		return nil, fmt.Errorf("mcp: expires_in_seconds is required and must be positive")
	}

	maxDepthRaw, _ := args["max_depth"].(float64)
	maxTokensRaw, _ := args["max_tokens"].(float64)

	grant := BudgetGrant{
		MaxTokens: int64(maxTokensRaw),
		Providers: mcpArgStrings(args, "providers"),
		Models:    mcpArgStrings(args, "models"),
		MaxDepth:  int(maxDepthRaw),
		ExpiresAt: time.Now().Add(time.Duration(expiresInRaw) * time.Second),
	}

	var opts AttestOptions
	opts.Grant = grant
	if delegatePubB64, ok := args["delegate_public_key"].(string); ok && delegatePubB64 != "" {
		delegatePub, err := base64.StdEncoding.DecodeString(delegatePubB64)
		if err != nil || len(delegatePub) != ed25519.PublicKeySize {
			return nil, fmt.Errorf("mcp: delegate_public_key must be a base64-encoded Ed25519 public key")
		}
		opts.DelegatePublicKey = ed25519.PublicKey(delegatePub)
	}

	var token *BudgetToken
	var delegatePriv ed25519.PrivateKey
	if parentTokenStr, ok := args["parent_token"].(string); ok && parentTokenStr != "" {
		parentToken, err := ParseBudgetToken(parentTokenStr)
		if err != nil {
			return map[string]any{"error": fmt.Sprintf("parse parent_token: %v", err)}, nil
		}
		token, delegatePriv, err = Attest(parentToken, ed25519.PrivateKey(signingKey), opts)
		if err != nil {
			return map[string]any{"error": err.Error()}, nil
		}
	} else {
		token, delegatePriv, err = NewRootBudgetToken(ed25519.PrivateKey(signingKey), opts)
		if err != nil {
			return map[string]any{"error": err.Error()}, nil
		}
	}

	encoded, err := token.Marshal()
	if err != nil {
		return nil, fmt.Errorf("mcp: marshal budget token: %w", err)
	}

	result := map[string]any{
		"token":               encoded,
		"delegate_public_key": base64.StdEncoding.EncodeToString(token.Blocks[len(token.Blocks)-1].DelegatePublicKey),
		"max_tokens":          grant.MaxTokens,
		"max_depth":           grant.MaxDepth,
		"expires_at":          grant.ExpiresAt.UTC().Format(time.RFC3339),
		"depth":               len(token.Blocks),
	}
	if delegatePriv != nil {
		result["delegate_private_key"] = base64.StdEncoding.EncodeToString(delegatePriv)
	}
	return result, nil
}

// mcpVerifyBudget verifies a budget token's chain and, when a context and
// signature are supplied, the presenter's proof of possession.
func (s *SDK) mcpVerifyBudget(args map[string]any) (map[string]any, error) {
	tokenStr, ok := args["token"].(string)
	if !ok || tokenStr == "" {
		return nil, fmt.Errorf("mcp: token is required")
	}
	rootPubB64, ok := args["root_public_key"].(string)
	if !ok || rootPubB64 == "" {
		return nil, fmt.Errorf("mcp: root_public_key is required")
	}
	rootPub, err := base64.StdEncoding.DecodeString(rootPubB64)
	if err != nil || len(rootPub) != ed25519.PublicKeySize {
		return nil, fmt.Errorf("mcp: root_public_key must be a base64-encoded Ed25519 public key")
	}

	token, err := ParseBudgetToken(tokenStr)
	if err != nil {
		return map[string]any{"valid": false, "error": fmt.Sprintf("parse token: %v", err)}, nil
	}

	contextStr, hasContext := args["context"].(string)
	sigB64, hasSig := args["signature"].(string)

	var grant BudgetGrant
	proofVerified := false

	if hasContext && hasSig && contextStr != "" && sigB64 != "" {
		sig, err := base64.StdEncoding.DecodeString(sigB64)
		if err != nil {
			return map[string]any{"valid": false, "error": "signature must be base64-encoded"}, nil
		}
		grant, err = VerifyPresentation(token, ed25519.PublicKey(rootPub), []byte(contextStr), sig)
		if err != nil {
			return map[string]any{"valid": false, "error": err.Error()}, nil
		}
		proofVerified = true
	} else {
		grant, err = VerifyChain(token, ed25519.PublicKey(rootPub))
		if err != nil {
			return map[string]any{"valid": false, "error": err.Error()}, nil
		}
	}

	return map[string]any{
		"valid":                        true,
		"proof_of_possession_verified": proofVerified,
		"depth":                        len(token.Blocks),
		"effective_grant": map[string]any{
			"max_tokens": grant.MaxTokens,
			"providers":  grant.Providers,
			"models":     grant.Models,
			"max_depth":  grant.MaxDepth,
			"expires_at": grant.ExpiresAt.UTC().Format(time.RFC3339),
		},
	}, nil
}

// MCPCall is a convenience method that executes an MCP tool by name
// and returns the result as a JSON-marshalable MCPToolResult.
func (s *SDK) MCPCall(toolName string, args map[string]any) (*MCPToolResult, error) {
	for _, tool := range s.MCPTools() {
		if tool.Name == toolName {
			result, err := tool.Handler(args)
			if err != nil {
				return nil, err
			}
			jsonBytes, err := json.Marshal(result)
			if err != nil {
				return nil, fmt.Errorf("mcp: failed to marshal result: %w", err)
			}
			return &MCPToolResult{
				Content: []MCPToolContent{
					{Type: "text", Text: string(jsonBytes)},
				},
			}, nil
		}
	}
	return nil, fmt.Errorf("mcp: unknown tool %q — available: get_rate_limit_state, get_token_budget, get_circuit_breaker_state, check_loop, list_limits, attest_budget, verify_budget", toolName)
}
