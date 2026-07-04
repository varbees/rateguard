package rateguard

import (
	"context"
	"encoding/json"
	"fmt"
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
	return nil, fmt.Errorf("mcp: unknown tool %q — available: get_rate_limit_state, get_token_budget, get_circuit_breaker_state, check_loop, list_limits", toolName)
}
