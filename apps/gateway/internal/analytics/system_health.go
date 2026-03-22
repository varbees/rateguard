package analytics

import (
	"context"
	"database/sql"
	"time"

	"github.com/varbees/rateguard/internal/cache"
	"github.com/varbees/rateguard/internal/websocket"
	"go.uber.org/zap"
)

// SystemHealthPublisher periodically checks system health and publishes updates via WebSocket
type SystemHealthPublisher struct {
	db           *sql.DB
	redisClient  *cache.RedisClient
	webSocketHub *websocket.Hub
	logger       *zap.Logger
	checkInterval time.Duration
	stopChan     chan struct{}
}

// NewSystemHealthPublisher creates a new health publisher
func NewSystemHealthPublisher(
	db *sql.DB,
	redisClient *cache.RedisClient,
	webSocketHub *websocket.Hub,
	logger *zap.Logger,
) *SystemHealthPublisher {
	return &SystemHealthPublisher{
		db:            db,
		redisClient:   redisClient,
		webSocketHub:  webSocketHub,
		logger:        logger,
		checkInterval: 30 * time.Second,
		stopChan:      make(chan struct{}),
	}
}

// Start begins the periodic health checks
func (p *SystemHealthPublisher) Start(ctx context.Context) {
	p.logger.Info("Starting system health publisher",
		zap.Duration("interval", p.checkInterval),
	)

	ticker := time.NewTicker(p.checkInterval)
	defer ticker.Stop()

	// Initial check
	p.checkAndPublish(ctx)

	for {
		select {
		case <-ticker.C:
			p.checkAndPublish(ctx)
		case <-ctx.Done():
			p.logger.Info("Stopping system health publisher (context cancelled)")
			return
		case <-p.stopChan:
			p.logger.Info("Stopping system health publisher (stopped)")
			return
		}
	}
}

// Stop stops the publisher
func (p *SystemHealthPublisher) Stop() {
	close(p.stopChan)
}

// checkAndPublish performs health checks and publishes the result
func (p *SystemHealthPublisher) checkAndPublish(ctx context.Context) {
	if p.webSocketHub == nil {
		return
	}

	health := p.checkHealth(ctx)
	
	if err := p.webSocketHub.PublishSystemHealth(health); err != nil {
		p.logger.Error("Failed to publish system health", zap.Error(err))
	}
}

// checkHealth checks the health of dependencies
func (p *SystemHealthPublisher) checkHealth(ctx context.Context) map[string]interface{} {
	health := make(map[string]interface{})
	
	// Check Database
	dbStatus := "healthy"
	if err := p.db.PingContext(ctx); err != nil {
		dbStatus = "unhealthy"
		p.logger.Warn("Database health check failed", zap.Error(err))
	}
	health["database"] = dbStatus

	// Check Redis (skip if not configured)
	redisStatus := "healthy"
	if p.redisClient == nil {
		redisStatus = "unavailable"
	} else {
		if err := p.redisClient.Ping(); err != nil {
			redisStatus = "unhealthy"
			p.logger.Warn("Redis health check failed", zap.Error(err))
		}
	}
	health["redis"] = redisStatus

	// Overall status
	overallStatus := "healthy"
	if dbStatus != "healthy" {
		overallStatus = "degraded"
	} else if redisStatus == "unhealthy" {
		overallStatus = "degraded"
	}
	// Note: Redis "unavailable" doesn't degrade status (optional dependency)
	health["status"] = overallStatus
	health["timestamp"] = time.Now().UnixMilli()

	return health
}
