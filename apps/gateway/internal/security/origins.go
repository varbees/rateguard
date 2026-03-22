package security

import (
	"os"
	"strings"
)

var defaultAllowedOrigins = []string{
	"http://localhost:3000",
	"http://localhost:3001",
	"http://localhost:3003",
	"http://127.0.0.1:3000",
	"http://127.0.0.1:3001",
	"http://127.0.0.1:3003",
}

func cloneOrigins(origins []string) []string {
	if len(origins) == 0 {
		return nil
	}

	out := make([]string, 0, len(origins))
	seen := make(map[string]struct{}, len(origins))

	for _, origin := range origins {
		normalized := normalizeOrigin(origin)
		if normalized == "" {
			continue
		}
		if _, exists := seen[normalized]; exists {
			continue
		}
		seen[normalized] = struct{}{}
		out = append(out, normalized)
	}

	return out
}

func normalizeOrigin(origin string) string {
	return strings.TrimRight(strings.TrimSpace(origin), "/")
}

func DefaultAllowedOrigins() []string {
	return cloneOrigins(defaultAllowedOrigins)
}

func LoadAllowedOrigins(envKey string, fallback []string) []string {
	raw := strings.TrimSpace(os.Getenv(envKey))
	if raw == "" {
		return cloneOrigins(fallback)
	}

	parsed := ParseAllowedOrigins(raw)
	if len(parsed) == 0 {
		return cloneOrigins(fallback)
	}

	return parsed
}

func ParseAllowedOrigins(raw string) []string {
	parts := strings.Split(raw, ",")
	out := make([]string, 0, len(parts))
	seen := make(map[string]struct{}, len(parts))

	for _, part := range parts {
		origin := normalizeOrigin(part)
		if origin == "" {
			continue
		}
		if _, exists := seen[origin]; exists {
			continue
		}
		seen[origin] = struct{}{}
		out = append(out, origin)
	}

	return out
}

func OriginAllowed(allowedOrigins []string, origin string) bool {
	origin = normalizeOrigin(origin)
	if origin == "" {
		return false
	}

	for _, allowedOrigin := range allowedOrigins {
		allowedOrigin = normalizeOrigin(allowedOrigin)
		if allowedOrigin == "" {
			continue
		}

		if allowedOrigin == "*" || allowedOrigin == origin {
			return true
		}

		if strings.HasPrefix(allowedOrigin, "*.") {
			suffix := strings.TrimPrefix(allowedOrigin, "*")
			if strings.HasSuffix(origin, suffix) {
				return true
			}
		}
	}

	return false
}
