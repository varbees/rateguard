package rateguard

import (
	"bytes"
	"io"
	"net/http"
	"testing"
)

// The SSE scanner and usage extractor parse untrusted provider output.
// Fuzzing enforces two invariants: never panic, and never alter the bytes
// delivered to the caller (rule 11: transports must be byte-transparent).

func FuzzStreamUsageBodyTransparency(f *testing.F) {
	f.Add([]byte("data: {\"usage\":{\"total_tokens\":5}}\n\ndata: [DONE]\n"))
	f.Add([]byte("data: {\"usage\":null}\r\ndata: {\"usage\":{\"input_tokens\":1,\"output_tokens\":2}}"))
	f.Add([]byte("event: message_start\ndata: {\"message\":{\"usage\":{\"input_tokens\":42}}}\n"))
	f.Add([]byte(""))
	f.Add([]byte("no newline at all"))
	f.Add(bytes.Repeat([]byte("data: x"), 10_000))

	f.Fuzz(func(t *testing.T, payload []byte) {
		body := newStreamUsageBody(io.NopCloser(bytes.NewReader(payload)), func(TokenUsage, int64, bool) {}, nil)
		received, err := io.ReadAll(body)
		if err != nil {
			t.Fatalf("read error on valid reader: %v", err)
		}
		if !bytes.Equal(received, payload) {
			t.Fatalf("byte transparency violated: in %d bytes, out %d bytes", len(payload), len(received))
		}
		_ = body.Close()
	})
}

func FuzzExtractTokenUsageFromBody(f *testing.F) {
	f.Add([]byte(`{"usage":{"prompt_tokens":1,"completion_tokens":2,"total_tokens":3}}`))
	f.Add([]byte(`{"usage":{"inputTokens":246,"outputTokens":557,"totalTokens":803}}`))
	f.Add([]byte(`{"usageMetadata":{"promptTokenCount":5,"candidatesTokenCount":7,"totalTokenCount":12}}`))
	f.Add([]byte(`{"usage":null}`))
	f.Add([]byte(`[{"usage":{"total_tokens":1}}]`))
	f.Add([]byte(`{"usage":{"total_tokens":"not-a-number"}}`))
	f.Add([]byte(`{`))

	f.Fuzz(func(t *testing.T, payload []byte) {
		usage, ok := extractTokenUsageFromBody(payload)
		if ok && usage.TotalTokens <= 0 {
			t.Fatalf("extractor claimed success with non-positive total: %+v", usage)
		}
		// partialUsageFromBody must also never panic on garbage.
		_ = partialUsageFromBody(payload)
	})
}

func FuzzDetectLLMCall(f *testing.F) {
	f.Add("api.openai.com", "/v1/chat/completions")
	f.Add("bedrock-runtime.us-east-1.amazonaws.com", "/model/a%2Fb/invoke")
	f.Add("", "")
	f.Add("generativelanguage.googleapis.com", "/models/:generateContent")

	f.Fuzz(func(t *testing.T, host, path string) {
		httpReq, err := http.NewRequest(http.MethodPost, "https://"+host+path, nil)
		if err != nil {
			return // invalid URL — nothing to detect
		}
		_ = detectLLMCall(httpReq)
	})
}
