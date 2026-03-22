package models

import (
	"errors"
	"regexp"
	"strings"
)

var (
	// Handle validation regex: lowercase letters, numbers, hyphens, underscores only
	handleRegex = regexp.MustCompile(`^[a-z0-9_-]{3,30}$`)
	
	// Slug validation regex: same as handle
	slugRegex = regexp.MustCompile(`^[a-z0-9_-]{3,30}$`)
	
	// Common validation errors
	ErrInvalidHandleFormat = errors.New("handle must be 3-30 characters, lowercase letters, numbers, hyphens, and underscores only")
	ErrInvalidSlugFormat   = errors.New("slug must be 3-30 characters, lowercase letters, numbers, hyphens, and underscores only")
	ErrHandleReserved      = errors.New("this handle is reserved and cannot be used")
	ErrHandleTaken         = errors.New("this handle is already taken")
	ErrSlugTaken           = errors.New("this slug is already taken")
)

// ValidateHandle checks if a handle meets the required format
func ValidateHandle(handle string) error {
	if handle == "" {
		return errors.New("handle cannot be empty")
	}
	
	// Normalize to lowercase
	handle = strings.ToLower(strings.TrimSpace(handle))
	
	// Check format
	if !handleRegex.MatchString(handle) {
		return ErrInvalidHandleFormat
	}
	
	// Check for consecutive hyphens/underscores
	if strings.Contains(handle, "--") || strings.Contains(handle, "__") {
		return errors.New("handle cannot contain consecutive hyphens or underscores")
	}
	
	// Cannot start or end with hyphen/underscore
	if strings.HasPrefix(handle, "-") || strings.HasPrefix(handle, "_") ||
		strings.HasSuffix(handle, "-") || strings.HasSuffix(handle, "_") {
		return errors.New("handle cannot start or end with hyphen or underscore")
	}
	
	return nil
}

// ValidateSlug checks if a slug meets the required format
func ValidateSlug(slug string) error {
	if slug == "" {
		return errors.New("slug cannot be empty")
	}
	
	// Normalize to lowercase
	slug = strings.ToLower(strings.TrimSpace(slug))
	
	// Check format
	if !slugRegex.MatchString(slug) {
		return ErrInvalidSlugFormat
	}
	
	// Check for consecutive hyphens/underscores
	if strings.Contains(slug, "--") || strings.Contains(slug, "__") {
		return errors.New("slug cannot contain consecutive hyphens or underscores")
	}
	
	// Cannot start or end with hyphen/underscore
	if strings.HasPrefix(slug, "-") || strings.HasPrefix(slug, "_") ||
		strings.HasSuffix(slug, "-") || strings.HasSuffix(slug, "_") {
		return errors.New("slug cannot start or end with hyphen or underscore")
	}
	
	return nil
}

// NormalizeHandle converts a string to a valid handle format
// Use for auto-generating handles from names
func NormalizeHandle(input string) string {
	// Convert to lowercase
	handle := strings.ToLower(input)
	
	// Replace spaces and special chars with hyphens
	handle = regexp.MustCompile(`[^a-z0-9_-]+`).ReplaceAllString(handle, "-")
	
	// Remove consecutive hyphens
	handle = regexp.MustCompile(`-+`).ReplaceAllString(handle, "-")
	
	// Remove leading/trailing hyphens
	handle = strings.Trim(handle, "-_")
	
	// Truncate to max length
	if len(handle) > 30 {
		handle = handle[:30]
	}
	
	// Ensure minimum length
	if len(handle) < 3 {
		handle = handle + strings.Repeat("x", 3-len(handle))
	}
	
	return handle
}

// NormalizeSlug is an alias for NormalizeHandle (same rules)
func NormalizeSlug(input string) string {
	return NormalizeHandle(input)
}

// SuggestAvailableHandle generates alternative handle suggestions
// Used when user's preferred handle is taken
func SuggestAvailableHandle(baseHandle string) []string {
	suggestions := make([]string, 5)
	
	// Add random numbers
	for i := 0; i < 5; i++ {
		suffix := i + 1
		suggestion := baseHandle
		if len(suggestion) > 27 {
			suggestion = suggestion[:27]
		}
		suggestions[i] = suggestion + "-" + string(rune('0'+suffix))
	}
	
	return suggestions
}
