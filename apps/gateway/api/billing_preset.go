//go:build commercial

package api

import "strings"

func resolveCheckoutPreset(preset string) string {
	return strings.TrimSpace(preset)
}
