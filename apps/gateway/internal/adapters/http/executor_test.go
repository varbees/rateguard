package httpadapter

import (
	"errors"
	"net/http"
	"testing"
)

type fakeBreaker struct {
	err   error
	calls int
}

func (f *fakeBreaker) Call(fn func() error) error {
	f.calls++
	if f.err != nil {
		return f.err
	}
	return fn()
}

type fakeDoer struct {
	resp *http.Response
	err  error
}

func (f *fakeDoer) Do(req *http.Request) (*http.Response, error) {
	return f.resp, f.err
}

func TestExecuteWithCircuitBreakerAndRetry(t *testing.T) {
	t.Run("success", func(t *testing.T) {
		breaker := &fakeBreaker{}
		client := &fakeDoer{resp: &http.Response{StatusCode: http.StatusOK, Body: http.NoBody}}

		resp, err := ExecuteWithCircuitBreakerAndRetry(breaker, client, mustRequest(t), 0, "user", "api")
		if err != nil {
			t.Fatalf("expected nil error, got %v", err)
		}
		if resp == nil || resp.StatusCode != http.StatusOK {
			t.Fatalf("unexpected response: %#v", resp)
		}
		if breaker.calls != 1 {
			t.Fatalf("expected 1 breaker call, got %d", breaker.calls)
		}
	})

	t.Run("breaker error", func(t *testing.T) {
		boom := errors.New("breaker open")
		breaker := &fakeBreaker{err: boom}
		client := &fakeDoer{resp: &http.Response{StatusCode: http.StatusOK, Body: http.NoBody}}

		resp, err := ExecuteWithCircuitBreakerAndRetry(breaker, client, mustRequest(t), 0, "user", "api")
		if !errors.Is(err, boom) {
			t.Fatalf("expected breaker error, got %v", err)
		}
		if resp != nil {
			t.Fatalf("expected nil response, got %#v", resp)
		}
	})
}

func mustRequest(t *testing.T) *http.Request {
	t.Helper()

	req, err := http.NewRequest(http.MethodGet, "http://example.invalid", nil)
	if err != nil {
		t.Fatalf("create request: %v", err)
	}
	return req
}
