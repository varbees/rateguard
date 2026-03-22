package gateway

import (
	"net/http"
	"testing"

	"github.com/varbees/rateguard/internal/models"
)

func TestBuildTargetURL(t *testing.T) {
	got := BuildTargetURL("https://example.com/base", map[string]string{"a": "1", "b": "2"})
	if got != "https://example.com/base?a=1&b=2" && got != "https://example.com/base?b=2&a=1" {
		t.Fatalf("unexpected URL: %s", got)
	}
}

func TestBuildTargetURLWithPath(t *testing.T) {
	got := BuildTargetURLWithPath("https://example.com/base", "/v1/chat", map[string]string{"a": "1"})
	if got != "https://example.com/base/v1/chat?a=1" {
		t.Fatalf("unexpected URL: %s", got)
	}
}

func TestApplyAuthentication(t *testing.T) {
	req, err := http.NewRequest(http.MethodGet, "https://example.com", nil)
	if err != nil {
		t.Fatalf("new request: %v", err)
	}

	ApplyAuthentication(req, &models.APIConfig{
		AuthType: "bearer",
		AuthCredentials: map[string]string{
			"token": "abc123",
		},
	})

	if got := req.Header.Get("Authorization"); got != "Bearer abc123" {
		t.Fatalf("unexpected auth header: %s", got)
	}
}

func TestValidateAPIConfig(t *testing.T) {
	err := ValidateAPIConfig(&models.APIConfig{
		TargetURL:          "https://example.com",
		RateLimitPerSecond: 1,
		BurstSize:          1,
		TimeoutSeconds:     30,
	})
	if err != nil {
		t.Fatalf("expected config to be valid: %v", err)
	}
}
