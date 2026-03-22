package logger

import (
	"fmt"
	"time"

	"go.uber.org/zap"
	"go.uber.org/zap/zapcore"
)

var (
	// Global logger instance
	Log *zap.Logger
)

// Config holds logger configuration
type Config struct {
	Level       string // debug, info, warn, error
	Format      string // json, console
	Development bool
}

// Initialize creates and configures the global logger with beautiful output
func Initialize(cfg Config) error {
	var zapConfig zap.Config

	if cfg.Development {
		// Development mode: colorful console output
		zapConfig = zap.NewDevelopmentConfig()
		zapConfig.EncoderConfig.EncodeLevel = zapcore.CapitalColorLevelEncoder
		zapConfig.EncoderConfig.EncodeTime = customTimeEncoder
	} else {
		// Production mode: JSON structured logging
		zapConfig = zap.NewProductionConfig()
		zapConfig.EncoderConfig.TimeKey = "timestamp"
		zapConfig.EncoderConfig.EncodeTime = zapcore.ISO8601TimeEncoder
	}

	// Set log level
	level, err := zapcore.ParseLevel(cfg.Level)
	if err != nil {
		return fmt.Errorf("invalid log level: %w", err)
	}
	zapConfig.Level = zap.NewAtomicLevelAt(level)

	// Set encoding format
	if cfg.Format == "json" {
		zapConfig.Encoding = "json"
	} else {
		zapConfig.Encoding = "console"
		zapConfig.EncoderConfig.EncodeLevel = zapcore.CapitalColorLevelEncoder
		zapConfig.EncoderConfig.EncodeTime = customTimeEncoder
		zapConfig.EncoderConfig.EncodeCaller = zapcore.ShortCallerEncoder
	}

	// Build logger
	logger, err := zapConfig.Build(
		zap.AddCallerSkip(0),
		zap.AddStacktrace(zapcore.ErrorLevel),
	)
	if err != nil {
		return fmt.Errorf("failed to build logger: %w", err)
	}

	Log = logger
	return nil
}

// customTimeEncoder formats time beautifully for console output
func customTimeEncoder(t time.Time, enc zapcore.PrimitiveArrayEncoder) {
	enc.AppendString(t.Format("2006-01-02 15:04:05.000"))
}

// Sync flushes any buffered log entries
func Sync() {
	if Log != nil {
		_ = Log.Sync()
	}
}

// WithContext creates a new logger with contextual fields
func WithContext(fields ...zap.Field) *zap.Logger {
	return Log.With(fields...)
}

// Debug logs a debug message
func Debug(msg string, fields ...zap.Field) {
	Log.Debug(msg, fields...)
}

// Info logs an info message
func Info(msg string, fields ...zap.Field) {
	Log.Info(msg, fields...)
}

// Warn logs a warning message
func Warn(msg string, fields ...zap.Field) {
	Log.Warn(msg, fields...)
}

// Error logs an error message
func Error(msg string, fields ...zap.Field) {
	Log.Error(msg, fields...)
}

// Fatal logs a fatal message and exits
func Fatal(msg string, fields ...zap.Field) {
	Log.Fatal(msg, fields...)
}

// Helper functions for beautiful concurrent operation logging

// LogWorkerStart logs when a worker starts processing
func LogWorkerStart(workerID int, jobID string, source string) {
	Info("🚀 Worker started processing job",
		zap.Int("worker_id", workerID),
		zap.String("job_id", jobID),
		zap.String("source", source),
	)
}

// LogWorkerComplete logs when a worker completes a job
func LogWorkerComplete(workerID int, jobID string, source string, duration time.Duration, success bool) {
	if success {
		Info("✅ Worker completed job successfully",
			zap.Int("worker_id", workerID),
			zap.String("job_id", jobID),
			zap.String("source", source),
			zap.Duration("duration", duration),
		)
	} else {
		Warn("⚠️  Worker completed job with error",
			zap.Int("worker_id", workerID),
			zap.String("job_id", jobID),
			zap.String("source", source),
			zap.Duration("duration", duration),
		)
	}
}

// LogPoolStats logs worker pool statistics
func LogPoolStats(activeWorkers, queuedJobs, completedJobs int) {
	Info("📊 Worker pool stats",
		zap.Int("active_workers", activeWorkers),
		zap.Int("queued_jobs", queuedJobs),
		zap.Int("completed_jobs", completedJobs),
	)
}

// LogAggregationStart logs when aggregation begins
func LogAggregationStart(requestID string, sourceCount int) {
	Info("🎯 Aggregation started",
		zap.String("request_id", requestID),
		zap.Int("source_count", sourceCount),
	)
}

// LogAggregationComplete logs when aggregation completes
func LogAggregationComplete(requestID string, successCount, failedCount int, totalDuration time.Duration) {
	Info("🏁 Aggregation completed",
		zap.String("request_id", requestID),
		zap.Int("success_count", successCount),
		zap.Int("failed_count", failedCount),
		zap.Duration("total_duration", totalDuration),
	)
}

// LogRateLimitHit logs when rate limit is hit
func LogRateLimitHit(requestID string) {
	Warn("⏸️  Rate limit hit, waiting for token",
		zap.String("request_id", requestID),
	)
}

// LogHTTPRequest logs incoming HTTP requests
func LogHTTPRequest(method, path, clientIP string, requestID string) {
	Info("📥 Incoming request",
		zap.String("method", method),
		zap.String("path", path),
		zap.String("client_ip", clientIP),
		zap.String("request_id", requestID),
	)
}

// LogHTTPResponse logs HTTP responses
func LogHTTPResponse(method, path string, statusCode int, duration time.Duration, requestID string) {
	Info("📤 Response sent",
		zap.String("method", method),
		zap.String("path", path),
		zap.Int("status_code", statusCode),
		zap.Duration("duration", duration),
		zap.String("request_id", requestID),
	)
}

// LogServerStart logs server startup
func LogServerStart(address string) {
	Info("🚀 Server starting",
		zap.String("address", address),
	)
}

// LogServerStop logs server shutdown
func LogServerStop() {
	Info("🛑 Server shutting down gracefully")
}

// LogServerReady logs when server is ready
func LogServerReady(address string) {
	Info("✨ Server is ready to accept requests",
		zap.String("address", address),
	)
}
