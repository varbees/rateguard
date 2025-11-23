/**
 * Streaming Analytics API Client
 * Provides type-safe API calls for streaming metrics and analytics
 */

// ============================================================================
// TYPE DEFINITIONS
// ============================================================================

export interface StreamingStats {
  total_streams: number;
  total_bytes: number;
  total_bytes_gb: number;
  avg_duration_ms: number;
  max_duration_ms: number;
  active_streams: number;
  success_rate: number;
  streaming_enabled: boolean;
}

export interface StreamingHistoryPoint {
  timestamp: string;
  streams: number;
  bytes: number;
  avg_duration_ms: number;
}

export interface StreamingHistoryResponse {
  data: StreamingHistoryPoint[];
}

export interface ApiStreamingBreakdown {
  api_id: string;
  api_name: string;
  streams: number;
  bytes: number;
  avg_duration_ms: number;
  success_rate: number;
}

export interface ApiBreakdownResponse {
  apis: ApiStreamingBreakdown[];
}

export type TimePeriod = "24h" | "7d" | "30d";

// ============================================================================
// API CLIENT FUNCTIONS
// ============================================================================

const API_BASE_URL = process.env.NEXT_PUBLIC_API_URL || "http://localhost:8008";

/**
 * Get API key from localStorage or environment
 */
function getApiKey(): string {
  if (typeof window !== "undefined") {
    return localStorage.getItem("apiKey") || "";
  }
  return process.env.NEXT_PUBLIC_API_KEY || "";
}

/**
 * Fetch streaming statistics
 * @param period - Time period (24h, 7d, 30d)
 * @param signal - AbortSignal for request cancellation
 * @returns Streaming statistics
 */
export async function fetchStreamingStats(
  period: TimePeriod = "30d",
  signal?: AbortSignal
): Promise<StreamingStats> {
  const apiKey = getApiKey();

  if (!apiKey) {
    throw new Error("API key not found. Please log in.");
  }

  const response = await fetch(
    `${API_BASE_URL}/api/v1/dashboard/stats/streaming?period=${period}`,
    {
      method: "GET",
      headers: {
        "X-API-Key": apiKey,
        "Content-Type": "application/json",
      },
      signal,
    }
  );

  if (!response.ok) {
    if (response.status === 401) {
      throw new Error("Unauthorized. Please log in again.");
    }
    throw new Error(`Failed to fetch streaming stats: ${response.statusText}`);
  }

  return response.json();
}

/**
 * Fetch streaming history for charts
 * @param period - Time period (24h, 7d, 30d)
 * @param signal - AbortSignal for request cancellation
 * @returns Time-series streaming data
 */
export async function fetchStreamingHistory(
  period: TimePeriod = "7d",
  signal?: AbortSignal
): Promise<StreamingHistoryResponse> {
  const apiKey = getApiKey();

  if (!apiKey) {
    throw new Error("API key not found. Please log in.");
  }

  const response = await fetch(
    `${API_BASE_URL}/api/v1/dashboard/streaming/history?period=${period}`,
    {
      method: "GET",
      headers: {
        "X-API-Key": apiKey,
        "Content-Type": "application/json",
      },
      signal,
    }
  );

  if (!response.ok) {
    if (response.status === 401) {
      throw new Error("Unauthorized. Please log in again.");
    }
    throw new Error(
      `Failed to fetch streaming history: ${response.statusText}`
    );
  }

  return response.json();
}

/**
 * Fetch streaming breakdown by API
 * @param period - Time period (24h, 7d, 30d)
 * @param signal - AbortSignal for request cancellation
 * @returns Per-API streaming metrics
 */
export async function fetchStreamingByAPI(
  period: TimePeriod = "30d",
  signal?: AbortSignal
): Promise<ApiBreakdownResponse> {
  const apiKey = getApiKey();

  if (!apiKey) {
    throw new Error("API key not found. Please log in.");
  }

  const response = await fetch(
    `${API_BASE_URL}/api/v1/dashboard/streaming/by-api?period=${period}`,
    {
      method: "GET",
      headers: {
        "X-API-Key": apiKey,
        "Content-Type": "application/json",
      },
      signal,
    }
  );

  if (!response.ok) {
    if (response.status === 401) {
      throw new Error("Unauthorized. Please log in again.");
    }
    throw new Error(`Failed to fetch API breakdown: ${response.statusText}`);
  }

  return response.json();
}

// ============================================================================
// UTILITY FUNCTIONS
// ============================================================================

/**
 * Format bytes to human-readable string
 */
export function formatBytes(bytes: number, decimals: number = 2): string {
  if (bytes === 0) return "0 Bytes";

  const k = 1024;
  const dm = decimals < 0 ? 0 : decimals;
  const sizes = ["Bytes", "KB", "MB", "GB", "TB"];

  const i = Math.floor(Math.log(bytes) / Math.log(k));

  return parseFloat((bytes / Math.pow(k, i)).toFixed(dm)) + " " + sizes[i];
}

/**
 * Format duration in milliseconds to human-readable string
 */
export function formatDuration(ms: number): string {
  if (ms < 1000) {
    return `${ms.toFixed(0)}ms`;
  }

  const seconds = ms / 1000;
  if (seconds < 60) {
    return `${seconds.toFixed(1)}s`;
  }

  const minutes = seconds / 60;
  return `${minutes.toFixed(1)}m`;
}

/**
 * Export streaming data to CSV
 */
export function exportToCSV(
  data: ApiStreamingBreakdown[],
  filename: string = "streaming-data.csv"
): void {
  // CSV headers
  const headers = [
    "API Name",
    "Streams",
    "Bytes",
    "Avg Duration (ms)",
    "Success Rate (%)",
  ];

  // CSV rows
  const rows = data.map((api) => [
    api.api_name,
    api.streams.toString(),
    api.bytes.toString(),
    api.avg_duration_ms.toFixed(2),
    api.success_rate.toFixed(2),
  ]);

  // Combine headers and rows
  const csvContent = [
    headers.join(","),
    ...rows.map((row) => row.join(",")),
  ].join("\n");

  // Create download link
  const blob = new Blob([csvContent], { type: "text/csv;charset=utf-8;" });
  const link = document.createElement("a");
  const url = URL.createObjectURL(blob);

  link.setAttribute("href", url);
  link.setAttribute("download", filename);
  link.style.visibility = "hidden";
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
}
