package main

import "testing"

func TestDeriveKey(t *testing.T) {
	cases := []struct {
		name         string
		nameFlag     string
		upstreamHost string
		want         string
	}{
		{"explicit name wins", "hermes", "api.deepseek.com", "hermes"},
		{"derives provider label past generic 'api'", "", "api.deepseek.com", "deepseek"},
		{"derives provider label past generic 'api', anthropic", "", "api.anthropic.com", "anthropic"},
		{"derives provider label past generic 'api', openai", "", "api.openai.com", "openai"},
		{"no generic 'api' prefix, uses first label as-is", "", "generativelanguage.googleapis.com", "generativelanguage"},
		{"no dots falls back to full host", "", "localhost", "localhost"},
	}
	for _, c := range cases {
		t.Run(c.name, func(t *testing.T) {
			if got := deriveKey(c.nameFlag, c.upstreamHost); got != c.want {
				t.Errorf("deriveKey(%q, %q) = %q, want %q", c.nameFlag, c.upstreamHost, got, c.want)
			}
		})
	}
}

func TestEnvOr(t *testing.T) {
	t.Setenv("RATEGUARD_CONNECT_TEST_VAR", "")
	if got := envOr("RATEGUARD_CONNECT_TEST_VAR", "fallback"); got != "fallback" {
		t.Errorf("envOr with unset var = %q, want fallback", got)
	}

	t.Setenv("RATEGUARD_CONNECT_TEST_VAR", "real-value")
	if got := envOr("RATEGUARD_CONNECT_TEST_VAR", "fallback"); got != "real-value" {
		t.Errorf("envOr with set var = %q, want real-value", got)
	}
}
