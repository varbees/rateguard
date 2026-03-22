package proxy

import (
	"bytes"
	"fmt"
)

type streamingTokenAccumulator struct {
	body     bytes.Buffer
	provider string
}

func NewStreamingTokenAccumulator(provider string) *streamingTokenAccumulator {
	return &streamingTokenAccumulator{provider: provider}
}

func (a *streamingTokenAccumulator) Write(p []byte) {
	if len(p) == 0 {
		return
	}

	_, _ = a.body.Write(p)
}

func (a *streamingTokenAccumulator) Finish() (TokenUsage, error) {
	if a == nil {
		return TokenUsage{}, fmt.Errorf("streaming token accumulator is nil")
	}

	return ExtractTokensFromStreamingResponse(a.provider, bytes.NewReader(a.body.Bytes()))
}
