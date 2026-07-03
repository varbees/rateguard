package rateguard

import (
	"bufio"
	"bytes"
	"io"
	"strings"
)

// ── SSE stream usage extraction ──

// streamUsageBody wraps an SSE response body and extracts token usage from
// the final stream chunks. onComplete fires once when the stream is fully
// consumed. span is notified of each chunk for TTFT/TPOT tracking.
func newStreamUsageBody(body io.ReadCloser, onComplete func(TokenUsage, int64, bool), span *GenAISpan) io.ReadCloser {
	pr, pw := io.Pipe()

	go func() {
		defer pw.Close()
		defer body.Close()

		var chunks int64
		var usageBuf bytes.Buffer

		scanner := bufio.NewScanner(io.LimitReader(body, 64<<20)) // 64 MiB cap
		scanner.Buffer(make([]byte, 0, 64<<10), 1<<20)

		for scanner.Scan() {
			line := scanner.Text()
			chunks++

			pw.Write([]byte(line + "\n"))

			// Collect usage data from SSE data lines
			if strings.HasPrefix(line, "data: ") {
				data := strings.TrimPrefix(line, "data: ")
				if data != "[DONE]" && (strings.Contains(data, "usage") ||
					strings.Contains(data, "total_tokens") ||
					strings.Contains(data, "input_tokens") ||
					strings.Contains(data, "output_tokens")) {
					usageBuf.WriteString(data)
				}
			}

			if span != nil {
				span.RecordChunk()
			}
		}

		if usageBuf.Len() > 0 {
			usage, ok := extractTokenUsageFromBody(usageBuf.Bytes())
			onComplete(usage, chunks, ok)
			return
		}
		onComplete(TokenUsage{}, chunks, false)
	}()

	return pr
}
