package rateguard

import (
	"encoding/json"
	"fmt"
)

// ── Realtime usage extraction — the voice/WebSocket substrate ──
//
// Realtime voice APIs (OpenAI Realtime, Gemini Live) run over persistent
// WebSockets: one "request" is a session that can live for hours and burn
// dollars per minute. Rate limiting that thinks in requests is blind to
// them. This file extracts token usage from realtime SERVER events so a
// session can be budgeted continuously (see realtime_session.go).
//
// Transport-agnostic by design: RateGuard never touches the socket. The
// integrator feeds each inbound server frame (a copy — byte transparency
// is the caller's loop, rule 11 stays intact) to a parser and gets usage
// out. This works with any WebSocket library, any framework (Pipecat,
// LiveKit Agents), any proxying layer.
//
// Schema provenance — stated precisely because the two differ:
//   - Gemini Live: LIVE-VERIFIED 2026-07-10 against the real API
//     (models/gemini-2.5-flash-native-audio-latest, free tier).
//     usageMetadata arrives with the turn-completing message and is
//     PER-TURN (verified with a two-turn session: counts do not
//     accumulate), with modality-split detail arrays and
//     thoughtsTokenCount.
//   - OpenAI Realtime: schema-validated against the documented server
//     events (response.done carries response.usage with token detail
//     objects); live verification pending — no free tier. Azure's Q&A
//     notes these counts are estimates vs the billing meter.
//
// Session semantics that follow: usage events are SUMMED per session for
// both providers (per-response for OpenAI, per-turn for Gemini). This is
// the opposite of SSE usage inside one response (MAX-merge, rule 12) —
// realtime events each describe a disjoint slice of work.

// RealtimeProvider identifies the wire schema to parse.
type RealtimeProvider string

const (
	RealtimeProviderOpenAI RealtimeProvider = "openai"
	RealtimeProviderGemini RealtimeProvider = "gemini"
)

// RealtimeUsage is one usage observation from a realtime server event.
// All fields are token counts; zero means not reported.
type RealtimeUsage struct {
	InputTokens  int64 `json:"input_tokens"`
	OutputTokens int64 `json:"output_tokens"`
	TotalTokens  int64 `json:"total_tokens"`

	InputTextTokens   int64 `json:"input_text_tokens"`
	InputAudioTokens  int64 `json:"input_audio_tokens"`
	InputCachedTokens int64 `json:"input_cached_tokens"`
	OutputTextTokens  int64 `json:"output_text_tokens"`
	OutputAudioTokens int64 `json:"output_audio_tokens"`

	// ThoughtsTokens is Gemini's reasoning-token count (thoughtsTokenCount).
	ThoughtsTokens int64 `json:"thoughts_tokens"`
}

func (u RealtimeUsage) add(o RealtimeUsage) RealtimeUsage {
	u.InputTokens += o.InputTokens
	u.OutputTokens += o.OutputTokens
	u.TotalTokens += o.TotalTokens
	u.InputTextTokens += o.InputTextTokens
	u.InputAudioTokens += o.InputAudioTokens
	u.InputCachedTokens += o.InputCachedTokens
	u.OutputTextTokens += o.OutputTextTokens
	u.OutputAudioTokens += o.OutputAudioTokens
	u.ThoughtsTokens += o.ThoughtsTokens
	return u
}

// RealtimeEvent is the parsed view of one server frame.
type RealtimeEvent struct {
	Provider RealtimeProvider
	// Type is the provider's own event discriminator ("response.done",
	// "serverContent", ...). Unrecognized events parse fine with a Type
	// and no Usage — the stream is full of deltas that carry none.
	Type string
	// Usage is non-nil only when this event carries a usage report.
	Usage *RealtimeUsage
	// TurnComplete is true when the event marks the end of a model turn.
	TurnComplete bool
}

// ParseRealtimeEvent dispatches on provider.
func ParseRealtimeEvent(provider RealtimeProvider, raw []byte) (RealtimeEvent, error) {
	switch provider {
	case RealtimeProviderOpenAI:
		return ParseOpenAIRealtimeEvent(raw)
	case RealtimeProviderGemini:
		return ParseGeminiLiveEvent(raw)
	default:
		return RealtimeEvent{}, fmt.Errorf("rateguard: unknown realtime provider %q", provider)
	}
}

// ── OpenAI Realtime ──

type openAIRealtimeEvent struct {
	Type     string `json:"type"`
	Response struct {
		Usage *struct {
			TotalTokens       int64 `json:"total_tokens"`
			InputTokens       int64 `json:"input_tokens"`
			OutputTokens      int64 `json:"output_tokens"`
			InputTokenDetails struct {
				TextTokens   int64 `json:"text_tokens"`
				AudioTokens  int64 `json:"audio_tokens"`
				CachedTokens int64 `json:"cached_tokens"`
			} `json:"input_token_details"`
			OutputTokenDetails struct {
				TextTokens  int64 `json:"text_tokens"`
				AudioTokens int64 `json:"audio_tokens"`
			} `json:"output_token_details"`
		} `json:"usage"`
	} `json:"response"`
}

// ParseOpenAIRealtimeEvent reads one OpenAI Realtime server event. Usage
// is reported on "response.done" (one response = one model turn).
func ParseOpenAIRealtimeEvent(raw []byte) (RealtimeEvent, error) {
	var ev openAIRealtimeEvent
	if err := json.Unmarshal(raw, &ev); err != nil {
		return RealtimeEvent{}, fmt.Errorf("rateguard: parse openai realtime event: %w", err)
	}
	out := RealtimeEvent{Provider: RealtimeProviderOpenAI, Type: ev.Type}
	if ev.Type == "response.done" {
		out.TurnComplete = true
		if u := ev.Response.Usage; u != nil {
			out.Usage = &RealtimeUsage{
				InputTokens:       u.InputTokens,
				OutputTokens:      u.OutputTokens,
				TotalTokens:       u.TotalTokens,
				InputTextTokens:   u.InputTokenDetails.TextTokens,
				InputAudioTokens:  u.InputTokenDetails.AudioTokens,
				InputCachedTokens: u.InputTokenDetails.CachedTokens,
				OutputTextTokens:  u.OutputTokenDetails.TextTokens,
				OutputAudioTokens: u.OutputTokenDetails.AudioTokens,
			}
		}
	}
	return out, nil
}

// ── Gemini Live ──

type geminiLiveEvent struct {
	ServerContent *struct {
		TurnComplete bool `json:"turnComplete"`
	} `json:"serverContent"`
	SetupComplete *struct{} `json:"setupComplete"`
	UsageMetadata *struct {
		PromptTokenCount    int64                `json:"promptTokenCount"`
		ResponseTokenCount  int64                `json:"responseTokenCount"`
		TotalTokenCount     int64                `json:"totalTokenCount"`
		ThoughtsTokenCount  int64                `json:"thoughtsTokenCount"`
		PromptTokensDetails []geminiModalitySpan `json:"promptTokensDetails"`
		ResponseTokensDeets []geminiModalitySpan `json:"responseTokensDetails"`
	} `json:"usageMetadata"`
}

type geminiModalitySpan struct {
	Modality   string `json:"modality"`
	TokenCount int64  `json:"tokenCount"`
}

// ParseGeminiLiveEvent reads one Gemini Live server message. Usage rides
// usageMetadata (observed arriving with the turn-completing message) and
// is per-turn — verified against the live API, see the package comment.
func ParseGeminiLiveEvent(raw []byte) (RealtimeEvent, error) {
	var ev geminiLiveEvent
	if err := json.Unmarshal(raw, &ev); err != nil {
		return RealtimeEvent{}, fmt.Errorf("rateguard: parse gemini live event: %w", err)
	}
	out := RealtimeEvent{Provider: RealtimeProviderGemini}
	switch {
	case ev.SetupComplete != nil:
		out.Type = "setupComplete"
	case ev.ServerContent != nil:
		out.Type = "serverContent"
		out.TurnComplete = ev.ServerContent.TurnComplete
	default:
		out.Type = "unknown"
	}
	if ev.UsageMetadata != nil {
		u := &RealtimeUsage{
			InputTokens:    ev.UsageMetadata.PromptTokenCount,
			OutputTokens:   ev.UsageMetadata.ResponseTokenCount,
			TotalTokens:    ev.UsageMetadata.TotalTokenCount,
			ThoughtsTokens: ev.UsageMetadata.ThoughtsTokenCount,
		}
		for _, d := range ev.UsageMetadata.PromptTokensDetails {
			switch d.Modality {
			case "TEXT":
				u.InputTextTokens += d.TokenCount
			case "AUDIO":
				u.InputAudioTokens += d.TokenCount
			}
		}
		for _, d := range ev.UsageMetadata.ResponseTokensDeets {
			switch d.Modality {
			case "TEXT":
				u.OutputTextTokens += d.TokenCount
			case "AUDIO":
				u.OutputAudioTokens += d.TokenCount
			}
		}
		out.Usage = u
	}
	return out, nil
}
