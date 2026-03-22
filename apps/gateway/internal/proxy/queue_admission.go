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
	release       func()
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
	queueLimit := p.queueLimitForAPI(req.UserID, req.TargetAPI)
	queueSlotTTL := maxWaitTime + queueWaiterTTLBuffer
	queueKey := queueCapacityKey(req.UserID, req.TargetAPI)
	completionRelease := newQueueCompletionRelease(req.UserID, req.TargetAPI)
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

	var (
		waiter       *queueWaiter
		wasQueued    bool
		queueStart   time.Time
		waiterActive bool
	)

	for {
		allowed, limitType := p.checkMultiTierRateLimits(req.UserID, req.TargetAPI, apiConfig)
		if allowed {
			if waiter != nil {
				_ = queueStoreSingleton.removeQueueWaiter(queueKey, waiter)
			}
			releaseSlot()

			if wasQueued {
				queueDuration := time.Since(queueStart)
				logger.Info("Request dequeued and processing",
					zap.String("user_id", req.UserID.String()),
					zap.String("api_name", req.TargetAPI),
					zap.Duration("queue_time", queueDuration),
				)
				return queueAdmissionResult{
					queued:        true,
					queueDuration: queueDuration,
					release:       completionRelease,
				}
			}

			return queueAdmissionResult{release: completionRelease}
		}

		if !wasQueued {
			wasQueued = true
			queueStart = time.Now()
			logger.Info("Request queued due to rate limit",
				zap.String("user_id", req.UserID.String()),
				zap.String("api_name", req.TargetAPI),
				zap.String("limit_type", limitType),
			)
		}

		if waiter == nil {
			waiter = queueStoreSingleton.enqueueQueueWaiter(queueKey, queueSlotTTL)
			waiterActive = true
		} else if !waiterActive {
			if !queueStoreSingleton.rearmQueueWaiter(queueKey, waiter, queueSlotTTL) {
				releaseSlot()
				return queueAdmissionResult{
					err: fmt.Errorf("queue waiter disappeared while queued"),
				}
			}
			waiterActive = true
		}

		remainingWait := maxWaitTime - time.Since(queueStart)
		if remainingWait <= 0 {
			if waiter != nil {
				_ = queueStoreSingleton.removeQueueWaiter(queueKey, waiter)
			}
			releaseSlot()
			logger.Warn("Request exceeded maximum queue time",
				zap.String("user_id", req.UserID.String()),
				zap.String("api_name", req.TargetAPI),
				zap.Duration("waited", time.Since(queueStart)),
				zap.String("limit_type", limitType),
			)

			return queueAdmissionResult{
				queued:  true,
				blocked: buildQueueTimeoutResponse(req, startTime, time.Since(queueStart), maxWaitTime, limitType),
			}
		}

		timer := time.NewTimer(remainingWait)
		select {
		case <-ctx.Done():
			if !timer.Stop() {
				select {
				case <-timer.C:
				default:
				}
			}
			if waiter != nil {
				_ = queueStoreSingleton.removeQueueWaiter(queueKey, waiter)
			}
			releaseSlot()
			return queueAdmissionResult{
				err: fmt.Errorf("request cancelled while queued: %w", ctx.Err()),
			}
		case <-timer.C:
			if waiter != nil {
				_ = queueStoreSingleton.removeQueueWaiter(queueKey, waiter)
			}
			releaseSlot()
			logger.Warn("Request exceeded maximum queue time",
				zap.String("user_id", req.UserID.String()),
				zap.String("api_name", req.TargetAPI),
				zap.Duration("waited", time.Since(queueStart)),
				zap.String("limit_type", limitType),
			)

			return queueAdmissionResult{
				queued:  true,
				blocked: buildQueueTimeoutResponse(req, startTime, time.Since(queueStart), maxWaitTime, limitType),
			}
		case <-waiter.token:
			if !timer.Stop() {
				select {
				case <-timer.C:
				default:
				}
			}
			waiterActive = false
			continue
		}
	}
}
