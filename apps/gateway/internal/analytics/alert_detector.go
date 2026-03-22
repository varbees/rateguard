package analytics

import (
	"context"
	"database/sql"
	"fmt"
	"sync"
	"time"

	"github.com/google/uuid"
	"github.com/varbees/rateguard/internal/models"
	"github.com/varbees/rateguard/internal/websocket"
	"go.uber.org/zap"
)

// AlertDetector continuously monitors for rate limit issues
type AlertDetector struct {
	db                  *sql.DB
	logger              *zap.Logger
	alertCache          map[uuid.UUID][]models.Alert // Cache alerts by user_id
	cacheMutex          sync.RWMutex
	checkInterval       time.Duration
	stopChan            chan struct{}
	circuitBreakerStats func() map[string]interface{} // Callback to get circuit breaker stats
	webSocketHub        *websocket.Hub
}

// NewAlertDetector creates a new alert detector
func NewAlertDetector(db *sql.DB, logger *zap.Logger, webSocketHub *websocket.Hub) *AlertDetector {
	return &AlertDetector{
		db:            db,
		logger:        logger,
		alertCache:    make(map[uuid.UUID][]models.Alert),
		checkInterval: 5 * time.Second,
		stopChan:      make(chan struct{}),
		webSocketHub:  webSocketHub,
	}
}

// SetCircuitBreakerStatsCallback sets the callback function to get circuit breaker stats
func (d *AlertDetector) SetCircuitBreakerStatsCallback(callback func() map[string]interface{}) {
	d.circuitBreakerStats = callback
}

// Start begins the alert detection loop
func (d *AlertDetector) Start(ctx context.Context) {
	d.logger.Info("Starting alert detector", zap.Duration("interval", d.checkInterval))
	
	ticker := time.NewTicker(d.checkInterval)
	defer ticker.Stop()

	// Run immediately on start
	d.detectAlerts(ctx)

	for {
		select {
		case <-ticker.C:
			d.detectAlerts(ctx)
		case <-d.stopChan:
			d.logger.Info("Alert detector stopped")
			return
		case <-ctx.Done():
			d.logger.Info("Alert detector stopped due to context cancellation")
			return
		}
	}
}

// Stop stops the alert detection loop
func (d *AlertDetector) Stop() {
	close(d.stopChan)
}

// detectAlerts runs all alert detection checks
func (d *AlertDetector) detectAlerts(ctx context.Context) {
	d.logger.Debug("Running alert detection cycle")
	
	// Detect high 429 rates
	if err := d.detectHigh429Rate(ctx); err != nil {
		d.logger.Error("Failed to detect 429 alerts", zap.Error(err))
	}
	
	// Detect approaching limits
	if err := d.detectApproachingLimit(ctx); err != nil {
		d.logger.Error("Failed to detect approaching limit alerts", zap.Error(err))
	}
	
	// Detect open circuit breakers
	if err := d.detectOpenCircuitBreakers(ctx); err != nil {
		d.logger.Error("Failed to detect circuit breaker alerts", zap.Error(err))
	}
}

// detectHigh429Rate checks for APIs experiencing high 429 error rates
func (d *AlertDetector) detectHigh429Rate(ctx context.Context) error {
	// Query for high 429 rates in the last 5 minutes
	query := `
		WITH recent_429s AS (
			SELECT 
				user_id,
				target_api,
				COUNT(*) FILTER (WHERE status_code = 429) as error_count,
				COUNT(*) as total_count
			FROM api_metrics
			WHERE timestamp > NOW() - INTERVAL '5 minutes'
			GROUP BY user_id, target_api
			HAVING COUNT(*) FILTER (WHERE status_code = 429) > 0
		),
		api_details AS (
			SELECT 
				ac.id as api_id,
				ac.user_id,
				ac.name as api_name,
				r.error_count,
				r.total_count,
				ROUND((r.error_count::numeric / r.total_count::numeric) * 100, 1) as error_rate
			FROM recent_429s r
			JOIN api_configs ac ON ac.user_id = r.user_id AND ac.name = r.target_api
			WHERE (r.error_count::numeric / r.total_count::numeric) >= 0.1  -- 10% error rate threshold
		)
		SELECT 
			user_id,
			api_id,
			api_name,
			error_count,
			total_count,
			error_rate
		FROM api_details
		ORDER BY error_rate DESC
	`

	rows, err := d.db.QueryContext(ctx, query)
	if err != nil {
		return fmt.Errorf("failed to query 429 rates: %w", err)
	}
	defer rows.Close()

	// Group alerts by user
	userAlerts := make(map[uuid.UUID][]models.Alert)

	for rows.Next() {
		var userID, apiID uuid.UUID
		var apiName string
		var errorCount, totalCount int64
		var errorRate float64

		if err := rows.Scan(&userID, &apiID, &apiName, &errorCount, &totalCount, &errorRate); err != nil {
			d.logger.Error("Failed to scan 429 alert row", zap.Error(err))
			continue
		}

		alert := models.Alert{
			ID:          fmt.Sprintf("429-%s-%d", apiID.String(), time.Now().Unix()),
			Type:        models.AlertTypeCritical,
			Title:       "High Rate Limit Errors",
			Message:     fmt.Sprintf("API '%s' is experiencing high 429 errors (%.1f%% of requests in last 5 min)", apiName, errorRate),
			APIID:       apiID,
			APIName:     apiName,
			Metric:      "429_rate",
			MetricValue: errorRate / 100.0, // Convert to decimal (0-1)
			DetectedAt:  time.Now(),
			Dismissible: true,
		}

		userAlerts[userID] = append(userAlerts[userID], alert)
	}

	// Publish new alerts
	d.publishNewAlerts(userAlerts)

	// Update cache
	d.cacheMutex.Lock()
	// Clear old critical alerts and add new ones
	for userID := range d.alertCache {
		// Keep non-critical alerts, remove old critical ones
		var filtered []models.Alert
		for _, a := range d.alertCache[userID] {
			if a.Type != models.AlertTypeCritical {
				filtered = append(filtered, a)
			}
		}
		d.alertCache[userID] = filtered
	}
	
	// Add new critical alerts
	for userID, alerts := range userAlerts {
		d.alertCache[userID] = append(d.alertCache[userID], alerts...)
	}
	d.cacheMutex.Unlock()

	if len(userAlerts) > 0 {
		d.logger.Info("Detected 429 alerts", zap.Int("user_count", len(userAlerts)))
	}

	return nil
}

// detectApproachingLimit checks for APIs approaching their rate limits
func (d *AlertDetector) detectApproachingLimit(ctx context.Context) error {
	// Query for APIs with high usage relative to configured limits
	query := `
		WITH recent_usage AS (
			SELECT 
				user_id,
				target_api,
				COUNT(*) as request_count
			FROM api_metrics
			WHERE timestamp > NOW() - INTERVAL '1 minute'
			GROUP BY user_id, target_api
		),
		api_limits AS (
			SELECT 
				ac.id as api_id,
				ac.user_id,
				ac.name as api_name,
				ac.rate_limit_per_second,
				r.request_count,
				ROUND((r.request_count::numeric / (ac.rate_limit_per_second::numeric * 60)) * 100, 1) as usage_pct
			FROM api_configs ac
			JOIN recent_usage r ON r.user_id = ac.user_id AND r.target_api = ac.name
			WHERE ac.rate_limit_per_second > 0
				AND (r.request_count::numeric / (ac.rate_limit_per_second::numeric * 60)) >= 0.8  -- 80% threshold
		)
		SELECT 
			user_id,
			api_id,
			api_name,
			rate_limit_per_second,
			request_count,
			usage_pct
		FROM api_limits
		ORDER BY usage_pct DESC
	`

	rows, err := d.db.QueryContext(ctx, query)
	if err != nil {
		return fmt.Errorf("failed to query approaching limits: %w", err)
	}
	defer rows.Close()

	// Group alerts by user
	userAlerts := make(map[uuid.UUID][]models.Alert)

	for rows.Next() {
		var userID, apiID uuid.UUID
		var apiName string
		var rateLimit, requestCount int64
		var usagePct float64

		if err := rows.Scan(&userID, &apiID, &apiName, &rateLimit, &requestCount, &usagePct); err != nil {
			d.logger.Error("Failed to scan approaching limit row", zap.Error(err))
			continue
		}

		alert := models.Alert{
			ID:          fmt.Sprintf("limit-%s-%d", apiID.String(), time.Now().Unix()),
			Type:        models.AlertTypeWarning,
			Title:       "Approaching Rate Limit",
			Message:     fmt.Sprintf("API '%s' is at %.1f%% of rate limit (%d req/min used of %d/sec limit)", apiName, usagePct, requestCount, rateLimit),
			APIID:       apiID,
			APIName:     apiName,
			Metric:      "usage_percent",
			MetricValue: usagePct / 100.0, // Convert to decimal (0-1)
			DetectedAt:  time.Now(),
			Dismissible: true,
		}

		userAlerts[userID] = append(userAlerts[userID], alert)
	}

	// Publish new alerts
	d.publishNewAlerts(userAlerts)

	// Update cache
	d.cacheMutex.Lock()
	// Clear old warning alerts and add new ones
	for userID := range d.alertCache {
		// Keep non-warning alerts, remove old warning ones
		var filtered []models.Alert
		for _, a := range d.alertCache[userID] {
			if a.Type != models.AlertTypeWarning {
				filtered = append(filtered, a)
			}
		}
		d.alertCache[userID] = filtered
	}
	
	// Add new warning alerts
	for userID, alerts := range userAlerts {
		d.alertCache[userID] = append(d.alertCache[userID], alerts...)
	}
	d.cacheMutex.Unlock()

	if len(userAlerts) > 0 {
		d.logger.Info("Detected approaching limit alerts", zap.Int("user_count", len(userAlerts)))
	}

	return nil
}

// GetAlerts returns current alerts for a user
func (d *AlertDetector) GetAlerts(userID uuid.UUID) []models.Alert {
	d.cacheMutex.RLock()
	defer d.cacheMutex.RUnlock()

	alerts, exists := d.alertCache[userID]
	if !exists {
		return []models.Alert{}
	}

	// Return a copy to avoid concurrent modification
	result := make([]models.Alert, len(alerts))
	copy(result, alerts)
	return result
}

// detectOpenCircuitBreakers checks for open circuit breakers
func (d *AlertDetector) detectOpenCircuitBreakers(ctx context.Context) error {
	// Skip if circuit breaker stats callback is not set
	if d.circuitBreakerStats == nil {
		return nil
	}
	
	// Get circuit breaker metrics
	metricsMap := d.circuitBreakerStats()
	metrics, ok := metricsMap["metrics"].(map[string]interface{})
	if !ok {
		d.logger.Debug("No circuit breaker metrics available")
		return nil
	}
	
	// Query for API configurations to map circuit breaker alerts to users
	query := `
		SELECT 
			id,
			user_id,
			name
		FROM api_configs
		WHERE enabled = true
	`
	
	rows, err := d.db.QueryContext(ctx, query)
	if err != nil {
		return fmt.Errorf("failed to query API configs: %w", err)
	}
	defer rows.Close()
	
	// Build map of API ID to user ID
	apiToUser := make(map[string]uuid.UUID)
	apiNames := make(map[string]string)
	
	for rows.Next() {
		var apiID, userID uuid.UUID
		var apiName string
		
		if err := rows.Scan(&apiID, &userID, &apiName); err != nil {
			d.logger.Error("Failed to scan API config row", zap.Error(err))
			continue
		}
		
		apiToUser[apiID.String()] = userID
		apiNames[apiID.String()] = apiName
	}
	
	// Group alerts by user
	userAlerts := make(map[uuid.UUID][]models.Alert)
	
	// Check each circuit breaker for open state
	for apiID, metricData := range metrics {
		metricMap, ok := metricData.(map[string]interface{})
		if !ok {
			continue
		}
		
		state, ok := metricMap["state_string"].(string)
		if !ok || state != "open" {
			continue
		}
		
		// Get user ID for this API
		userID, exists := apiToUser[apiID]
		if !exists {
			d.logger.Debug("No user found for API with open circuit breaker",
				zap.String("api_id", apiID),
			)
			continue
		}
		
		apiName := apiNames[apiID]
		totalFailures, _ := metricMap["total_failures"].(int64)
		timeInStateStr, _ := metricMap["time_in_state"].(string)
		
		alert := models.Alert{
			ID:          fmt.Sprintf("circuit-breaker-%s-%d", apiID, time.Now().Unix()),
			Type:        models.AlertTypeCritical,
			Title:       "Circuit Breaker Open",
			Message:     fmt.Sprintf("API '%s' circuit breaker is OPEN - upstream API is failing. Requests are being rejected to prevent cascade failures. (Failures: %d, Time in state: %s)", apiName, totalFailures, timeInStateStr),
			APIID:       uuid.MustParse(apiID),
			APIName:     apiName,
			Metric:      "circuit_breaker_state",
			MetricValue: 1.0, // 1.0 = open
			DetectedAt:  time.Now(),
			Dismissible: false, // Circuit breaker alerts should not be dismissible
		}
		
		userAlerts[userID] = append(userAlerts[userID], alert)
		
		d.logger.Warn("Circuit breaker alert detected",
			zap.String("api_name", apiName),
			zap.String("api_id", apiID),
			zap.String("user_id", userID.String()),
		)
	}
	
	// Publish new alerts
	d.publishNewAlerts(userAlerts)
	
	// Update cache - remove old circuit breaker alerts and add new ones
	d.cacheMutex.Lock()
	
	// Clear old circuit breaker alerts
	for userID := range d.alertCache {
		var filtered []models.Alert
		for _, a := range d.alertCache[userID] {
			if a.Metric != "circuit_breaker_state" {
				filtered = append(filtered, a)
			}
		}
		d.alertCache[userID] = filtered
	}
	
	// Add new circuit breaker alerts
	for userID, alerts := range userAlerts {
		d.alertCache[userID] = append(d.alertCache[userID], alerts...)
	}
	
	d.cacheMutex.Unlock()
	
	if len(userAlerts) > 0 {
		d.logger.Info("Detected circuit breaker alerts", zap.Int("user_count", len(userAlerts)))
	}
	
	return nil
}

// publishNewAlerts checks for new alerts and publishes them via WebSocket
func (d *AlertDetector) publishNewAlerts(userAlerts map[uuid.UUID][]models.Alert) {
	if d.webSocketHub == nil {
		return
	}

	d.cacheMutex.RLock()
	defer d.cacheMutex.RUnlock()

	for userID, alerts := range userAlerts {
		existing := d.alertCache[userID]
		for _, alert := range alerts {
			isNew := true
			for _, e := range existing {
				// Check if alert for same API and Type exists
				if e.APIID == alert.APIID && e.Type == alert.Type {
					isNew = false
					break
				}
			}
			
			if isNew {
				if err := d.webSocketHub.PublishAlert(userID.String(), alert); err != nil {
					d.logger.Error("Failed to publish alert",
						zap.String("user_id", userID.String()),
						zap.String("alert_type", string(alert.Type)),
						zap.Error(err),
					)
				}
			}
		}
	}
}
