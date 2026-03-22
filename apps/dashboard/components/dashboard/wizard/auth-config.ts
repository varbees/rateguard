import { CreateAPIState } from "./types";

export interface WizardAuthConfig {
  auth_type: CreateAPIState["auth_type"];
  auth_credentials?: Record<string, string>;
  requiresKey: boolean;
  summary: string;
}

export function buildWizardAuthConfig(
  state: Pick<CreateAPIState, "provider" | "auth_type" | "api_key">
): WizardAuthConfig {
  const apiKey = state.api_key?.trim() || "";

  switch (state.provider) {
    case "openai":
      return apiKey
        ? {
            auth_type: "bearer",
            auth_credentials: { token: apiKey },
            requiresKey: true,
            summary: "OpenAI expects Authorization: Bearer with your API key.",
          }
        : {
            auth_type: "bearer",
            requiresKey: true,
            summary: "OpenAI requires an API key before this proxy can connect.",
          };
    case "anthropic":
      return apiKey
        ? {
            auth_type: "api_key",
            auth_credentials: { header_name: "x-api-key", key: apiKey },
            requiresKey: true,
            summary: "Anthropic expects x-api-key plus anthropic-version upstream.",
          }
        : {
            auth_type: "api_key",
            requiresKey: true,
            summary: "Anthropic requires an API key before this proxy can connect.",
          };
    case "google":
      return apiKey
        ? {
            auth_type: "api_key",
            auth_credentials: { header_name: "x-goog-api-key", key: apiKey },
            requiresKey: true,
            summary: "Gemini expects x-goog-api-key on upstream requests.",
          }
        : {
            auth_type: "api_key",
            requiresKey: true,
            summary: "Gemini requires an API key before this proxy can connect.",
          };
    case "cohere":
      return apiKey
        ? {
            auth_type: "bearer",
            auth_credentials: { token: apiKey },
            requiresKey: true,
            summary: "Cohere expects Authorization: Bearer with your API key.",
          }
        : {
            auth_type: "bearer",
            requiresKey: true,
            summary: "Cohere requires an API key before this proxy can connect.",
          };
    default:
      return {
        auth_type: state.auth_type || "none",
        requiresKey: false,
        summary: "No upstream credential configured.",
      };
  }
}

export function isValidHttpUrl(value: string): boolean {
  const url = value.trim();
  if (!url) return false;

  try {
    const parsed = new URL(url);
    return parsed.protocol === "http:" || parsed.protocol === "https:";
  } catch {
    return false;
  }
}

export function createIdempotencyKey(action: string): string {
  const uuid =
    typeof globalThis.crypto !== "undefined" &&
    typeof globalThis.crypto.randomUUID === "function"
      ? globalThis.crypto.randomUUID()
      : `${Date.now()}-${Math.random().toString(16).slice(2)}`;

  return `dashboard-${action}-${uuid}`;
}
