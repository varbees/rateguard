package pool

import (
	"context"
	"fmt"
	"sync"
	"time"

	"github.com/varbees/rateguard/internal/models"
	"github.com/varbees/rateguard/pkg/client"
	"github.com/varbees/rateguard/pkg/logger"
	"go.uber.org/zap"
)

type WorkerPool struct {
    workerCount int                        // Number of concurrent workers
    jobs        chan models.FetchJob       // Incoming work queue
    results     chan models.FetchResult    // Completed work queue
    httpClient  *client.HTTPClient         // Enhanced HTTP client with retry logic
    wg          sync.WaitGroup             // Tracks active workers
    ctx         context.Context            // For shutdown signaling
    cancel      context.CancelFunc         // Triggers shutdown
}

func NetworkerPool(workerCount int, queueSize int) *WorkerPool {
	
	ctx, cancel := context.WithCancel(context.Background())
	
	// Create enhanced HTTP client with retry logic
	httpClient := client.New(client.Config{
		Timeout:         30 * time.Second,
		MaxRetries:      3,                // Retry up to 3 times
		RetryDelay:      1 * time.Second,  // Exponential backoff: 1s, 2s, 3s
		MaxIdleConns:    100,
		IdleConnTimeout: 90 * time.Second,
		EnableLogs:      true,             // Log retry attempts
	})
	
	 pool := &WorkerPool{
        workerCount: workerCount,
        // Buffered channels prevent blocking when queue isn't full
        jobs:       make(chan models.FetchJob, queueSize),
        results:    make(chan models.FetchResult, queueSize),
        httpClient: httpClient,  // Use enhanced client with retry logic
        ctx:        ctx,
        cancel:     cancel,
    }

	pool.start()
	return pool
}

func (p *WorkerPool) start() {
    // Spawn exactly workerCount goroutines
    for i := 0; i < p.workerCount; i++ {
        p.wg.Add(1) // Increment WaitGroup counter
        
        logger.Info("👷 Worker spawned",
            zap.Int("worker_id", i),
            zap.Int("total_workers", p.workerCount),
        )
        
        // Launch worker in separate goroutine
        go p.worker(i)
    }

    logger.Info("🏗️  Worker pool initialized",
        zap.Int("worker_count", p.workerCount),
        zap.Int("queue_size", cap(p.jobs)),
    )

    // 🎯 KEY PATTERN: Separate goroutine to close results channel
    // WHY: Must wait for ALL workers to finish before closing results
    go func() {
        p.wg.Wait()      // Block until all workers call wg.Done()
        close(p.results) // Safe to close now - no more writes
        logger.Info("🏁 All workers completed, results channel closed")
    }()
}

// worker is the core worker function - runs in its own goroutine
func (p *WorkerPool) worker(id int) {
    defer p.wg.Done() // CRITICAL: Always decrement counter when done
    
    logger.Debug("Worker started and waiting for jobs",
        zap.Int("worker_id", id),
    )

    // Keep processing jobs until channel closes
    for job := range p.jobs {
        // Check if pool is shutting down
        select {
        case <-p.ctx.Done():
            logger.Debug("Worker shutting down",
                zap.Int("worker_id", id),
            )
            return // Exit immediately on shutdown
        default:
            // Continue processing
        }

        logger.LogWorkerStart(id, job.ID, job.Source.Name)
        
        // Process the job and send result
        result := p.processJob(job)
        
        logger.LogWorkerComplete(id, job.ID, job.Source.Name, result.Duration, result.Error == nil)
        
        // Non-blocking send (in case results channel is full)
        select {
        case p.results <- result:
        case <-p.ctx.Done():
            logger.Debug("Worker interrupted while sending result",
                zap.Int("worker_id", id),
            )
            return
        }
    }
    
    logger.Debug("Worker finished (jobs channel closed)",
        zap.Int("worker_id", id),
    )
}

// processJob performs the actual HTTP request with retry logic
func (p *WorkerPool) processJob(job models.FetchJob) models.FetchResult {
    start := time.Now()

    logger.Debug("Executing HTTP request",
        zap.String("job_id", job.ID),
        zap.String("method", job.Source.Method),
        zap.String("url", job.Source.URL),
    )

    // Create request using enhanced client
    req := client.Request{
        Method:  job.Source.Method,
        URL:     job.Source.URL,
        Headers: job.Source.Headers,
        Body:    nil, // Can be extended for POST/PUT bodies
    }

    // Execute with retry logic (will automatically retry on 5xx, 429, 408)
    resp, err := p.httpClient.Do(job.Context, req)
    if err != nil {
        logger.Warn("HTTP request failed after retries",
            zap.String("job_id", job.ID),
            zap.String("url", job.Source.URL),
            zap.Error(err),
        )
        return models.FetchResult{
            ID:       job.ID,
            Source:   job.Source.Name,
            Error:    err,
            Duration: time.Since(start),
        }
    }

    logger.Debug("HTTP response received",
        zap.String("job_id", job.ID),
        zap.Int("status_code", resp.StatusCode),
        zap.Int("body_size", len(resp.Body)),
    )

    // Enforce response size limit to prevent memory issues
    const maxResponseSize = 5 * 1024 * 1024 // 5MB limit
    if len(resp.Body) > maxResponseSize {
        logger.Warn("Response exceeds size limit",
            zap.String("job_id", job.ID),
            zap.String("source", job.Source.Name),
            zap.Int("size", len(resp.Body)),
            zap.Int("limit", maxResponseSize),
        )
        return models.FetchResult{
            ID:         job.ID,
            Source:     job.Source.Name,
            Error:      fmt.Errorf("response too large: %d bytes (limit: %d)", len(resp.Body), maxResponseSize),
            StatusCode: resp.StatusCode,
            Duration:   time.Since(start),
        }
    }

    // Response body is already read by the enhanced client
    return models.FetchResult{
        ID:         job.ID,
        Source:     job.Source.Name,
        Data:       resp.Body,
        Error:      nil,
        StatusCode: resp.StatusCode,
        Duration:   time.Since(start),
    }
}

// Submit adds a job to the queue (non-blocking)
func (p *WorkerPool) Submit(job models.FetchJob) error {
    select {
    case p.jobs <- job:
        return nil
    case <-p.ctx.Done():
        return p.ctx.Err() // Pool is shutting down
    }
}

// Results returns the results channel for reading
func (p *WorkerPool) Results() <-chan models.FetchResult {
    return p.results
}

// Shutdown gracefully stops the pool
func (p *WorkerPool) Shutdown() {
    logger.Info("🛑 Initiating worker pool shutdown")
    close(p.jobs)  // No more jobs accepted
    logger.Debug("Jobs channel closed, no more jobs will be accepted")
    
    // Wait for all workers to finish processing remaining jobs
    // Workers will exit the loop when jobs channel is empty and closed
    p.wg.Wait()
    logger.Debug("All workers finished processing jobs")
    
    p.cancel()     // Cancel context to clean up any resources
    logger.Info("✅ Worker pool shutdown complete, all workers stopped gracefully")
}