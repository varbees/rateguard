package rateguard

import (
	"bufio"
	"context"
	"encoding/json"
	"fmt"
	"io"
	"log"
)

// ── MCP stdio server — zero-dependency JSON-RPC 2.0 transport ──
//
// ServeMCP speaks the Model Context Protocol stdio transport: newline-delimited
// JSON-RPC 2.0 messages on stdin/stdout. Any MCP client (Claude Code, Claude
// Desktop, Cursor, custom agents) can connect RateGuard as a tool server:
//
//	{"mcpServers": {"rateguard": {"command": "your-app", "args": ["mcp"]}}}
//
// Spec: https://modelcontextprotocol.io/specification/2025-06-18
// Methods implemented: initialize, notifications/initialized, ping,
// tools/list, tools/call. Everything else returns -32601 (method not found).

const (
	mcpProtocolVersion = "2025-06-18"
	mcpServerName      = "rateguard"

	jsonrpcParseError     = -32700
	jsonrpcInvalidRequest = -32600
	jsonrpcMethodNotFound = -32601
	jsonrpcInvalidParams  = -32602
)

type jsonrpcRequest struct {
	JSONRPC string          `json:"jsonrpc"`
	ID      json.RawMessage `json:"id,omitempty"`
	Method  string          `json:"method"`
	Params  json.RawMessage `json:"params,omitempty"`
}

type jsonrpcResponse struct {
	JSONRPC string          `json:"jsonrpc"`
	ID      json.RawMessage `json:"id,omitempty"`
	Result  any             `json:"result,omitempty"`
	Error   *jsonrpcError   `json:"error,omitempty"`
}

type jsonrpcError struct {
	Code    int    `json:"code"`
	Message string `json:"message"`
}

type mcpToolDescriptor struct {
	Name        string         `json:"name"`
	Description string         `json:"description"`
	InputSchema map[string]any `json:"inputSchema"`
}

type mcpCallParams struct {
	Name      string         `json:"name"`
	Arguments map[string]any `json:"arguments"`
}

// ServeMCP runs an MCP stdio server over the given reader/writer until the
// reader closes or ctx is canceled. Pass os.Stdin/os.Stdout to expose the
// SDK's pre-flight tools to any MCP client.
func (s *SDK) ServeMCP(ctx context.Context, r io.Reader, w io.Writer) error {
	scanner := bufio.NewScanner(r)
	scanner.Buffer(make([]byte, 0, 64*1024), 4*1024*1024)
	encoder := json.NewEncoder(w)

	for scanner.Scan() {
		if ctx != nil {
			select {
			case <-ctx.Done():
				return ctx.Err()
			default:
			}
		}

		line := scanner.Bytes()
		if len(line) == 0 {
			continue
		}

		var req jsonrpcRequest
		if err := json.Unmarshal(line, &req); err != nil {
			writeJSONRPC(encoder, jsonrpcResponse{
				JSONRPC: "2.0",
				Error:   &jsonrpcError{Code: jsonrpcParseError, Message: "parse error"},
			})
			continue
		}

		response, respond := s.handleMCPRequest(req)
		if respond {
			writeJSONRPC(encoder, response)
		}
	}

	return scanner.Err()
}

// handleMCPRequest dispatches one JSON-RPC message. respond is false for
// notifications (no id), which must not produce a response.
func (s *SDK) handleMCPRequest(req jsonrpcRequest) (jsonrpcResponse, bool) {
	isNotification := len(req.ID) == 0

	switch req.Method {
	case "initialize":
		return jsonrpcResponse{
			JSONRPC: "2.0",
			ID:      req.ID,
			Result: map[string]any{
				"protocolVersion": mcpProtocolVersion,
				"capabilities":    map[string]any{"tools": map[string]any{}},
				"serverInfo": map[string]any{
					"name":    mcpServerName,
					"version": Version,
				},
			},
		}, !isNotification

	case "notifications/initialized", "notifications/cancelled":
		return jsonrpcResponse{}, false

	case "ping":
		return jsonrpcResponse{JSONRPC: "2.0", ID: req.ID, Result: map[string]any{}}, !isNotification

	case "tools/list":
		descriptors := make([]mcpToolDescriptor, 0, 8)
		for _, tool := range s.MCPTools() {
			descriptors = append(descriptors, mcpToolDescriptor{
				Name:        tool.Name,
				Description: tool.Description,
				InputSchema: tool.InputSchema,
			})
		}
		return jsonrpcResponse{
			JSONRPC: "2.0",
			ID:      req.ID,
			Result:  map[string]any{"tools": descriptors},
		}, !isNotification

	case "tools/call":
		var params mcpCallParams
		if err := json.Unmarshal(req.Params, &params); err != nil || params.Name == "" {
			return jsonrpcResponse{
				JSONRPC: "2.0",
				ID:      req.ID,
				Error:   &jsonrpcError{Code: jsonrpcInvalidParams, Message: "tools/call requires params.name"},
			}, !isNotification
		}

		result, err := s.MCPCall(params.Name, params.Arguments)
		if err != nil {
			// Tool-level failures are reported in-band per the MCP spec.
			return jsonrpcResponse{
				JSONRPC: "2.0",
				ID:      req.ID,
				Result: map[string]any{
					"content": []map[string]any{{"type": "text", "text": err.Error()}},
					"isError": true,
				},
			}, !isNotification
		}
		return jsonrpcResponse{
			JSONRPC: "2.0",
			ID:      req.ID,
			Result:  map[string]any{"content": result.Content, "isError": false},
		}, !isNotification

	default:
		if isNotification {
			return jsonrpcResponse{}, false
		}
		return jsonrpcResponse{
			JSONRPC: "2.0",
			ID:      req.ID,
			Error:   &jsonrpcError{Code: jsonrpcMethodNotFound, Message: fmt.Sprintf("method not found: %s", req.Method)},
		}, true
	}
}

func writeJSONRPC(encoder *json.Encoder, response jsonrpcResponse) {
	if err := encoder.Encode(response); err != nil {
		log.Printf("rateguard: write mcp response: %v", err)
	}
}
