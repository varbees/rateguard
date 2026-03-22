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

  if (state.provider !== "custom" && apiKey) {
    return {
      auth_type: "bearer",
      auth_credentials: { token: apiKey },
      requiresKey: true,
      summary: "Bearer token will be sent as Authorization: Bearer ...",
    };
  }

  return {
    auth_type: state.auth_type || "none",
    requiresKey: false,
    summary: "No upstream credential configured.",
  };
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
