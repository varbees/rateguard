package rateguard

import (
	"bytes"
	"encoding/json"
	"io"
	"sync"
)

// ── SSE stream usage extraction ──
//
// Wraps a streaming response body as a transparent tee: the caller receives
// the exact bytes the provider sent (nothing rewritten, nothing withheld),
// while a bounded incremental scanner extracts token usage on the side.
//
// Provider shapes handled:
//   OpenAI (stream_options.include_usage): intermediate chunks carry
//     "usage":null; the FINAL chunk carries real usage. Chunks must be
//     decoded individually and merged — concatenating them breaks decoding.
//   Anthropic: input tokens arrive in the FIRST event (message_start);
//     output tokens arrive in the LAST (message_delta). Merge takes the
//     maximum of each field across events.
//   OpenAI-compatible hosts (Groq, DeepSeek, ...): same as OpenAI.

const (
	sseMaxCandidates    = 8         // usage-bearing events kept (first half + last half)
	sseMaxCandidateSize = 64 << 10  // per-event payload cap
	sseMaxLineBuffer    = 256 << 10 // partial-line accumulator cap
)

type streamUsageBody struct {
	src        io.ReadCloser
	span       *GenAISpan
	onComplete func(usage TokenUsage, chunks int64, ok bool)

	mu         sync.Mutex
	lineBuf    []byte
	overlong   bool // current line exceeded sseMaxLineBuffer; count it, skip capture
	dataEvents int64
	head       [][]byte // first usage-bearing payloads (Anthropic message_start)
	tail       [][]byte // most recent usage-bearing payloads (final usage chunks)
	finished   bool
}

// newStreamUsageBody wraps an SSE response body. onComplete fires exactly
// once — when the stream is fully read or closed.
func newStreamUsageBody(body io.ReadCloser, onComplete func(TokenUsage, int64, bool), span *GenAISpan) io.ReadCloser {
	return &streamUsageBody{src: body, span: span, onComplete: onComplete}
}

func (b *streamUsageBody) Read(p []byte) (int, error) {
	n, err := b.src.Read(p)
	if n > 0 {
		b.scan(p[:n])
	}
	if err == io.EOF {
		b.finish()
	}
	return n, err
}

func (b *streamUsageBody) Close() error {
	b.finish()
	return b.src.Close()
}

// scan consumes a raw chunk, splitting it into SSE lines. The caller's
// bytes are never modified — scan works on its own copies.
func (b *streamUsageBody) scan(chunk []byte) {
	b.mu.Lock()
	defer b.mu.Unlock()
	if b.finished {
		return
	}

	rest := chunk
	for {
		idx := bytes.IndexByte(rest, '\n')
		if idx == -1 {
			if !b.overlong {
				b.lineBuf = append(b.lineBuf, rest...)
				if len(b.lineBuf) > sseMaxLineBuffer {
					b.overlong = true
					b.lineBuf = b.lineBuf[:sseMaxLineBuffer]
				}
			}
			return
		}

		line := rest[:idx]
		rest = rest[idx+1:]

		if len(b.lineBuf) > 0 || b.overlong {
			line = append(b.lineBuf, line...) //nolint:gocritic // deliberate join of carry + fragment
		}
		b.processLine(line)
		b.lineBuf = b.lineBuf[:0]
		b.overlong = false
	}
}

func (b *streamUsageBody) processLine(line []byte) {
	line = bytes.TrimSuffix(line, []byte("\r"))
	if !bytes.HasPrefix(line, []byte("data:")) {
		return
	}

	payload := bytes.TrimSpace(line[len("data:"):])
	if len(payload) == 0 || bytes.Equal(payload, []byte("[DONE]")) {
		return
	}

	b.dataEvents++
	if b.span != nil {
		b.span.RecordChunk()
	}

	if len(payload) > sseMaxCandidateSize || !payloadMentionsUsage(payload) {
		return
	}

	copied := append([]byte(nil), payload...)
	if len(b.head) < sseMaxCandidates/2 {
		b.head = append(b.head, copied)
		return
	}
	b.tail = append(b.tail, copied)
	if len(b.tail) > sseMaxCandidates/2 {
		b.tail = b.tail[1:]
	}
}

func payloadMentionsUsage(payload []byte) bool {
	return bytes.Contains(payload, []byte("usage")) ||
		bytes.Contains(payload, []byte("usageMetadata")) ||
		bytes.Contains(payload, []byte("total_tokens")) ||
		bytes.Contains(payload, []byte("input_tokens")) ||
		bytes.Contains(payload, []byte("output_tokens"))
}

func (b *streamUsageBody) finish() {
	b.mu.Lock()
	if b.finished {
		b.mu.Unlock()
		return
	}

	// A final line without a trailing newline still counts.
	if len(b.lineBuf) > 0 && !b.overlong {
		b.processLine(append([]byte(nil), b.lineBuf...))
		b.lineBuf = nil
	}
	b.finished = true

	candidates := append(append([][]byte(nil), b.head...), b.tail...)
	chunks := b.dataEvents
	b.mu.Unlock()

	usage, ok := mergeUsageCandidates(candidates)
	if b.onComplete != nil {
		b.onComplete(usage, chunks, ok)
	}
}

// mergeUsageCandidates decodes each usage-bearing SSE payload individually
// and merges the results. Later/larger values win per field: Anthropic
// reports input tokens early and output tokens late; OpenAI's final chunk
// carries the whole picture while intermediates carry "usage":null.
func mergeUsageCandidates(candidates [][]byte) (TokenUsage, bool) {
	var merged TokenUsage
	found := false

	for _, candidate := range candidates {
		usage, ok := extractTokenUsageFromBody(candidate)
		if !ok {
			// Events with partial usage (e.g. message_start's input-only)
			// fail the TotalTokens>0 check inside the extractor when only
			// one side is present at value zero — still merge fields.
			usage = partialUsageFromBody(candidate)
			if usage == (TokenUsage{}) {
				continue
			}
		}
		found = true
		if usage.InputTokens > merged.InputTokens {
			merged.InputTokens = usage.InputTokens
		}
		if usage.OutputTokens > merged.OutputTokens {
			merged.OutputTokens = usage.OutputTokens
		}
		if usage.TotalTokens > merged.TotalTokens {
			merged.TotalTokens = usage.TotalTokens
		}
		if usage.Model != "" {
			merged.Model = usage.Model
		}
		if usage.Provider != "" {
			merged.Provider = usage.Provider
		}
	}

	if sum := merged.InputTokens + merged.OutputTokens; sum > merged.TotalTokens {
		merged.TotalTokens = sum
	}
	return merged, found && merged.TotalTokens > 0
}

// partialUsageFromBody extracts whatever usage fields are present without
// requiring a nonzero total (Anthropic's message_start carries input only).
func partialUsageFromBody(body []byte) TokenUsage {
	if !looksLikeJSON(body) {
		return TokenUsage{}
	}

	var payload tokenJSONPayload
	decoder := json.NewDecoder(bytes.NewReader(body))
	decoder.UseNumber()
	if err := decoder.Decode(&payload); err != nil {
		return TokenUsage{}
	}

	usage := TokenUsage{}
	if model, ok := stringField(payload, "model"); ok {
		usage.Model = model
	}

	sources := []tokenJSONPayload{payload}
	if nested, ok := objectField(payload, "message"); ok {
		sources = append(sources, nested)
		if model, ok := stringField(nested, "model"); ok && usage.Model == "" {
			usage.Model = model
		}
	}

	for _, source := range sources {
		if data, ok := objectField(source, "usage"); ok {
			if usage.InputTokens == 0 {
				usage.InputTokens = firstNumber(data, "prompt_tokens", "input_tokens", "inputTokens", "promptTokenCount")
			}
			if usage.OutputTokens == 0 {
				usage.OutputTokens = firstNumber(data, "completion_tokens", "output_tokens", "outputTokens", "candidatesTokenCount")
			}
			if usage.TotalTokens == 0 {
				usage.TotalTokens = firstNumber(data, "total_tokens", "totalTokens", "totalTokenCount")
			}
		}
	}

	return usage
}
