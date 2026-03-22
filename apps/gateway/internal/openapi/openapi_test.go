package openapi

import (
	"strings"
	"testing"
)

func TestBuildIncludesOpenAPIRouteAndIdempotency(t *testing.T) {
	t.Parallel()

	doc, err := Build()
	if err != nil {
		t.Fatalf("Build error = %v", err)
	}

	if got := doc["openapi"]; got != "3.1.0" {
		t.Fatalf("openapi = %v, want 3.1.0", got)
	}

	paths, ok := doc["paths"].(map[string]any)
	if !ok {
		t.Fatal("paths is missing or wrong type")
	}

	if _, ok := paths["/api/v1/openapi.json"]; !ok {
		t.Fatal("missing /api/v1/openapi.json path")
	}
	if _, ok := paths["/api/v1/events/replay"]; !ok {
		t.Fatal("missing /api/v1/events/replay path")
	}
	if _, ok := paths["/api/v1/events/stream"]; !ok {
		t.Fatal("missing /api/v1/events/stream path")
	}

	apis, ok := paths["/api/v1/apis"].(map[string]any)
	if !ok {
		t.Fatal("missing /api/v1/apis path item")
	}

	post, ok := apis["post"].(map[string]any)
	if !ok {
		t.Fatal("missing POST /api/v1/apis operation")
	}
	assertHeaderParameter(t, post, "Idempotency-Key")

	extensions, ok := doc["x-rateguard-event-envelope"].(map[string]any)
	if !ok {
		t.Fatal("missing x-rateguard-event-envelope extension")
	}
	if _, ok := extensions["event_id"]; !ok {
		t.Fatal("event envelope missing event_id")
	}
	realtime, ok := doc["x-rateguard-realtime"].(map[string]any)
	if !ok {
		t.Fatal("missing x-rateguard-realtime extension")
	}
	if got := realtime["stream_endpoint"]; got != "/api/v1/events/stream" {
		t.Fatalf("stream endpoint = %v, want /api/v1/events/stream", got)
	}

	schemas, ok := doc["components"].(map[string]any)
	if !ok {
		t.Fatal("missing components object")
	}
	schemaMap, ok := schemas["schemas"].(map[string]any)
	if !ok {
		t.Fatal("missing schemas map")
	}

	userSchema, ok := schemaMap["User"].(map[string]any)
	if !ok {
		t.Fatal("missing User schema")
	}
	userProps, ok := userSchema["properties"].(map[string]any)
	if !ok {
		t.Fatal("missing User properties")
	}
	if _, ok := userProps["preset"]; !ok {
		t.Fatal("User schema missing preset")
	}
	if _, ok := userProps["plan"]; ok {
		t.Fatal("User schema still exposes plan")
	}

	createUserSchema, ok := schemaMap["CreateUserRequest"].(map[string]any)
	if !ok {
		t.Fatal("missing CreateUserRequest schema")
	}
	createUserProps, ok := createUserSchema["properties"].(map[string]any)
	if !ok {
		t.Fatal("missing CreateUserRequest properties")
	}
	if _, ok := createUserProps["preset"]; !ok {
		t.Fatal("CreateUserRequest schema missing preset")
	}
	if _, ok := createUserProps["plan"]; ok {
		t.Fatal("CreateUserRequest schema still exposes plan")
	}
}

func TestGenerateTSClientIncludesCoreSurface(t *testing.T) {
	t.Parallel()

	src, err := GenerateTSClient()
	if err != nil {
		t.Fatalf("GenerateTSClient error = %v", err)
	}

	for _, want := range []string{
		"export class RateGuardClient",
		"signUp(",
		"getDashboardStats(",
		"getOpenApiJson(",
		"replayEvents(",
		"streamEvents(",
		"export function middleware(",
	} {
		if !strings.Contains(src, want) {
			t.Fatalf("generated client missing %q", want)
		}
	}

	if !strings.Contains(src, "async regenerateApiKey(input?: RequestOptions): Promise<APIKey>") {
		t.Fatal("generated client missing regenerateApiKey method")
	}
	if !strings.Contains(src, "options: input,\n    });") {
		t.Fatal("generated client should pass RequestOptions directly for regenerateApiKey")
	}
}

func assertHeaderParameter(t *testing.T, op map[string]any, headerName string) {
	t.Helper()

	params, ok := op["parameters"].([]any)
	if !ok {
		t.Fatalf("operation missing parameters")
	}

	for _, raw := range params {
		param, ok := raw.(map[string]any)
		if !ok {
			continue
		}
		if param["in"] == "header" && param["name"] == headerName {
			return
		}
	}

	t.Fatalf("missing header parameter %q", headerName)
}
