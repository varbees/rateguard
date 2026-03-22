package pool

import (
	"context"
	"fmt"
	"net/http"
	"net/http/httptest"
	"strings"
	"sync"
	"testing"
	"time"

	"github.com/varbees/rateguard/internal/models"
	"github.com/varbees/rateguard/pkg/logger"
)

var setupOnce sync.Once

func setupTest() {
	setupOnce.Do(func() {
		logger.Initialize(logger.Config{
			Level:       "error", // Minimal logging for tests
			Format:      "console",
			Development: true,
		})
	})
}

func newTestHTTPServer(t testing.TB, handler http.Handler) (server *httptest.Server) {
	t.Helper()

	defer func() {
		if r := recover(); r != nil {
			message := fmt.Sprint(r)
			if strings.Contains(message, "failed to listen on a port") || strings.Contains(message, "operation not permitted") {
				t.Skip("skipping listener-dependent test: local sockets are unavailable in this environment")
			}
			panic(r)
		}
	}()

	return httptest.NewServer(handler)
}

func TestNetworkerPoolCreation(t *testing.T) {
	setupTest()

	pool := NetworkerPool(5, 10)
	if pool == nil {
		t.Fatal("Expected pool to be created, got nil")
	}
	defer pool.Shutdown()

	if pool.workerCount != 5 {
		t.Errorf("Expected worker count 5, got %d", pool.workerCount)
	}
}

func TestWorkerPoolSubmitAndRetrieve(t *testing.T) {
	setupTest()

	pool := NetworkerPool(3, 10)
	defer pool.Shutdown()

	// Create mock server
	server := newTestHTTPServer(t, http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		time.Sleep(100 * time.Millisecond)
		w.WriteHeader(http.StatusOK)
	}))
	defer server.Close()

	// Create a test job
	job := models.FetchJob{
		ID: "test-1",
		Source: models.APISource{
			Name:    "Test API",
			URL:     server.URL,
			Method:  "GET",
			Timeout: 5 * time.Second,
		},
		Context: context.Background(),
	}

	// Submit job
	err := pool.Submit(job)
	if err != nil {
		t.Fatalf("Failed to submit job: %v", err)
	}

	// Wait for result with timeout
	select {
	case result := <-pool.Results():
		if result.ID != "test-1" {
			t.Errorf("Expected job ID 'test-1', got '%s'", result.ID)
		}
		if result.Error != nil {
			t.Errorf("Expected no error, got: %v", result.Error)
		}
	case <-time.After(10 * time.Second):
		t.Fatal("Timeout waiting for result")
	}
}

func TestWorkerPoolConcurrency(t *testing.T) {
	setupTest()

	pool := NetworkerPool(5, 20)
	defer pool.Shutdown()

	jobCount := 10
	jobs := make([]models.FetchJob, jobCount)

	// Create mock server
	server := newTestHTTPServer(t, http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		w.WriteHeader(http.StatusOK)
	}))
	defer server.Close()

	// Create multiple jobs
	for i := 0; i < jobCount; i++ {
		jobs[i] = models.FetchJob{
			ID: string(rune(i)),
			Source: models.APISource{
				Name:    "Test API",
				URL:     server.URL,
				Method:  "GET",
				Timeout: 5 * time.Second,
			},
			Context: context.Background(),
		}
	}

	// Submit all jobs
	for _, job := range jobs {
		if err := pool.Submit(job); err != nil {
			t.Fatalf("Failed to submit job: %v", err)
		}
	}

	// Collect results
	results := make([]models.FetchResult, 0, jobCount)
	timeout := time.After(15 * time.Second)

	for i := 0; i < jobCount; i++ {
		select {
		case result := <-pool.Results():
			results = append(results, result)
		case <-timeout:
			t.Fatalf("Timeout waiting for results, got %d/%d", len(results), jobCount)
		}
	}

	if len(results) != jobCount {
		t.Errorf("Expected %d results, got %d", jobCount, len(results))
	}
}

func TestWorkerPoolShutdown(t *testing.T) {
	setupTest()

	pool := NetworkerPool(3, 10)

	// Create mock server
	server := newTestHTTPServer(t, http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		time.Sleep(100 * time.Millisecond)
		w.WriteHeader(http.StatusOK)
	}))
	defer server.Close()

	// Submit a job
	job := models.FetchJob{
		ID: "shutdown-test",
		Source: models.APISource{
			Name:    "Test API",
			URL:     server.URL,
			Method:  "GET",
			Timeout: 5 * time.Second,
		},
		Context: context.Background(),
	}

	_ = pool.Submit(job)

	// Shutdown should complete without hanging
	done := make(chan bool)
	go func() {
		pool.Shutdown()
		done <- true
	}()

	select {
	case <-done:
		// Success
	case <-time.After(5 * time.Second):
		t.Fatal("Shutdown did not complete in time")
	}
}

func TestWorkerPoolContextCancellation(t *testing.T) {
	setupTest()

	pool := NetworkerPool(3, 10)
	defer pool.Shutdown()

	ctx, cancel := context.WithCancel(context.Background())

	// Create mock server
	server := newTestHTTPServer(t, http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		time.Sleep(2 * time.Second)
		w.WriteHeader(http.StatusOK)
	}))
	defer server.Close()

	job := models.FetchJob{
		ID: "cancel-test",
		Source: models.APISource{
			Name:    "Test API",
			URL:     server.URL,
			Method:  "GET",
			Timeout: 10 * time.Second,
		},
		Context: ctx,
	}

	_ = pool.Submit(job)

	// Cancel context immediately
	cancel()

	// Result should come back with context error
	select {
	case result := <-pool.Results():
		if result.Error == nil {
			t.Error("Expected context cancellation error")
		}
	case <-time.After(3 * time.Second):
		t.Fatal("Timeout waiting for cancelled result")
	}
}
