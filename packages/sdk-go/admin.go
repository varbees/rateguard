package rateguard

import (
	"encoding/json"
	"errors"
	"io"
	"net/http"
)

// AdminHandler serves a small read/write control-plane API for the
// RateGuard dashboard (packages/dashboard) or any operator tooling:
//
//	GET   /admin/state?key=<key>   full snapshot for key — rate limit,
//	                                token budget, circuit breaker, loop
//	                                detector stats (same data as the
//	                                list_limits MCP tool)
//	GET   /admin/policy             current effective policy
//	PATCH /admin/policy             partial policy override, applied via
//	                                SetPolicy — in-memory only, does not
//	                                persist across restarts
//	GET   /admin/mcp/tools          the MCP tool catalog (name, description,
//	                                JSON Schema) — no handler funcs, safe to
//	                                serialize
//	POST  /admin/mcp/call           {"tool": "...", "args": {...}} — invokes
//	                                the named MCP tool directly (same
//	                                handler MCPCall dispatches to) and
//	                                returns its result unwrapped, for a UI
//	                                to render directly instead of parsing
//	                                MCP's text-envelope transport shape
//	POST  /admin/freeze             {"scope": ""} — kill switch: halt outbound
//	                                LLM calls for a scope (empty = everything,
//	                                else a customer id). Returns the frozen list.
//	POST  /admin/unfreeze           {"scope": ""} — lift a freeze
//	GET   /admin/frozen             the currently frozen scopes
//
// Security posture: this handler has NO authentication and is not safe to
// expose on the public internet — anyone who can reach it can read your
// current limits and change them. Bind it to localhost, an internal
// network, or put it behind your own reverse-proxy auth, the same posture
// you'd give pprof or an unauthenticated Prometheus /metrics endpoint. It
// is opt-in: nothing wires it into HTTPMiddleware or ChiMiddleware.
//
// Browser threat model: unlike pprof/metrics (which are read-only), this
// handler accepts state-mutating requests (PATCH /admin/policy, POST
// /admin/mcp/call). Without Config.AdminCORSOrigin set, no cross-origin
// fetch from a browser can reach it — same-origin only. If you set
// AdminCORSOrigin to serve a dashboard on a different port, that origin
// (and anything else running in the same browser) becomes trusted to the
// same degree the admin API itself is.
func (s *SDK) AdminHandler() http.Handler {
	mux := http.NewServeMux()
	mux.HandleFunc("/admin/state", s.handleAdminState)
	mux.HandleFunc("/admin/policy", s.handleAdminPolicy)
	mux.HandleFunc("/admin/mcp/tools", s.handleAdminMCPTools)
	mux.HandleFunc("/admin/mcp/call", s.handleAdminMCPCall)
	mux.HandleFunc("/admin/freeze", s.handleAdminFreeze)
	mux.HandleFunc("/admin/unfreeze", s.handleAdminUnfreeze)
	mux.HandleFunc("/admin/frozen", s.handleAdminFrozen)
	return withAdminCORS(mux, s.cfg.AdminCORSOrigin)
}

// withAdminCORS allows cross-origin requests from a single configured
// origin (e.g. a dashboard running on a different port — the common
// local-dev/self-host shape: RateGuard on :8080, dashboard on :3001).
// origin empty (the default) omits CORS headers entirely, so only
// same-origin requests are answered — never a wildcard, which would let
// any webpage open in the same browser reach this unauthenticated,
// state-mutating API via a cross-origin fetch. Scoped to the admin mux
// only — never applied to the rate-limited request path.
func withAdminCORS(next http.Handler, origin string) http.Handler {
	return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		if origin != "" {
			w.Header().Set("Access-Control-Allow-Origin", origin)
			w.Header().Set("Access-Control-Allow-Methods", "GET, PATCH, POST, OPTIONS")
			w.Header().Set("Access-Control-Allow-Headers", "Content-Type")
			w.Header().Set("Vary", "Origin")
		}
		if r.Method == http.MethodOptions {
			w.WriteHeader(http.StatusNoContent)
			return
		}
		next.ServeHTTP(w, r)
	})
}

func (s *SDK) handleAdminState(w http.ResponseWriter, r *http.Request) {
	if r.Method != http.MethodGet {
		writeAdminError(w, http.StatusMethodNotAllowed, "GET only")
		return
	}

	key := r.URL.Query().Get("key")
	if key == "" {
		key = "default"
	}

	// Calls the same handler behind the list_limits MCP tool directly —
	// it already returns a plain map, so there's no need to round-trip
	// through MCPCall's JSON-in-a-string wrapping meant for MCP transport.
	result, err := s.mcpListLimits(map[string]any{"key": key})
	if err != nil {
		writeAdminError(w, http.StatusInternalServerError, err.Error())
		return
	}

	writeAdminJSON(w, http.StatusOK, result)
}

// adminPolicyPatch is the wire shape for PATCH /admin/policy: every field
// is optional, matching PolicyUpdate's partial-override semantics.
type adminPolicyPatch struct {
	RequestsPerSecond   *int             `json:"requests_per_second"`
	Burst               *int             `json:"burst"`
	TokenBudgetPerHour  *int64           `json:"token_budget_per_hour"`
	TokenBudgetPerDay   *int64           `json:"token_budget_per_day"`
	TokenBudgetPerMonth *int64           `json:"token_budget_per_month"`
	TokenBudgetMode     *TokenBudgetMode `json:"token_budget_mode"`
}

func (s *SDK) handleAdminPolicy(w http.ResponseWriter, r *http.Request) {
	switch r.Method {
	case http.MethodGet:
		writeAdminJSON(w, http.StatusOK, s.Policy())
	case http.MethodPatch:
		var patch adminPolicyPatch
		if err := json.NewDecoder(r.Body).Decode(&patch); err != nil {
			writeAdminError(w, http.StatusBadRequest, "invalid JSON body: "+err.Error())
			return
		}
		updated := s.SetPolicy(PolicyUpdate{
			RequestsPerSecond:   patch.RequestsPerSecond,
			Burst:               patch.Burst,
			TokenBudgetPerHour:  patch.TokenBudgetPerHour,
			TokenBudgetPerDay:   patch.TokenBudgetPerDay,
			TokenBudgetPerMonth: patch.TokenBudgetPerMonth,
			TokenBudgetMode:     patch.TokenBudgetMode,
		})
		writeAdminJSON(w, http.StatusOK, updated)
	default:
		writeAdminError(w, http.StatusMethodNotAllowed, "GET or PATCH only")
	}
}

// adminMCPTool is MCPTool minus its unexported-to-JSON Handler func.
type adminMCPTool struct {
	Name        string         `json:"name"`
	Description string         `json:"description"`
	InputSchema map[string]any `json:"input_schema"`
}

func (s *SDK) handleAdminMCPTools(w http.ResponseWriter, r *http.Request) {
	if r.Method != http.MethodGet {
		writeAdminError(w, http.StatusMethodNotAllowed, "GET only")
		return
	}

	tools := s.MCPTools()
	out := make([]adminMCPTool, len(tools))
	for i, t := range tools {
		out[i] = adminMCPTool{Name: t.Name, Description: t.Description, InputSchema: t.InputSchema}
	}
	writeAdminJSON(w, http.StatusOK, out)
}

type adminMCPCallRequest struct {
	Tool string         `json:"tool"`
	Args map[string]any `json:"args"`
}

func (s *SDK) handleAdminMCPCall(w http.ResponseWriter, r *http.Request) {
	if r.Method != http.MethodPost {
		writeAdminError(w, http.StatusMethodNotAllowed, "POST only")
		return
	}

	var req adminMCPCallRequest
	if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
		writeAdminError(w, http.StatusBadRequest, "invalid JSON body: "+err.Error())
		return
	}
	if req.Tool == "" {
		writeAdminError(w, http.StatusBadRequest, "\"tool\" is required")
		return
	}

	for _, t := range s.MCPTools() {
		if t.Name == req.Tool {
			result, err := t.Handler(req.Args)
			if err != nil {
				writeAdminError(w, http.StatusBadRequest, err.Error())
				return
			}
			writeAdminJSON(w, http.StatusOK, result)
			return
		}
	}
	writeAdminError(w, http.StatusNotFound, "unknown tool \""+req.Tool+"\"")
}

// adminFreezeRequest is the body for /admin/freeze and /admin/unfreeze. An
// empty scope (or an empty body) targets the global freeze; any other value
// targets a single customer.
type adminFreezeRequest struct {
	Scope string `json:"scope"`
}

func (s *SDK) handleAdminFreeze(w http.ResponseWriter, r *http.Request) { s.freezeMutate(w, r, true) }
func (s *SDK) handleAdminUnfreeze(w http.ResponseWriter, r *http.Request) {
	s.freezeMutate(w, r, false)
}

func (s *SDK) freezeMutate(w http.ResponseWriter, r *http.Request, freeze bool) {
	if r.Method != http.MethodPost {
		writeAdminError(w, http.StatusMethodNotAllowed, "POST only")
		return
	}
	var req adminFreezeRequest
	if err := json.NewDecoder(r.Body).Decode(&req); err != nil && !errors.Is(err, io.EOF) {
		writeAdminError(w, http.StatusBadRequest, "invalid JSON body: "+err.Error())
		return
	}
	if freeze {
		s.freeze.Freeze(req.Scope)
	} else {
		s.freeze.Unfreeze(req.Scope)
	}
	writeAdminJSON(w, http.StatusOK, map[string]any{"frozen": s.freeze.FrozenScopes()})
}

func (s *SDK) handleAdminFrozen(w http.ResponseWriter, r *http.Request) {
	if r.Method != http.MethodGet {
		writeAdminError(w, http.StatusMethodNotAllowed, "GET only")
		return
	}
	writeAdminJSON(w, http.StatusOK, map[string]any{"frozen": s.freeze.FrozenScopes()})
}

func writeAdminJSON(w http.ResponseWriter, status int, body any) {
	w.Header().Set("Content-Type", "application/json")
	w.WriteHeader(status)
	_ = json.NewEncoder(w).Encode(body)
}

func writeAdminError(w http.ResponseWriter, status int, message string) {
	writeAdminJSON(w, status, map[string]string{"error": message})
}
