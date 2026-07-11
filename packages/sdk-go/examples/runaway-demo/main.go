// Command runaway-demo is the "watch a runaway agent get halted" demo.
//
// It runs a real RateGuard-wrapped HTTP client against a local fake provider,
// so it needs NO API key, spends NO money, and produces the exact same output
// every time. An agent loops with no natural stop condition; RateGuard halts it
// the instant its token budget runs out, from inside the process.
//
// Record it:
//
//	go run ./examples/runaway-demo            # the halt (the money shot, ~25s)
//	go run ./examples/runaway-demo -contrast  # unguarded loop first, then guarded
//	go run ./examples/runaway-demo -pace 0    # no pacing (fast, for a quick check)
//
// See examples/runaway-demo/README.md for the recording runbook.
package main

import (
	"flag"
	"fmt"
	"io"
	"net/http"
	"net/http/httptest"
	"strings"
	"time"

	rateguard "github.com/varbees/rateguard/packages/sdk-go"
)

const (
	budget        = 5_000 // tokens/hour, hard stop
	promptTok     = 300
	completionTok = 200
	callTok       = promptTok + completionTok
)

// fakeProvider returns an OpenAI-shaped chat completion with realistic usage,
// so RateGuard's usage extraction and pricing run exactly as they would live.
func fakeProvider() *httptest.Server {
	return httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		w.Header().Set("Content-Type", "application/json")
		fmt.Fprintf(w, `{"model":"gpt-4o","choices":[{"message":{"content":"...summary..."}}],`+
			`"usage":{"prompt_tokens":%d,"completion_tokens":%d,"total_tokens":%d}}`,
			promptTok, completionTok, callTok)
	}))
}

func bar(used int) string {
	const width = 10
	filled := min(used*width/budget, width)
	return strings.Repeat("#", filled) + strings.Repeat(".", width-filled)
}

func newCall(url string) *http.Request {
	req, _ := http.NewRequest(http.MethodPost, url+"/v1/chat/completions",
		strings.NewReader(`{"model":"gpt-4o","messages":[{"role":"user","content":"summarize the next chunk"}]}`))
	return req
}

func main() {
	pace := flag.Duration("pace", 250*time.Millisecond, "delay between calls, for recording")
	contrast := flag.Bool("contrast", false, "run the unguarded loop first, then the guarded one")
	flag.Parse()

	server := fakeProvider()
	defer server.Close()

	fmt.Println()
	fmt.Println("  RateGuard: runaway agent demo")
	fmt.Println("  =============================================")
	fmt.Println("  Task:   an agent summarizing a doc set, one LLM call per chunk.")
	fmt.Printf("  Budget: %s tokens/hour, hard stop.   Model: gpt-4o.\n", comma(budget))
	fmt.Println("  Guard:  in-process, wrapping the OpenAI HTTP client. No proxy.")
	fmt.Println()

	if *contrast {
		runUnguarded(server.URL, *pace)
		fmt.Println()
		fmt.Println("  Now the same loop, guarded by RateGuard:")
		fmt.Println()
	}
	runGuarded(server.URL, *pace)

	fmt.Println()
	fmt.Println("  =============================================")
	fmt.Println("  No budget means no stop condition: the loop runs until the docs")
	fmt.Println("  or the bill run out. Real runaways have hit $6,531 overnight.")
	fmt.Println("  RateGuard stopped this one at the line you set, in-process,")
	fmt.Println("  before the spend. One wrapped client. No gateway.")
	fmt.Println()
}

// runGuarded is the real thing: a RateGuard-wrapped client, a budget, and a
// loop that keeps calling until RateGuard synthesizes a 429 and halts it.
func runGuarded(url string, pace time.Duration) {
	rg := rateguard.New(rateguard.Config{
		TokenBudgetPerHour:        budget,
		TokenBudgetMode:           "hard-stop",
		EstimatedTokensPerRequest: callTok,
	})
	client := rg.WrapClient(&http.Client{})

	used := 0
	for call := 1; ; call++ {
		time.Sleep(pace)
		resp, err := client.Do(newCall(url))
		if err != nil {
			fmt.Println("  call failed:", err)
			return
		}
		blocked := resp.StatusCode == http.StatusTooManyRequests &&
			resp.Header.Get("X-RateGuard-Synthesized") == "true"
		_, _ = io.ReadAll(resp.Body)
		_ = resp.Body.Close()

		if blocked {
			fmt.Printf("  call %2d   BLOCKED  429 token_budget_exceeded\n", call)
			fmt.Println("            RateGuard halted the agent before the request left your process.")
			return
		}

		used += callTok
		cost := rateguard.EstimateCost("gpt-4o", int64(promptTok*call), int64(completionTok*call))
		fmt.Printf("  call %2d   +%d tok   used %5s / %s   [%s]   $%.4f\n",
			call, callTok, comma(used), comma(budget), bar(used), cost)
	}
}

// runUnguarded shows the contrast: the identical loop with no RateGuard. It
// blows straight past the budget you meant to set and keeps going (capped here
// only so the demo terminates; a real one does not stop on its own).
func runUnguarded(url string, pace time.Duration) {
	client := &http.Client{}
	used := 0
	for call := 1; call <= 15; call++ {
		time.Sleep(pace)
		resp, err := client.Do(newCall(url))
		if err != nil {
			fmt.Println("  call failed:", err)
			return
		}
		_, _ = io.ReadAll(resp.Body)
		_ = resp.Body.Close()

		used += callTok
		over := ""
		if used > budget {
			over = "  << past the budget, still going"
		}
		fmt.Printf("  call %2d   +%d tok   used %5s / %s%s\n", call, callTok, comma(used), comma(budget), over)
	}
	fmt.Println("  ...   (no stop condition; capped at 15 so the demo ends)")
}

// comma formats an int with thousands separators, no dependency.
func comma(n int) string {
	s := fmt.Sprintf("%d", n)
	if len(s) <= 3 {
		return s
	}
	var out []byte
	for i, c := range []byte(s) {
		if i > 0 && (len(s)-i)%3 == 0 {
			out = append(out, ',')
		}
		out = append(out, c)
	}
	return string(out)
}
