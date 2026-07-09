package rateguard

import (
	"context"
	"sync"
	"sync/atomic"
	"time"
)

// ── Async Event Emission — webhooks off the request hot path ──
//
// HTTPEventEmitter posts synchronously: used directly, it puts a network
// round-trip (up to its 5s timeout) inside every request. AsyncEventEmitter
// wraps any EventEmitter with a bounded queue and one background worker so
// the hot path pays O(1): a non-blocking channel send.
//
// Semantics, chosen deliberately and documented rather than implied:
//   - Emit never blocks and never returns an error. If the queue is full
//     (delivery slower than event production), the incoming event is
//     DROPPED and counted — telemetry must degrade, never the request
//     path. Read Dropped() to alert on loss.
//   - Delivery uses a background context, not the request's: the request
//     finishing (or being canceled) must not cancel event delivery —
//     which was a latent bug of the synchronous call it replaces.
//   - Close stops intake and waits for the queue to drain until ctx
//     expires. If ctx expires first, Close returns ctx.Err() while the
//     worker keeps draining in the background — undelivered events are
//     lost only if the process exits before it finishes.
//
// SDKs constructed with Config.EventEndpoint get this wrapper by default;
// a custom Config.EventEmitter is used exactly as given (wrap it yourself
// if you want the queue).

const defaultEventQueueSize = 1024

// AsyncEmitterOptions configures an AsyncEventEmitter.
type AsyncEmitterOptions struct {
	// QueueSize bounds how many events may wait for delivery. Default 1024.
	QueueSize int
	// PerEventTimeout bounds each delivery attempt. Default 10s (the
	// wrapped HTTP emitter's own 5s client timeout usually fires first).
	PerEventTimeout time.Duration
}

// AsyncEventEmitter delivers events via a bounded queue and a single
// background worker. Safe for concurrent use.
type AsyncEventEmitter struct {
	inner   EventEmitter
	ch      chan EventEnvelope
	timeout time.Duration

	dropped   atomic.Uint64
	closeOnce sync.Once
	done      chan struct{} // closed when the worker has drained and exited
}

// NewAsyncEventEmitter wraps inner with a bounded async delivery queue.
func NewAsyncEventEmitter(inner EventEmitter, opts AsyncEmitterOptions) *AsyncEventEmitter {
	if opts.QueueSize <= 0 {
		opts.QueueSize = defaultEventQueueSize
	}
	if opts.PerEventTimeout <= 0 {
		opts.PerEventTimeout = 10 * time.Second
	}
	e := &AsyncEventEmitter{
		inner:   inner,
		ch:      make(chan EventEnvelope, opts.QueueSize),
		timeout: opts.PerEventTimeout,
		done:    make(chan struct{}),
	}
	go e.worker()
	return e
}

// Emit enqueues the event and returns immediately. It never blocks: when
// the queue is full the event is dropped and counted. The passed context
// is intentionally ignored for delivery (see package comment). Emitting
// after Close counts as a drop.
func (e *AsyncEventEmitter) Emit(_ context.Context, event EventEnvelope) error {
	defer func() {
		// A send on a closed channel panics; treat racing Emit/Close as a
		// drop rather than a crash.
		if recover() != nil {
			e.dropped.Add(1)
		}
	}()
	select {
	case e.ch <- event:
	default:
		e.dropped.Add(1)
	}
	return nil
}

// Dropped reports how many events were discarded (queue full, or emitted
// after Close).
func (e *AsyncEventEmitter) Dropped() uint64 {
	return e.dropped.Load()
}

// Close stops intake and waits for the queue to drain until ctx expires.
// On ctx expiry it returns ctx.Err() while the worker keeps draining in
// the background. Safe to call more than once.
func (e *AsyncEventEmitter) Close(ctx context.Context) error {
	e.closeOnce.Do(func() { close(e.ch) })
	select {
	case <-e.done:
		return nil
	case <-ctx.Done():
		return ctx.Err()
	}
}

func (e *AsyncEventEmitter) worker() {
	defer close(e.done)
	for event := range e.ch {
		ctx, cancel := context.WithTimeout(context.Background(), e.timeout)
		// Delivery failures are the inner emitter's story (HTTPEventEmitter
		// returns them; the sync call site used to log them). Here a failed
		// delivery is final — no retry queue in-process by design; pair the
		// endpoint with its own durability if events must not be lost.
		_ = e.inner.Emit(ctx, event)
		cancel()
	}
}
