package proxy

import (
	"context"
	"time"

	"github.com/google/uuid"
	"github.com/varbees/rateguard/internal/models"
	"github.com/varbees/rateguard/pkg/logger"
	"go.uber.org/zap"
)

func (p *ProxyService) handleProxyLLMResponse(
	ctx context.Context,
	userID uuid.UUID,
	apiName string,
	apiConfig *models.APIConfig,
	body []byte,
	statusCode int,
	duration time.Duration,
) {
	if apiConfig.IsLLMAPI || (apiConfig.Provider != nil && *apiConfig.Provider != "") {
		p.handleLLMResponse(ctx, userID, apiName, apiConfig, body, statusCode, duration)
		return
	}

	detectionResult := DetectLLMFromResponse(body, false)
	if !detectionResult.IsLLM || detectionResult.Confidence <= 0.6 {
		return
	}

	logger.Info("Auto-detected LLM API",
		zap.String("api_name", apiName),
		zap.String("provider", detectionResult.Provider),
		zap.Float64("confidence", detectionResult.Confidence),
		zap.Strings("hints", detectionResult.DetectionHints),
	)

	if AutoDetectAndUpdate(apiConfig, body, false) {
		if updateErr := p.store.UpdateAPIConfig(ctx, apiConfig.ID, userID, apiConfig); updateErr != nil {
			logger.Error("Failed to update auto-detected LLM config", zap.Error(updateErr))
			return
		}

		p.handleLLMResponse(ctx, userID, apiName, apiConfig, body, statusCode, duration)
	}
}
