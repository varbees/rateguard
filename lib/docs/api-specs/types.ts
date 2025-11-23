/**
 * Type definitions for API endpoint specifications
 */

export interface Parameter {
  name: string;
  type: string;
  required: boolean;
  description: string;
  example?: string;
  default?: string;
}

export interface RequestBody {
  contentType: string;
  schema: Record<string, string>;
  example: Record<string, any>;
}

export interface Response {
  status: number;
  description: string;
  schema?: Record<string, string>;
  example: Record<string, any>;
  headers?: Record<string, string>;
}

export interface CodeExample {
  language: string;
  label: string;
  code: string;
}

export interface ErrorScenario {
  status: number;
  error: string;
  description: string;
  solution: string;
}

export interface EndpointSpec {
  id: string;
  method: "GET" | "POST" | "PUT" | "DELETE" | "PATCH" | "ANY";
  path: string;
  category: string;
  title: string;
  description: string;
  authentication: boolean;
  authType?: string;
  pathParams?: Parameter[];
  queryParams?: Parameter[];
  requestBody?: RequestBody;
  responses: Response[];
  codeExamples: CodeExample[];
  errorScenarios: ErrorScenario[];
  rateLimitHeaders: boolean;
}

export const API_BASE_URL = "https://api.rateguard.io/v1";
