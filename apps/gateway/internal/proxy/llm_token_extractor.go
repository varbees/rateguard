package proxy

import (
	"bufio"
	"bytes"
	"encoding/json"
	"fmt"
	"io"
	"strings"
)

// TokenUsage represents token counts from LLM API responses
type TokenUsage struct {
	InputTokens  int64
	OutputTokens int64
	TotalTokens  int64
	Model        string
}

// ExtractTokensFromResponse parses LLM API responses to extract token counts
// Supports OpenAI, Anthropic, and Groq response formats
func ExtractTokensFromResponse(provider string, responseBody []byte) (TokenUsage, error) {
	switch provider {
	case "openai", "groq":
		return extractOpenAITokens(responseBody)
	case "anthropic":
		return extractAnthropicTokens(responseBody)
	case "cohere":
		return extractCohereTokens(responseBody)
	default:
		return TokenUsage{}, fmt.Errorf("unsupported provider: %s", provider)
	}
}

// extractOpenAITokens parses OpenAI and Groq responses (same format)
func extractOpenAITokens(body []byte) (TokenUsage, error) {
	var resp struct {
		Usage struct {
			PromptTokens     int64 `json:"prompt_tokens"`
			CompletionTokens int64 `json:"completion_tokens"`
			TotalTokens      int64 `json:"total_tokens"`
		} `json:"usage"`
		Model string `json:"model"`
	}

	if err := json.Unmarshal(body, &resp); err != nil {
		return TokenUsage{}, fmt.Errorf("failed to parse OpenAI response: %w", err)
	}

	return TokenUsage{
		InputTokens:  resp.Usage.PromptTokens,
		OutputTokens: resp.Usage.CompletionTokens,
		TotalTokens:  resp.Usage.TotalTokens,
		Model:        resp.Model,
	}, nil
}

// extractAnthropicTokens parses Anthropic Claude responses
func extractAnthropicTokens(body []byte) (TokenUsage, error) {
	var resp struct {
		Usage struct {
			InputTokens  int64 `json:"input_tokens"`
			OutputTokens int64 `json:"output_tokens"`
		} `json:"usage"`
		Model string `json:"model"`
	}

	if err := json.Unmarshal(body, &resp); err != nil {
		return TokenUsage{}, fmt.Errorf("failed to parse Anthropic response: %w", err)
	}

	totalTokens := resp.Usage.InputTokens + resp.Usage.OutputTokens

	return TokenUsage{
		InputTokens:  resp.Usage.InputTokens,
		OutputTokens: resp.Usage.OutputTokens,
		TotalTokens:  totalTokens,
		Model:        resp.Model,
	}, nil
}

// extractCohereTokens parses Cohere responses
func extractCohereTokens(body []byte) (TokenUsage, error) {
	var resp struct {
		Meta struct {
			Tokens struct {
				InputTokens  int64 `json:"input_tokens"`
				OutputTokens int64 `json:"output_tokens"`
			} `json:"tokens"`
		} `json:"meta"`
		Model string `json:"model"`
	}

	if err := json.Unmarshal(body, &resp); err != nil {
		return TokenUsage{}, fmt.Errorf("failed to parse Cohere response: %w", err)
	}

	totalTokens := resp.Meta.Tokens.InputTokens + resp.Meta.Tokens.OutputTokens

	return TokenUsage{
		InputTokens:  resp.Meta.Tokens.InputTokens,
		OutputTokens: resp.Meta.Tokens.OutputTokens,
		TotalTokens:  totalTokens,
		Model:        resp.Model,
	}, nil
}

// ExtractTokensFromStreamingResponse parses SSE streaming responses
// This reads the final SSE event which contains usage information
func ExtractTokensFromStreamingResponse(provider string, streamBody io.Reader) (TokenUsage, error) {
	// Buffer to collect the full stream
	buf := new(bytes.Buffer)
	scanner := bufio.NewScanner(streamBody)

	var lastDataChunk []byte

	// Read all SSE events
	for scanner.Scan() {
		line := scanner.Text()

		// SSE format: "data: {...}"
		if strings.HasPrefix(line, "data: ") {
			dataStr := strings.TrimPrefix(line, "data: ")

			// Skip [DONE] marker (OpenAI)
			if dataStr == "[DONE]" {
				continue
			}

			// Keep last valid JSON chunk
			lastDataChunk = []byte(dataStr)
		}
	}

	if err := scanner.Err(); err != nil {
		return TokenUsage{}, fmt.Errorf("error reading stream: %w", err)
	}

	// Extract tokens from last chunk
	if len(lastDataChunk) > 0 {
		return ExtractTokensFromResponse(provider, lastDataChunk)
	}

	// If no usage in stream chunks, check if buffer contains complete JSON
	if buf.Len() > 0 {
		return ExtractTokensFromResponse(provider, buf.Bytes())
	}

	return TokenUsage{}, fmt.Errorf("no token usage found in streaming response")
}

// TeeReaderWithCallback creates a TeeReader that calls a callback with the full body
// Useful for pass-through streaming while still capturing the response
func TeeReaderWithCallback(reader io.Reader, callback func([]byte)) io.Reader {
	buf := new(bytes.Buffer)
	
	return io.TeeReader(reader, io.MultiWriter(buf, &callbackWriter{
		buf:      buf,
		callback: callback,
	}))
}

// callbackWriter wraps a buffer and calls callback when done
type callbackWriter struct {
	buf      *bytes.Buffer
	callback func([]byte)
}

func (w *callbackWriter) Write(p []byte) (n int, err error) {
	// This will be called for each chunk
	// The actual callback will be triggered separately when stream is complete
	return len(p), nil
}
