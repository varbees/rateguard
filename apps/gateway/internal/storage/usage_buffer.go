package storage

import (
	"context"
	"database/sql"
	"fmt"
	"strings"
	"time"

	"github.com/google/uuid"
	"github.com/varbees/rateguard/internal/cache"
	"github.com/varbees/rateguard/pkg/logger"
	"go.uber.org/zap"
)

// RedisUsageBuffer buffers usage stats in Redis to reduce DB writes
type RedisUsageBuffer struct {
	redis  *cache.RedisClient
	db     *sql.DB
	logger *zap.Logger
}

type usageItem struct {
	UserID    string
	TargetAPI string
	Count     int64
}

// NewRedisUsageBuffer creates a new usage buffer
func NewRedisUsageBuffer(redis *cache.RedisClient, db *sql.DB) *RedisUsageBuffer {
	return &RedisUsageBuffer{
		redis:  redis,
		db:     db,
		logger: logger.Log,
	}
}

// Start starts the background flush worker
func (b *RedisUsageBuffer) Start(ctx context.Context, flushInterval time.Duration) {
	ticker := time.NewTicker(flushInterval)
	go func() {
		defer ticker.Stop()
		for {
			select {
			case <-ctx.Done():
				// Final flush on shutdown
				b.FlushToDB(context.Background())
				return
			case <-ticker.C:
				if err := b.FlushToDB(ctx); err != nil {
					b.logger.Error("Failed to flush usage buffer", zap.Error(err))
				}
			}
		}
	}()
}

// BufferRequest increments the request count in Redis
// Key format: usage:buffer:{date} -> field: {user_id}:{api_name}
func (b *RedisUsageBuffer) BufferRequest(ctx context.Context, userID uuid.UUID, targetAPI string) error {
	now := time.Now()
	dateStr := now.Format("2006-01-02")
	key := fmt.Sprintf("usage:buffer:%s", dateStr)
	field := fmt.Sprintf("%s:%s", userID.String(), targetAPI)

	// Increment in Redis (HINCRBY is atomic)
	// We use a hash per day to easily expire old keys if needed
	_, err := b.redis.GetClient().HIncrBy(ctx, key, field, 1).Result()
	if err != nil {
		// Fallback to DB if Redis fails (fail-safe)
		b.logger.Error("Failed to buffer request in Redis, falling back to DB",
			zap.String("user_id", userID.String()),
			zap.Error(err),
		)
		return b.writeDirectToDB(ctx, userID, targetAPI, now)
	}

	// Set expiry on the key (e.g., 48 hours) to prevent infinite growth if flush fails
	b.redis.GetClient().Expire(ctx, key, 48*time.Hour)

	return nil
}

// FlushToDB reads buffered counts and updates the database
func (b *RedisUsageBuffer) FlushToDB(ctx context.Context) error {
	now := time.Now()
	dateStr := now.Format("2006-01-02")
	key := fmt.Sprintf("usage:buffer:%s", dateStr)

	// Get all fields from the hash
	counts, err := b.redis.GetClient().HGetAll(ctx, key).Result()
	if err != nil {
		return fmt.Errorf("failed to get buffered usage: %w", err)
	}

	if len(counts) == 0 {
		return nil
	}

	// Process in batches to avoid huge transactions
	batchSize := 100
	
	var batch []usageItem
	
	for field, countStr := range counts {
		var count int64
		fmt.Sscanf(countStr, "%d", &count)
		
		if count == 0 {
			continue
		}

		parts := strings.SplitN(field, ":", 2)
		if len(parts) != 2 {
			b.logger.Warn("Invalid usage field format", zap.String("field", field))
			continue
		}

		batch = append(batch, usageItem{
			UserID:    parts[0],
			TargetAPI: parts[1],
			Count:     count,
		})

		if len(batch) >= batchSize {
			if err := b.writeBatch(ctx, batch, now); err != nil {
				b.logger.Error("Failed to write usage batch", zap.Error(err))
				// Continue with next batch, don't stop everything
			} else {
				// Decrement from Redis only after successful DB write
				// To be safe, we HINCRBY by negative count
				// This handles the case where new requests came in during processing
				pipe := b.redis.GetClient().Pipeline()
				for _, item := range batch {
					field := fmt.Sprintf("%s:%s", item.UserID, item.TargetAPI)
					pipe.HIncrBy(ctx, key, field, -item.Count)
				}
				_, _ = pipe.Exec(ctx)
			}
			batch = batch[:0] // Reset batch
		}
	}

	// Process remaining
	if len(batch) > 0 {
		if err := b.writeBatch(ctx, batch, now); err != nil {
			b.logger.Error("Failed to write final usage batch", zap.Error(err))
		} else {
			pipe := b.redis.GetClient().Pipeline()
			for _, item := range batch {
				field := fmt.Sprintf("%s:%s", item.UserID, item.TargetAPI)
				pipe.HIncrBy(ctx, key, field, -item.Count)
			}
			_, _ = pipe.Exec(ctx)
		}
	}

	return nil
}

func (b *RedisUsageBuffer) writeBatch(ctx context.Context, items []usageItem, timestamp time.Time) error {
	tx, err := b.db.BeginTx(ctx, nil)
	if err != nil {
		return err
	}
	defer tx.Rollback()

	stmt, err := tx.PrepareContext(ctx, `
		INSERT INTO api_usage (user_id, target_api, requests, usage_date, timestamp)
		VALUES ($1, $2, $3, $4, $5)
		ON CONFLICT (user_id, target_api, usage_date)
		DO UPDATE SET 
			requests = api_usage.requests + $3,
			timestamp = $5
	`)
	if err != nil {
		return err
	}
	defer stmt.Close()

	usageDate := time.Date(timestamp.Year(), timestamp.Month(), timestamp.Day(), 0, 0, 0, 0, timestamp.Location())

	for _, item := range items {
		_, err := stmt.ExecContext(ctx, item.UserID, item.TargetAPI, item.Count, usageDate, timestamp)
		if err != nil {
			return err
		}
	}

	return tx.Commit()
}

// writeDirectToDB is a fallback for when Redis is down
func (b *RedisUsageBuffer) writeDirectToDB(ctx context.Context, userID uuid.UUID, targetAPI string, now time.Time) error {
	usageDate := time.Date(now.Year(), now.Month(), now.Day(), 0, 0, 0, 0, now.Location())
	
	query := `
		INSERT INTO api_usage (user_id, target_api, requests, usage_date, timestamp)
		VALUES ($1, $2, 1, $3, $4)
		ON CONFLICT (user_id, target_api, usage_date)
		DO UPDATE SET 
			requests = api_usage.requests + 1,
			timestamp = $4
	`

	_, err := b.db.ExecContext(ctx, query, userID, targetAPI, usageDate, now)
	return err
}
