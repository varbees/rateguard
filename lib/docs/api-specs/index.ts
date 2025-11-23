/**
 * RateGuard API Endpoint Specifications
 * Complete reference for all REST API endpoints
 */

export * from "./types";
export * from "./auth-endpoints";
export * from "./api-endpoints";
export * from "./dashboard-endpoints";

import { AUTH_ENDPOINTS } from "./auth-endpoints";
import { API_ENDPOINTS } from "./api-endpoints";
import { DASHBOARD_ENDPOINTS } from "./dashboard-endpoints";
import { EndpointSpec } from "./types";

export interface EndpointCategory {
  name: string;
  description: string;
  endpoints: EndpointSpec[];
}

export const ENDPOINT_CATEGORIES: EndpointCategory[] = [
  {
    name: "Authentication",
    description: "User registration, login, and password management endpoints",
    endpoints: AUTH_ENDPOINTS,
  },
  {
    name: "API Management",
    description: "CRUD operations for API configurations",
    endpoints: API_ENDPOINTS,
  },
  {
    name: "Dashboard & Analytics",
    description: "Usage statistics, dashboard metrics, and proxy endpoint",
    endpoints: DASHBOARD_ENDPOINTS,
  },
];

export const ALL_ENDPOINTS = [
  ...AUTH_ENDPOINTS,
  ...API_ENDPOINTS,
  ...DASHBOARD_ENDPOINTS,
];

// Helper function to get endpoint by ID
export function getEndpointById(id: string): EndpointSpec | undefined {
  return ALL_ENDPOINTS.find((endpoint) => endpoint.id === id);
}

// Helper function to get endpoints by category
export function getEndpointsByCategory(category: string): EndpointSpec[] {
  const cat = ENDPOINT_CATEGORIES.find((c) => c.name === category);
  return cat?.endpoints || [];
}
