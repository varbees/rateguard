package rateguard

import (
	"bytes"
	"encoding/json"
	"net/http"
	"net/http/httptest"
	"testing"
)

func TestAdminHandlerGetState(t *testing.T) {
	sdk := New(Config{Preset: "dev"})
	handler := sdk.AdminHandler()

	req := httptest.NewRequest(http.MethodGet, "/admin/state?key=tenant-1", nil)
	rec := httptest.NewRecorder()
	handler.ServeHTTP(rec, req)

	if rec.Code != http.StatusOK {
		t.Fatalf("status = %d, want 200: %s", rec.Code, rec.Body.String())
	}

	var body map[string]any
	if err := json.Unmarshal(rec.Body.Bytes(), &body); err != nil {
		t.Fatalf("invalid JSON response: %v", err)
	}
	for _, field := range []string{"key", "rate_limit", "token_budget", "circuit_breaker", "preset", "loop_detector"} {
		if _, ok := body[field]; !ok {
			t.Errorf("response missing field %q: %v", field, body)
		}
	}
	if body["key"] != "tenant-1" {
		t.Errorf("key = %v, want tenant-1", body["key"])
	}
}

func TestAdminHandlerGetStateDefaultsKey(t *testing.T) {
	sdk := New(Config{Preset: "dev"})
	handler := sdk.AdminHandler()

	req := httptest.NewRequest(http.MethodGet, "/admin/state", nil)
	rec := httptest.NewRecorder()
	handler.ServeHTTP(rec, req)

	if rec.Code != http.StatusOK {
		t.Fatalf("status = %d, want 200", rec.Code)
	}
	var body map[string]any
	_ = json.Unmarshal(rec.Body.Bytes(), &body)
	if body["key"] != "default" {
		t.Errorf("key = %v, want default", body["key"])
	}
}

func TestAdminHandlerGetPolicy(t *testing.T) {
	sdk := New(Config{Preset: "dev"})
	handler := sdk.AdminHandler()

	req := httptest.NewRequest(http.MethodGet, "/admin/policy", nil)
	rec := httptest.NewRecorder()
	handler.ServeHTTP(rec, req)

	if rec.Code != http.StatusOK {
		t.Fatalf("status = %d, want 200", rec.Code)
	}
	var policy PolicyPreset
	if err := json.Unmarshal(rec.Body.Bytes(), &policy); err != nil {
		t.Fatalf("invalid JSON response: %v", err)
	}
	if policy.Name != "dev" {
		t.Errorf("policy.Name = %q, want dev", policy.Name)
	}
}

func TestAdminHandlerPatchPolicy(t *testing.T) {
	sdk := New(Config{Preset: "dev"})
	handler := sdk.AdminHandler()

	patch := []byte(`{"requests_per_second": 42, "burst": 84}`)
	req := httptest.NewRequest(http.MethodPatch, "/admin/policy", bytes.NewReader(patch))
	rec := httptest.NewRecorder()
	handler.ServeHTTP(rec, req)

	if rec.Code != http.StatusOK {
		t.Fatalf("status = %d, want 200: %s", rec.Code, rec.Body.String())
	}
	var policy PolicyPreset
	if err := json.Unmarshal(rec.Body.Bytes(), &policy); err != nil {
		t.Fatalf("invalid JSON response: %v", err)
	}
	if policy.RequestsPerSecond != 42 || policy.Burst != 84 {
		t.Fatalf("policy = %+v, want rps=42 burst=84", policy)
	}

	// The change must be visible through Policy() too, not just the response body.
	if got := sdk.Policy().RequestsPerSecond; got != 42 {
		t.Fatalf("sdk.Policy().RequestsPerSecond = %d, want 42", got)
	}
}

func TestAdminHandlerPatchPolicyInvalidJSON(t *testing.T) {
	sdk := New(Config{Preset: "dev"})
	handler := sdk.AdminHandler()

	req := httptest.NewRequest(http.MethodPatch, "/admin/policy", bytes.NewReader([]byte("{not json")))
	rec := httptest.NewRecorder()
	handler.ServeHTTP(rec, req)

	if rec.Code != http.StatusBadRequest {
		t.Fatalf("status = %d, want 400", rec.Code)
	}
}

func TestAdminHandlerMethodNotAllowed(t *testing.T) {
	sdk := New(Config{Preset: "dev"})
	handler := sdk.AdminHandler()

	req := httptest.NewRequest(http.MethodPost, "/admin/state", nil)
	rec := httptest.NewRecorder()
	handler.ServeHTTP(rec, req)

	if rec.Code != http.StatusMethodNotAllowed {
		t.Fatalf("status = %d, want 405", rec.Code)
	}
}

func TestAdminHandlerCORSPreflight(t *testing.T) {
	sdk := New(Config{Preset: "dev", AdminCORSOrigin: "http://localhost:3001"})
	handler := sdk.AdminHandler()

	req := httptest.NewRequest(http.MethodOptions, "/admin/policy", nil)
	rec := httptest.NewRecorder()
	handler.ServeHTTP(rec, req)

	if rec.Code != http.StatusNoContent {
		t.Fatalf("status = %d, want 204", rec.Code)
	}
	if got := rec.Header().Get("Access-Control-Allow-Origin"); got != "http://localhost:3001" {
		t.Fatalf("Access-Control-Allow-Origin = %q, want http://localhost:3001", got)
	}
}

// TestAdminHandlerNoCORSByDefault is the security-regression test: without
// AdminCORSOrigin explicitly configured, the admin API must not set a
// wildcard (or any) CORS header — a browser then refuses cross-origin
// fetches, so no arbitrary webpage open in the same browser can reach this
// unauthenticated, state-mutating API. This was a real bug: the previous
// unconditional "Access-Control-Allow-Origin: *" let any page in any
// browser on the same machine/LAN PATCH policy via preflight.
func TestAdminHandlerNoCORSByDefault(t *testing.T) {
	sdk := New(Config{Preset: "dev"})
	handler := sdk.AdminHandler()

	req := httptest.NewRequest(http.MethodOptions, "/admin/policy", nil)
	rec := httptest.NewRecorder()
	handler.ServeHTTP(rec, req)

	if rec.Code != http.StatusNoContent {
		t.Fatalf("status = %d, want 204", rec.Code)
	}
	if got := rec.Header().Get("Access-Control-Allow-Origin"); got != "" {
		t.Fatalf("Access-Control-Allow-Origin = %q, want empty (no CORS header without AdminCORSOrigin configured)", got)
	}

	// The API itself must still work for same-origin/non-browser callers.
	getReq := httptest.NewRequest(http.MethodGet, "/admin/policy", nil)
	getRec := httptest.NewRecorder()
	handler.ServeHTTP(getRec, getReq)
	if getRec.Code != http.StatusOK {
		t.Fatalf("GET /admin/policy status = %d, want 200", getRec.Code)
	}
}

func TestAdminHandlerMCPToolsCatalog(t *testing.T) {
	sdk := New(Config{Preset: "dev"})
	handler := sdk.AdminHandler()

	req := httptest.NewRequest(http.MethodGet, "/admin/mcp/tools", nil)
	rec := httptest.NewRecorder()
	handler.ServeHTTP(rec, req)

	if rec.Code != http.StatusOK {
		t.Fatalf("status = %d, want 200: %s", rec.Code, rec.Body.String())
	}
	var tools []adminMCPTool
	if err := json.Unmarshal(rec.Body.Bytes(), &tools); err != nil {
		t.Fatalf("invalid JSON response: %v", err)
	}
	if len(tools) == 0 {
		t.Fatal("expected at least one MCP tool in the catalog")
	}
	names := make(map[string]bool, len(tools))
	for _, tool := range tools {
		names[tool.Name] = true
		if tool.Description == "" {
			t.Errorf("tool %q has no description", tool.Name)
		}
	}
	for _, want := range []string{"get_rate_limit_state", "get_token_budget", "list_limits"} {
		if !names[want] {
			t.Errorf("catalog missing expected tool %q", want)
		}
	}
}

func TestAdminHandlerMCPCall(t *testing.T) {
	sdk := New(Config{Preset: "dev"})
	handler := sdk.AdminHandler()

	body, _ := json.Marshal(adminMCPCallRequest{
		Tool: "get_rate_limit_state",
		Args: map[string]any{"key": "tenant-1"},
	})
	req := httptest.NewRequest(http.MethodPost, "/admin/mcp/call", bytes.NewReader(body))
	rec := httptest.NewRecorder()
	handler.ServeHTTP(rec, req)

	if rec.Code != http.StatusOK {
		t.Fatalf("status = %d, want 200: %s", rec.Code, rec.Body.String())
	}
	var result map[string]any
	if err := json.Unmarshal(rec.Body.Bytes(), &result); err != nil {
		t.Fatalf("invalid JSON response: %v", err)
	}
	if result["key"] != "tenant-1" {
		t.Errorf("result[key] = %v, want tenant-1", result["key"])
	}
	if _, ok := result["allowed"]; !ok {
		t.Errorf("result missing 'allowed' field: %v", result)
	}
}

func TestAdminHandlerMCPCallUnknownTool(t *testing.T) {
	sdk := New(Config{Preset: "dev"})
	handler := sdk.AdminHandler()

	body, _ := json.Marshal(adminMCPCallRequest{Tool: "not_a_real_tool"})
	req := httptest.NewRequest(http.MethodPost, "/admin/mcp/call", bytes.NewReader(body))
	rec := httptest.NewRecorder()
	handler.ServeHTTP(rec, req)

	if rec.Code != http.StatusNotFound {
		t.Fatalf("status = %d, want 404", rec.Code)
	}
}

func TestAdminHandlerMCPCallMissingTool(t *testing.T) {
	sdk := New(Config{Preset: "dev"})
	handler := sdk.AdminHandler()

	req := httptest.NewRequest(http.MethodPost, "/admin/mcp/call", bytes.NewReader([]byte(`{}`)))
	rec := httptest.NewRecorder()
	handler.ServeHTTP(rec, req)

	if rec.Code != http.StatusBadRequest {
		t.Fatalf("status = %d, want 400", rec.Code)
	}
}

// TestMetricsHandlerCORS guards against a real bug found while wiring the
// dashboard: /metrics is served by a separate handler from /admin/*, so
// AdminHandler's CORS wrapper doesn't cover it — the dashboard fetches both
// cross-origin, and Metrics() must set the header itself.
func TestMetricsHandlerCORS(t *testing.T) {
	sdk := New(Config{Preset: "dev"})
	handler := sdk.Metrics()

	req := httptest.NewRequest(http.MethodGet, "/metrics", nil)
	rec := httptest.NewRecorder()
	handler.ServeHTTP(rec, req)

	if rec.Code != http.StatusOK {
		t.Fatalf("status = %d, want 200", rec.Code)
	}
	if got := rec.Header().Get("Access-Control-Allow-Origin"); got != "*" {
		t.Fatalf("Access-Control-Allow-Origin = %q, want *", got)
	}
}
