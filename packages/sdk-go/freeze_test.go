package rateguard

import (
	"io"
	"net/http"
	"net/http/httptest"
	"strings"
	"testing"
)

func freezeSend(t *testing.T, client *http.Client, customer string) *http.Response {
	t.Helper()
	req, _ := http.NewRequest(http.MethodPost, "https://api.openai.com/v1/chat/completions",
		strings.NewReader(`{"model":"gpt-4o"}`))
	if customer != "" {
		req.Header.Set("X-RateGuard-Customer", customer)
	}
	resp, err := client.Do(req)
	if err != nil {
		t.Fatalf("outbound call failed: %v", err)
	}
	_, _ = io.ReadAll(resp.Body)
	_ = resp.Body.Close()
	return resp
}

func TestFreezeGlobalHaltsThenResumes(t *testing.T) {
	server := httptest.NewServer(openAIJSONHandler("gpt-4o", 100, 50))
	defer server.Close()
	sdk := New(Config{Preset: "dev", TokenBudgetPerHour: 100_000})
	client := wrapForHost(t, sdk, server)

	if resp := freezeSend(t, client, ""); resp.StatusCode != http.StatusOK {
		t.Fatalf("before freeze: want 200, got %d", resp.StatusCode)
	}

	sdk.Freeze("")
	if !sdk.IsFrozen("") {
		t.Error("IsFrozen(\"\") should be true after a global freeze")
	}
	resp := freezeSend(t, client, "")
	if resp.StatusCode != http.StatusForbidden {
		t.Fatalf("frozen: want 403, got %d", resp.StatusCode)
	}
	if resp.Header.Get("X-RateGuard-Synthesized") != "true" {
		t.Error("frozen response should be marked synthesized")
	}

	sdk.Unfreeze("")
	if resp := freezeSend(t, client, ""); resp.StatusCode != http.StatusOK {
		t.Fatalf("after unfreeze: want 200, got %d", resp.StatusCode)
	}
}

func TestFreezePerCustomerIsScoped(t *testing.T) {
	server := httptest.NewServer(openAIJSONHandler("gpt-4o", 100, 50))
	defer server.Close()
	sdk := New(Config{Preset: "dev", TokenBudgetPerHour: 100_000})
	client := wrapForHost(t, sdk, server)

	sdk.Freeze("alice")
	if got := freezeSend(t, client, "alice").StatusCode; got != http.StatusForbidden {
		t.Fatalf("alice frozen: want 403, got %d", got)
	}
	if got := freezeSend(t, client, "bob").StatusCode; got != http.StatusOK {
		t.Fatalf("bob is a different customer: want 200, got %d", got)
	}
	if scopes := sdk.FrozenScopes(); len(scopes) != 1 || scopes[0] != "customer=alice" {
		t.Errorf("FrozenScopes = %v, want [customer=alice]", scopes)
	}
}

func TestFreezeIgnoredInObserveMode(t *testing.T) {
	server := httptest.NewServer(openAIJSONHandler("gpt-4o", 100, 50))
	defer server.Close()
	sdk := New(Config{Preset: "dev", TokenBudgetPerHour: 100_000})
	client := wrapForHost(t, sdk, server, OutboundOptions{Mode: OutboundModeObserve})

	sdk.Freeze("")
	if got := freezeSend(t, client, "").StatusCode; got != http.StatusOK {
		t.Errorf("observe mode never blocks, even frozen: got %d", got)
	}
}

func TestAdminFreezeEndpoint(t *testing.T) {
	sdk := New(Config{Preset: "dev"})
	admin := sdk.AdminHandler()

	do := func(method, path, body string) *httptest.ResponseRecorder {
		rr := httptest.NewRecorder()
		admin.ServeHTTP(rr, httptest.NewRequest(method, path, strings.NewReader(body)))
		return rr
	}

	if rr := do(http.MethodPost, "/admin/freeze", `{"scope":"alice"}`); rr.Code != http.StatusOK {
		t.Fatalf("POST /admin/freeze: want 200, got %d", rr.Code)
	}
	if !sdk.IsFrozen("alice") {
		t.Error("alice should be frozen after the admin POST")
	}
	if rr := do(http.MethodGet, "/admin/frozen", ""); !strings.Contains(rr.Body.String(), "customer=alice") {
		t.Errorf("/admin/frozen should list alice, got %s", rr.Body.String())
	}
	if rr := do(http.MethodPost, "/admin/unfreeze", `{"scope":"alice"}`); rr.Code != http.StatusOK {
		t.Fatalf("POST /admin/unfreeze: want 200, got %d", rr.Code)
	}
	if sdk.IsFrozen("alice") {
		t.Error("alice should be unfrozen after the admin POST")
	}
}
