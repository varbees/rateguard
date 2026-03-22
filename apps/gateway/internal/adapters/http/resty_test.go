package httpadapter

import (
	"fmt"
	"io"
	"net/http"
	"strings"
	"testing"

	"github.com/go-resty/resty/v2"
)

type roundTripperFunc func(*http.Request) (*http.Response, error)

func (f roundTripperFunc) RoundTrip(req *http.Request) (*http.Response, error) {
	return f(req)
}

func TestExecuteRestyRequest(t *testing.T) {
	t.Run("post", func(t *testing.T) {
		client := resty.New().SetTransport(roundTripperFunc(func(r *http.Request) (*http.Response, error) {
			if r.Method != http.MethodPost {
				return nil, fmt.Errorf("expected POST, got %s", r.Method)
			}
			if got := r.Header.Get("X-Test"); got != "ok" {
				return nil, fmt.Errorf("expected header ok, got %q", got)
			}
			return &http.Response{
				StatusCode: http.StatusCreated,
				Header:     http.Header{"Content-Type": []string{"text/plain"}},
				Body:       io.NopCloser(strings.NewReader("created")),
				Request:    r,
			}, nil
		}))
		req := client.R().SetHeader("X-Test", "ok").SetBody("payload")

		resp, err := ExecuteRestyRequest(req, http.MethodPost, "http://example.invalid")
		if err != nil {
			t.Fatalf("ExecuteRestyRequest returned error: %v", err)
		}
		if resp.StatusCode() != http.StatusCreated {
			t.Fatalf("expected 201, got %d", resp.StatusCode())
		}
		if string(resp.Body()) != "created" {
			t.Fatalf("unexpected body: %q", string(resp.Body()))
		}
	})

	t.Run("unsupported", func(t *testing.T) {
		client := resty.New()
		req := client.R()
		if _, err := ExecuteRestyRequest(req, "TRACE", "http://example.invalid"); err == nil {
			t.Fatal("expected error for unsupported method")
		}
	})
}
