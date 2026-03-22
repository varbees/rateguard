/**
 * Slugification utility to match backend slugification logic
 * Converts API names to URL-safe slugs
 */

/**
 * Convert a string to a URL-safe slug
 * Matches the backend slugification in internal/models/api_config.go
 * 
 * Rules:
 * 1. Convert to lowercase
 * 2. Replace spaces and special characters with hyphens
 * 3. Remove consecutive hyphens
 * 4. Trim leading/trailing hyphens
 * 5. Minimum 2 characters
 * 
 * @param name - The API name to slugify
 * @returns URL-safe slug
 */
export function slugify(name: string): string {
  if (!name) return "";

  return name
    .toLowerCase()
    .trim()
    // Replace spaces and special characters with hyphens
    .replace(/[^a-z0-9]+/g, "-")
    // Remove consecutive hyphens
    .replace(/-+/g, "-")
    // Trim leading/trailing hyphens
    .replace(/^-+|-+$/g, "");
}

/**
 * Validate if a slug meets minimum requirements
 * @param slug - The slug to validate
 * @returns true if valid, false otherwise
 */
export function isValidSlug(slug: string): boolean {
  if (!slug || slug.length < 2) return false;
  // Check if slug only contains lowercase letters, numbers, and hyphens
  return /^[a-z0-9]+(-[a-z0-9]+)*$/.test(slug);
}

/**
 * Get validation error message for a slug
 * @param slug - The slug to validate
 * @returns Error message or null if valid
 */
export function getSlugValidationError(slug: string): string | null {
  if (!slug) return "Name is required";
  if (slug.length < 2) return "Name must be at least 2 characters";
  if (!isValidSlug(slug)) return "Name contains invalid characters";
  return null;
}
