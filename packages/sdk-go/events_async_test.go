package rateguard

import (
	"context"
	"net/http"
	"net/http/httptest"
	"sync"
	"testing"
	"time"
)

// gatedRecordingEmitter captures delivered events; optional gate blocks
// delivery until released, making full-queue scenarios deterministic.
type gatedRecordingEmitter struct {
	mu     sync.Mutex
	events []EventEnvelope
	gate   chan struct{} // when non-nil, each Emit waits for one receive
}

func (r *gatedRecordingEmitter) Emit(_ context.Context, event EventEnvelope) error {
	if r.gate != nil {
		<-r.gate
	}
	r.mu.Lock()
	defer r.mu.Unlock()
	r.events = append(r.events, event)
	return nil
}

func (r *gatedRecordingEmitter) count() int {
	r.mu.Lock()
	defer r.mu.Unlock()
	return len(r.events)
}

func TestAsyncEmitterDeliversAndDrainsOnClose(t *testing.T) {
	inner := &gatedRecordingEmitter{}
	e := NewAsyncEventEmitter(inner, AsyncEmitterOptions{QueueSize: 8})

	for i := 0; i < 5; i++ {
		if err := e.Emit(context.Background(), EventEnvelope{EventID: newEventID()}); err != nil {
			t.Fatalf("emit: %v", err)
		}
	}
	ctx, cancel := context.WithTimeout(context.Background(), 5*time.Second)
	defer cancel()
	if err := e.Close(ctx); err != nil {
		t.Fatalf("close: %v", err)
	}
	if got := inner.count(); got != 5 {
		t.Fatalf("delivered %d events, want 5", got)
	}
	if e.Dropped() != 0 {
		t.Fatalf("dropped %d, want 0", e.Dropped())
	}
}

func TestAsyncEmitterNeverBlocksAndCountsDrops(t *testing.T) {
	gate := make(chan struct{})
	inner := &gatedRecordingEmitter{gate: gate}
	e := NewAsyncEventEmitter(inner, AsyncEmitterOptions{QueueSize: 2})

	// First event is picked up by the worker and blocks on the gate.
	// The next 2 fill the queue. Everything beyond must drop, instantly.
	deadline := time.Now().Add(2 * time.Second)
	for i := 0; i < 13; i++ {
		if err := e.Emit(context.Background(), EventEnvelope{}); err != nil {
			t.Fatalf("emit %d: %v", i, err)
		}
	}
	if time.Now().After(deadline) {
		t.Fatal("Emit blocked — hot path violation")
	}

	// 1 in flight + 2 queued = 3 accepted; 10 dropped. The worker may not
	// have taken the first event off the queue yet, so allow 10 or 11.
	if d := e.Dropped(); d != 10 && d != 11 {
		t.Fatalf("dropped %d, want 10 or 11", d)
	}

	// Release everything and drain.
	go func() {
		for range [3]struct{}{} {
			gate <- struct{}{}
		}
	}()
	ctx, cancel := context.WithTimeout(context.Background(), 5*time.Second)
	defer cancel()
	if err := e.Close(ctx); err != nil {
		t.Fatalf("close: %v", err)
	}
	if got, want := uint64(inner.count())+e.Dropped(), uint64(13); got != want {
		t.Fatalf("delivered+dropped = %d, want %d", got, want)
	}
}

func TestAsyncEmitterIgnoresRequestContextCancellation(t *testing.T) {
	inner := &gatedRecordingEmitter{}
	e := NewAsyncEventEmitter(inner, AsyncEmitterOptions{})

	ctx, cancel := context.WithCancel(context.Background())
	cancel() // the request is already over — delivery must still happen
	if err := e.Emit(ctx, EventEnvelope{EventID: "after-cancel"}); err != nil {
		t.Fatalf("emit: %v", err)
	}
	closeCtx, closeCancel := context.WithTimeout(context.Background(), 5*time.Second)
	defer closeCancel()
	if err := e.Close(closeCtx); err != nil {
		t.Fatalf("close: %v", err)
	}
	if inner.count() != 1 {
		t.Fatalf("event emitted with canceled request context was not delivered")
	}
}

func TestAsyncEmitterCloseTimesOutButKeepsDraining(t *testing.T) {
	gate := make(chan struct{})
	inner := &gatedRecordingEmitter{gate: gate}
	e := NewAsyncEventEmitter(inner, AsyncEmitterOptions{QueueSize: 4})
	_ = e.Emit(context.Background(), EventEnvelope{})

	ctx, cancel := context.WithTimeout(context.Background(), 50*time.Millisecond)
	defer cancel()
	if err := e.Close(ctx); err == nil {
		t.Fatal("Close should report ctx expiry while delivery is blocked")
	}

	// Background worker must still finish once unblocked.
	gate <- struct{}{}
	waitCtx, waitCancel := context.WithTimeout(context.Background(), 5*time.Second)
	defer waitCancel()
	if err := e.Close(waitCtx); err != nil {
		t.Fatalf("second close should observe the drain: %v", err)
	}
	if inner.count() != 1 {
		t.Fatalf("delivered %d, want 1", inner.count())
	}
}

func TestAsyncEmitterEmitAfterCloseDropsWithoutPanic(t *testing.T) {
	inner := &gatedRecordingEmitter{}
	e := NewAsyncEventEmitter(inner, AsyncEmitterOptions{})
	ctx, cancel := context.WithTimeout(context.Background(), time.Second)
	defer cancel()
	_ = e.Close(ctx)

	if err := e.Emit(context.Background(), EventEnvelope{}); err != nil {
		t.Fatalf("emit after close: %v", err)
	}
	if e.Dropped() != 1 {
		t.Fatalf("dropped %d, want 1", e.Dropped())
	}
}

func TestSDKEventEndpointIsAsyncAndShutdownDrains(t *testing.T) {
	received := make(chan struct{}, 16)
	release := make(chan struct{})
	srv := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, _ *http.Request) {
		<-release // webhook endpoint is slow
		received <- struct{}{}
		w.WriteHeader(http.StatusNoContent)
	}))
	defer srv.Close()

	s := New(Config{Preset: "standard", EventEndpoint: srv.URL})
	if s.asyncEmitter == nil {
		t.Fatal("EventEndpoint config must produce the async emitter")
	}

	// A request through the middleware must complete without waiting on
	// the (blocked) webhook endpoint.
	h := s.HTTPMiddleware(http.HandlerFunc(func(w http.ResponseWriter, _ *http.Request) {
		w.WriteHeader(http.StatusOK)
	}))
	rec := httptest.NewRecorder()
	done := make(chan struct{})
	go func() {
		h.ServeHTTP(rec, httptest.NewRequest(http.MethodGet, "/x", nil))
		close(done)
	}()
	select {
	case <-done:
		// request finished while webhook is still blocked — async proven
	case <-time.After(3 * time.Second):
		t.Fatal("request blocked on webhook delivery")
	}

	close(release)
	ctx, cancel := context.WithTimeout(context.Background(), 5*time.Second)
	defer cancel()
	if err := s.Shutdown(ctx); err != nil {
		t.Fatalf("shutdown: %v", err)
	}
	select {
	case <-received:
	default:
		t.Fatal("Shutdown returned before the queued event was delivered")
	}
}
