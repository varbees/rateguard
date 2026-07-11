package rateguard

import (
	"io"
	"net/http"
	"net/http/httptest"
	"strings"
	"testing"
)

func TestEnforcementLogRecordsBlocks(t *testing.T) {
	server := httptest.NewServer(openAIJSONHandler("gpt-4o", 400, 100))
	defer server.Close()
	sdk := New(Config{Preset: "dev", TokenBudgetPerHour: 600, EstimatedTokensPerRequest: 500})
	client := wrapForHost(t, sdk, server)

	send := func(customer string) {
		req, _ := http.NewRequest(http.MethodPost, "https://api.openai.com/v1/chat/completions",
			strings.NewReader(`{"model":"gpt-4o"}`))
		if customer != "" {
			req.Header.Set("X-RateGuard-Customer", customer)
		}
		resp, err := client.Do(req)
		if err != nil {
			t.Fatalf("call failed: %v", err)
		}
		_, _ = io.ReadAll(resp.Body)
		_ = resp.Body.Close()
	}

	// alice burns her 600-token budget: the third call is blocked.
	send("alice")
	send("alice")
	send("alice")
	// bob is frozen by an operator.
	sdk.Freeze("bob")
	send("bob")

	events := sdk.EnforcementEvents(0)
	if len(events) < 2 {
		t.Fatalf("expected at least 2 enforcement events, got %d", len(events))
	}
	// Newest first: bob's freeze is the most recent block.
	if events[0].Type != "frozen" || events[0].Customer != "bob" {
		t.Errorf("newest event = %+v, want type=frozen customer=bob", events[0])
	}
	var foundBudget bool
	for _, e := range events {
		if e.Type == "token_budget_exceeded" && e.Customer == "alice" {
			foundBudget = true
		}
	}
	if !foundBudget {
		t.Error("expected a token_budget_exceeded event attributed to alice")
	}
}

func TestAdminEventsEndpoint(t *testing.T) {
	server := httptest.NewServer(openAIJSONHandler("gpt-4o", 10, 10))
	defer server.Close()
	sdk := New(Config{Preset: "dev"})
	sdk.Freeze("")
	client := wrapForHost(t, sdk, server)

	req, _ := http.NewRequest(http.MethodPost, "https://api.openai.com/v1/chat/completions",
		strings.NewReader(`{"model":"gpt-4o"}`))
	resp, _ := client.Do(req)
	_, _ = io.ReadAll(resp.Body)
	_ = resp.Body.Close()

	admin := sdk.AdminHandler()

	rr := httptest.NewRecorder()
	admin.ServeHTTP(rr, httptest.NewRequest(http.MethodGet, "/admin/events", nil))
	if rr.Code != http.StatusOK || !strings.Contains(rr.Body.String(), "frozen") {
		t.Errorf("GET /admin/events: code=%d body=%s", rr.Code, rr.Body.String())
	}

	rr = httptest.NewRecorder()
	admin.ServeHTTP(rr, httptest.NewRequest(http.MethodGet, "/admin/events?format=csv", nil))
	if ct := rr.Header().Get("Content-Type"); !strings.HasPrefix(ct, "text/csv") {
		t.Errorf("csv content-type = %q, want text/csv", ct)
	}
	if !strings.Contains(rr.Body.String(), "at,type,customer,provider,model,detail") {
		t.Errorf("csv missing header row: %s", rr.Body.String())
	}
}
