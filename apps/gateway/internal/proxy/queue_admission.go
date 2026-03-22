package proxy

import (
	"context"
	"fmt"
	"time"

	"github.com/varbees/rateguard/internal/models"
	"github.com/varbees/rateguard/pkg/logger"
	"go.uber.org/zap"
)

type queueAdmissionResult struct {
	queued        bool
	queueDuration time.Duration
	blocked       *models.ProxyResponse
	err           error
}

func (p *ProxyService) admitQueuedRequest(
	ctx context.Context,
	req *models.ProxyRequest,
	apiConfig *models.APIConfig,
	startTime time.Time,
) queueAdmissionResult {
	// Check request limit based on active policy preset.
	canRequest, remaining, message, err := p.presetChecker.CanMakeRequest(ctx, req.UserID)
	if err != nil {
		logger.Warn("Failed to check request limit",
			zap.String("user_id", req.UserID.String()),
			zap.Error(err),
		)
	} else if !canRequest {
		logger.Warn("Daily request limit reached",
			zap.String("user_id", req.UserID.String()),
			zap.String("message", message),
		)

		return queueAdmissionResult{
			blocked: buildQueueLimitReachedResponse(req, startTime, message),
		}
	} else {
		logger.Debug("Request allowed",
			zap.String("user_id", req.UserID.String()),
			zap.Int64("remaining", remaining),
		)
	}

	maxWaitTime := 30 * time.Second
	checkInterval := 50 * time.Millisecond
	waited := time.Duration(0)
	wasQueued := false
	queueStartTime := startTime
	queueLimit := p.queueLimitForAPI(req.UserID, req.TargetAPI)
	queueSlotTTL := maxWaitTime + queueWaiterTTLBuffer
	var releaseQueueSlot func()

	if queueLimit > 0 {
		release, acquired, reserveErr := p.reserveQueueSlot(ctx, req.UserID, req.TargetAPI, queueLimit, queueSlotTTL)
		if reserveErr != nil {
			logger.Warn("Failed to reserve queue slot, continuing without queue capacity enforcement",
				zap.String("user_id", req.UserID.String()),
				zap.String("api_name", req.TargetAPI),
				zap.Error(reserveErr),
			)
		} else if !acquired {
			logger.Warn("Queue capacity reached",
				zap.String("user_id", req.UserID.String()),
				zap.String("api_name", req.TargetAPI),
				zap.Int("max_queue_length", queueLimit),
			)

			return queueAdmissionResult{
				blocked: buildQueueCapacityExceededResponse(req, startTime, queueLimit, req.TargetAPI),
			}
		} else {
			releaseQueueSlot = release
		}
	}

	releaseSlot := func() {
		if releaseQueueSlot != nil {
			releaseQueueSlot()
			releaseQueueSlot = nil
		}
	}

	for {
		allowed, limitType := p.checkMultiTierRateLimits(req.UserID, req.TargetAPI, apiConfig)
		if allowed {
			if wasQueued {
				queueDuration := time.Since(queueStartTime)
				releaseSlot()
				logger.Info("Request dequeued and processing",
					zap.String("user_id", req.UserID.String()),
					zap.String("api_name", req.TargetAPI),
					zap.Duration("queue_time", queueDuration),
				)
				return queueAdmissionResult{
					queued:        true,
					queueDuration: queueDuration,
				}
			}
			releaseSlot()
			return queueAdmissionResult{}
		}

		if !wasQueued {
			wasQueued = true
			queueStartTime = time.Now()
			logger.Info("Request queued due to rate limit",
				zap.String("user_id", req.UserID.String()),
				zap.String("api_name", req.TargetAPI),
				zap.String("limit_type", limitType),
			)
		}

		select {
		case <-ctx.Done():
			releaseSlot()
			return queueAdmissionResult{
				err: fmt.Errorf("request cancelled while queued: %w", ctx.Err()),
			}
		case <-time.After(checkInterval):
		}

		waited += checkInterval
		if waited >= maxWaitTime {
			releaseSlot()
			logger.Warn("Request exceeded maximum queue time",
				zap.String("user_id", req.UserID.String()),
				zap.String("api_name", req.TargetAPI),
				zap.Duration("waited", waited),
				zap.String("limit_type", limitType),
			)

			return queueAdmissionResult{
				queued:  true,
				blocked: buildQueueTimeoutResponse(req, startTime, waited, maxWaitTime, limitType),
			}
		}
	}
}
