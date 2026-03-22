const normalizedApiUrl = (
  process.env.NEXT_PUBLIC_API_URL || "http://localhost:8008"
).replace(/\/$/, "");

export const DOCS_API_ORIGIN_URL = normalizedApiUrl;
export const DOCS_API_V1_BASE_URL = `${normalizedApiUrl}/api/v1`;
export const DOCS_PROXY_BASE_URL = `${normalizedApiUrl}/proxy`;
export const DOCS_WS_URL = process.env.NEXT_PUBLIC_WS_URL || "ws://localhost:8008";
