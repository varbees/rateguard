package proxy

import (
	"context"
	"net/http"
	"time"

	"github.com/google/uuid"
	httpadapter "github.com/varbees/rateguard/internal/adapters/http"
	"github.com/varbees/rateguard/internal/models"
	"github.com/varbees/rateguard/pkg/logger"
	"go.uber.org/zap"
)

func (p *ProxyService) recordRateLimitObservationAsync(apiConfig *models.APIConfig, resp *http.Response) {
	rateLimitInfo := httpadapter.ParseRateLimitHeaders(resp.Header)
	if rateLimitInfo.Limit == nil {
		return
	}

	observation := &models.RateLimitObservation{
		ID:                uuid.New(),
		UserID:            apiConfig.UserID,
		APIID:             apiConfig.ID,
		LimitPerWindow:    rateLimitInfo.Limit,
		WindowSeconds:     rateLimitInfo.WindowSeconds,
		ResetTimestamp:    rateLimitInfo.Reset,
		RetryAfterSeconds: rateLimitInfo.RetryAfter,
		SourceHeader:      rateLimitInfo.SourceHeader,
		ObservedAt:        time.Now(),
		ResponseStatus:    resp.StatusCode,
	}

	go func() {
		writeCtx, cancel := context.WithTimeout(context.Background(), 2*time.Second)
		defer cancel()

		if err := p.store.RecordRateLimitObservation(writeCtx, observation); err != nil {
			logger.Error("Failed to record rate limit observation",
				zap.String("api_id", apiConfig.ID.String()),
				zap.Error(err),
			)
		}
	}()
}
