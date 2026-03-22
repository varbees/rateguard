package aggregator

import (
	"context"
	"fmt"
	"sync"
	"time"

	"github.com/google/uuid"
	"github.com/varbees/rateguard/internal/models"
	"github.com/varbees/rateguard/internal/pool"
	"github.com/varbees/rateguard/internal/ratelimiter"
	"github.com/varbees/rateguard/pkg/logger"
	"go.uber.org/zap"
)

// Service orchestrates concurrent API aggregation
type Service struct {
	pool        *pool.WorkerPool
	rateLimiter *ratelimiter.RateLimiter
	timeout     time.Duration
	stats       *Stats
}

// Stats tracks aggregation statistics
type Stats struct {
	TotalRequests    int64
	SuccessfulFetch  int64
	FailedFetch      int64
	TotalDuration    time.Duration
	AverageDuration  time.Duration
	mu               sync.RWMutex
}

// New creates a new aggregator service
func New(workerPool *pool.WorkerPool, rateLimiter *ratelimiter.RateLimiter, timeout time.Duration) *Service {
	return &Service{
		pool:        workerPool,
		rateLimiter: rateLimiter,
		timeout:     timeout,
		stats:       &Stats{},
	}
}

// Aggregate fetches data from multiple sources concurrently
func (s *Service) Aggregate(ctx context.Context, sources []models.APISource) (*models.AggregatedResponse, error) {
	if len(sources) == 0 {
		return nil, fmt.Errorf("no sources provided")
	}

	// Generate unique request ID for tracing
	requestID := uuid.New().String()
	
	logger.LogAggregationStart(requestID, len(sources))
	
	start := time.Now()

	// Create context with timeout for overall aggregation (safety net)
	// Individual jobs will have their own timeouts
	aggCtx, cancel := context.WithTimeout(ctx, s.timeout)
	defer cancel()

	// Track job contexts for proper cleanup
	jobCancels := make([]context.CancelFunc, 0, len(sources))
	defer func() {
		// Cancel all job contexts on exit
		for _, cancelFunc := range jobCancels {
			cancelFunc()
		}
	}()

	// Submit all jobs with rate limiting
	jobIDs := make([]string, len(sources))
	for i, source := range sources {
		// Wait for rate limiter token
		if err := s.rateLimiter.Wait(aggCtx); err != nil {
			logger.Warn("Rate limit wait cancelled",
				zap.String("request_id", requestID),
				zap.Error(err),
			)
			return nil, fmt.Errorf("rate limit wait cancelled: %w", err)
		}

		jobID := uuid.New().String()
		jobIDs[i] = jobID

		// Create per-job context with independent timeout
		// This prevents one slow API from canceling all others
		jobTimeout := source.Timeout
		if jobTimeout == 0 {
			jobTimeout = 10 * time.Second // Default per-job timeout
		}
		jobCtx, jobCancel := context.WithTimeout(aggCtx, jobTimeout)
		jobCancels = append(jobCancels, jobCancel)

		job := models.FetchJob{
			ID:      jobID,
			Source:  source,
			Context: jobCtx, // ✅ Independent timeout per job
		}

		if err := s.pool.Submit(job); err != nil {
			logger.Error("Failed to submit job",
				zap.String("request_id", requestID),
				zap.String("job_id", jobID),
				zap.String("source", source.Name),
				zap.Error(err),
			)
			return nil, fmt.Errorf("failed to submit job: %w", err)
		}

		logger.Debug("Job submitted",
			zap.String("request_id", requestID),
			zap.String("job_id", jobID),
			zap.String("source", source.Name),
		)
	}

	// Collect results
	results := make([]models.FetchResult, 0, len(sources))
	resultMap := make(map[string]bool)
	
collectLoop:
	for i := 0; i < len(sources); i++ {
		select {
		case result := <-s.pool.Results():
			results = append(results, result)
			resultMap[result.ID] = true
			
			logger.Debug("Result received",
				zap.String("request_id", requestID),
				zap.String("job_id", result.ID),
				zap.String("source", result.Source),
				zap.Duration("duration", result.Duration),
				zap.Bool("success", result.Error == nil),
			)
			
		case <-aggCtx.Done():
			logger.Warn("Aggregation timeout reached",
				zap.String("request_id", requestID),
				zap.Int("received_results", len(results)),
				zap.Int("expected_results", len(sources)),
			)
			
			// Drain any remaining results to prevent worker blocking
			// Give workers a brief moment to complete
			time.Sleep(100 * time.Millisecond)
			for {
				select {
				case result := <-s.pool.Results():
					results = append(results, result)
					logger.Debug("Drained late result",
						zap.String("request_id", requestID),
						zap.String("source", result.Source),
					)
				default:
					// No more results, exit drain
					goto exitDrain
				}
			}
			exitDrain:
			break collectLoop
		}
	}

	totalDuration := time.Since(start)

	// Calculate statistics
	successCount := 0
	failedCount := 0
	for _, result := range results {
		if result.Error == nil {
			successCount++
		} else {
			failedCount++
			logger.Warn("Job failed",
				zap.String("request_id", requestID),
				zap.String("job_id", result.ID),
				zap.String("source", result.Source),
				zap.Error(result.Error),
			)
		}
	}

	logger.LogAggregationComplete(requestID, successCount, failedCount, totalDuration)

	// Update service statistics
	s.updateStats(totalDuration, successCount, failedCount)

	response := &models.AggregatedResponse{
		Results:   results,
		TotalTime: totalDuration,
		Success:   successCount,
		Failed:    failedCount,
	}

	return response, nil
}

// updateStats updates service statistics
func (s *Service) updateStats(duration time.Duration, success, failed int) {
	s.stats.mu.Lock()
	defer s.stats.mu.Unlock()

	s.stats.TotalRequests++
	s.stats.SuccessfulFetch += int64(success)
	s.stats.FailedFetch += int64(failed)
	s.stats.TotalDuration += duration
	
	if s.stats.TotalRequests > 0 {
		s.stats.AverageDuration = time.Duration(int64(s.stats.TotalDuration) / s.stats.TotalRequests)
	}
}

// GetStats returns current service statistics
func (s *Service) GetStats() Stats {
	s.stats.mu.RLock()
	defer s.stats.mu.RUnlock()
	
	return Stats{
		TotalRequests:   s.stats.TotalRequests,
		SuccessfulFetch: s.stats.SuccessfulFetch,
		FailedFetch:     s.stats.FailedFetch,
		TotalDuration:   s.stats.TotalDuration,
		AverageDuration: s.stats.AverageDuration,
	}
}

// ResetStats resets service statistics
func (s *Service) ResetStats() {
	s.stats.mu.Lock()
	defer s.stats.mu.Unlock()
	
	s.stats.TotalRequests = 0
	s.stats.SuccessfulFetch = 0
	s.stats.FailedFetch = 0
	s.stats.TotalDuration = 0
	s.stats.AverageDuration = 0
	
	logger.Info("📊 Statistics reset")
}

// Health checks if the service is healthy
func (s *Service) Health() bool {
	// Can add more sophisticated health checks
	return s.pool != nil && s.rateLimiter != nil
}
