package main

import (
	"context"
	"database/sql"
	"log"
	"os"
	"time"

	"github.com/joho/godotenv"
	_ "github.com/lib/pq"
	"go.uber.org/zap"
)

func main() {
	// Load environment variables
	if err := godotenv.Load(); err != nil {
		log.Println("No .env file found, using environment variables")
	}

	// Initialize logger
	logger, _ := zap.NewProduction()
	defer logger.Sync()

	// Connect to database
	dbURL := os.Getenv("DATABASE_URL")
	if dbURL == "" {
		logger.Fatal("DATABASE_URL is not set")
	}

	db, err := sql.Open("postgres", dbURL)
	if err != nil {
		logger.Fatal("Failed to connect to database", zap.Error(err))
	}
	defer db.Close()

	if err := db.Ping(); err != nil {
		logger.Fatal("Failed to ping database", zap.Error(err))
	}

	logger.Info("Starting analytics cleanup job")

	ctx := context.Background()
	startTime := time.Now()

	// Retention policies
	// Free: 7 days
	// Starter: 30 days
	// Pro: 90 days

	// 1. Clean up Free tier (or no subscription)
	// Users with no active subscription or 'free' plan
	queryFree := `
		DELETE FROM api_metrics m
		WHERE m.timestamp < NOW() - INTERVAL '7 days'
		AND (
			m.user_id IN (
				SELECT user_id FROM subscriptions 
				WHERE status = 'active' AND plan_tier = 'free'
			)
			OR m.user_id NOT IN (
				SELECT user_id FROM subscriptions WHERE status = 'active'
			)
		)
	`
	resultFree, err := db.ExecContext(ctx, queryFree)
	if err != nil {
		logger.Error("Failed to clean up Free tier metrics", zap.Error(err))
	} else {
		rows, _ := resultFree.RowsAffected()
		logger.Info("Cleaned up Free tier metrics", zap.Int64("deleted_rows", rows))
	}

	// 2. Clean up Starter tier
	queryStarter := `
		DELETE FROM api_metrics m
		WHERE m.timestamp < NOW() - INTERVAL '30 days'
		AND m.user_id IN (
			SELECT user_id FROM subscriptions 
			WHERE status = 'active' AND plan_tier = 'starter'
		)
	`
	resultStarter, err := db.ExecContext(ctx, queryStarter)
	if err != nil {
		logger.Error("Failed to clean up Starter tier metrics", zap.Error(err))
	} else {
		rows, _ := resultStarter.RowsAffected()
		logger.Info("Cleaned up Starter tier metrics", zap.Int64("deleted_rows", rows))
	}

	// 3. Clean up Pro tier
	queryPro := `
		DELETE FROM api_metrics m
		WHERE m.timestamp < NOW() - INTERVAL '90 days'
		AND m.user_id IN (
			SELECT user_id FROM subscriptions 
			WHERE status = 'active' AND plan_tier IN ('pro', 'business')
		)
	`
	resultPro, err := db.ExecContext(ctx, queryPro)
	if err != nil {
		logger.Error("Failed to clean up Pro tier metrics", zap.Error(err))
	} else {
		rows, _ := resultPro.RowsAffected()
		logger.Info("Cleaned up Pro tier metrics", zap.Int64("deleted_rows", rows))
	}

	// 4. Global safety net (delete anything older than 1 year just in case)
	queryGlobal := `
		DELETE FROM api_metrics 
		WHERE timestamp < NOW() - INTERVAL '365 days'
	`
	resultGlobal, err := db.ExecContext(ctx, queryGlobal)
	if err != nil {
		logger.Error("Failed to run global cleanup safety net", zap.Error(err))
	} else {
		rows, _ := resultGlobal.RowsAffected()
		logger.Info("Ran global cleanup safety net", zap.Int64("deleted_rows", rows))
	}

	duration := time.Since(startTime)
	logger.Info("Analytics cleanup job completed", zap.Duration("duration", duration))
}
