package rateguard

import (
	"bufio"
	"bytes"
	"context"
	"encoding/json"
	"strings"
	"testing"
)

// runMCPSession feeds newline-delimited JSON-RPC requests through ServeMCP
// and returns the decoded responses in order.
func runMCPSession(t *testing.T, sdk *SDK, requests ...string) []map[string]any {
	t.Helper()

	input := strings.Join(requests, "\n") + "\n"
	var output bytes.Buffer

	if err := sdk.ServeMCP(context.Background(), strings.NewReader(input), &output); err != nil {
		t.Fatalf("ServeMCP returned error: %v", err)
	}

	var responses []map[string]any
	scanner := bufio.NewScanner(&output)
	for scanner.Scan() {
		var decoded map[string]any
		if err := json.Unmarshal(scanner.Bytes(), &decoded); err != nil {
			t.Fatalf("invalid JSON response %q: %v", scanner.Text(), err)
		}
		responses = append(responses, decoded)
	}
	return responses
}

func TestMCPServerHandshakeAndToolsList(t *testing.T) {
	sdk := New(Config{Preset: "dev"})

	responses := runMCPSession(t, sdk,
		`{"jsonrpc":"2.0","id":1,"method":"initialize","params":{"protocolVersion":"2025-06-18","capabilities":{},"clientInfo":{"name":"test","version":"0"}}}`,
		`{"jsonrpc":"2.0","method":"notifications/initialized"}`,
		`{"jsonrpc":"2.0","id":2,"method":"tools/list"}`,
	)

	if len(responses) != 2 {
		t.Fatalf("expected 2 responses (initialize, tools/list), got %d: %v", len(responses), responses)
	}

	initResult, ok := responses[0]["result"].(map[string]any)
	if !ok {
		t.Fatalf("initialize response missing result: %v", responses[0])
	}
	if initResult["protocolVersion"] != mcpProtocolVersion {
		t.Errorf("protocolVersion = %v, want %s", initResult["protocolVersion"], mcpProtocolVersion)
	}

	listResult, ok := responses[1]["result"].(map[string]any)
	if !ok {
		t.Fatalf("tools/list response missing result: %v", responses[1])
	}
	tools, ok := listResult["tools"].([]any)
	if !ok || len(tools) != 7 {
		t.Fatalf("tools/list should return 7 tools, got %v", listResult["tools"])
	}
}

func TestMCPServerToolsCall(t *testing.T) {
	sdk := New(Config{Preset: "dev"})

	responses := runMCPSession(t, sdk,
		`{"jsonrpc":"2.0","id":7,"method":"tools/call","params":{"name":"get_rate_limit_state","arguments":{"key":"agent-1"}}}`,
	)

	if len(responses) != 1 {
		t.Fatalf("expected 1 response, got %d", len(responses))
	}
	result, ok := responses[0]["result"].(map[string]any)
	if !ok {
		t.Fatalf("tools/call missing result: %v", responses[0])
	}
	if isError, _ := result["isError"].(bool); isError {
		t.Fatalf("tools/call reported error: %v", result)
	}
	content, ok := result["content"].([]any)
	if !ok || len(content) != 1 {
		t.Fatalf("expected one content block, got %v", result["content"])
	}
}

func TestMCPServerUnknownMethod(t *testing.T) {
	sdk := New(Config{Preset: "dev"})

	responses := runMCPSession(t, sdk,
		`{"jsonrpc":"2.0","id":3,"method":"resources/list"}`,
	)

	if len(responses) != 1 {
		t.Fatalf("expected 1 response, got %d", len(responses))
	}
	errObj, ok := responses[0]["error"].(map[string]any)
	if !ok {
		t.Fatalf("expected error response, got %v", responses[0])
	}
	if code, _ := errObj["code"].(float64); int(code) != jsonrpcMethodNotFound {
		t.Errorf("error code = %v, want %d", errObj["code"], jsonrpcMethodNotFound)
	}
}

func TestMCPServerToolErrorInBand(t *testing.T) {
	sdk := New(Config{Preset: "dev"})

	// Missing required "key" argument → in-band isError, not a JSON-RPC error.
	responses := runMCPSession(t, sdk,
		`{"jsonrpc":"2.0","id":4,"method":"tools/call","params":{"name":"get_rate_limit_state","arguments":{}}}`,
	)

	result, ok := responses[0]["result"].(map[string]any)
	if !ok {
		t.Fatalf("expected in-band tool error, got %v", responses[0])
	}
	if isError, _ := result["isError"].(bool); !isError {
		t.Fatalf("expected isError=true, got %v", result)
	}
}
