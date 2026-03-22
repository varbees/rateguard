//go:build commercial

package billing

import (
	"context"
	"time"

	"github.com/google/uuid"
	"github.com/varbees/rateguard/internal/models"
	"github.com/varbees/rateguard/internal/storage"
	"go.uber.org/zap"
)

// SubscriptionService handles commercial subscription business logic.
type SubscriptionService struct {
	store  *storage.PostgresStore
	logger *zap.Logger
}

// NewSubscriptionService creates a new subscription service.
func NewSubscriptionService(store *storage.PostgresStore, logger *zap.Logger) *SubscriptionService {
	return &SubscriptionService{
		store:  store,
		logger: logger,
	}
}

// CreateDefaultSubscription creates a free subscription for a new user.
func (s *SubscriptionService) CreateDefaultSubscription(ctx context.Context, userID uuid.UUID, currency string) error {
	// Default to USD if not provided or invalid
	if currency != "INR" && currency != "USD" {
		currency = "USD"
	}

	pricing := models.GetPricingByRegion("free", currency)
	now := time.Now()

	sub := &models.Subscription{
		ID:                 uuid.New(),
		UserID:             userID,
		PlanTier:           "free",
		BillingCycle:       "monthly",
		AmountMinorUnits:   pricing.AmountMinorUnits,
		Currency:           currency,
		PaymentProvider:    "manual", // Free preset doesn't need a payment provider.
		Status:             "active",
		CurrentPeriodStart: now,
		CurrentPeriodEnd:   now.AddDate(0, 1, 0), // 1 month
		CreatedAt:          now,
		UpdatedAt:          now,
	}

	if err := s.store.CreateSubscription(ctx, sub); err != nil {
		s.logger.Error("Failed to create default subscription",
			zap.String("user_id", userID.String()),
			zap.Error(err),
		)
		return err
	}

	// Ensure user preset is synced.
	if err := s.SyncUserPreset(ctx, userID); err != nil {
		s.logger.Warn("Failed to sync user preset after subscription creation",
			zap.String("user_id", userID.String()),
			zap.Error(err),
		)
		// Don't fail the operation, just log warning
	}

	return nil
}

// SyncUserPreset updates the user's preset field based on their active subscription.
func (s *SubscriptionService) SyncUserPreset(ctx context.Context, userID uuid.UUID) error {
	sub, err := s.store.GetSubscriptionByUserID(ctx, userID)
	if err != nil {
		if err == models.ErrSubscriptionNotFound {
			// No subscription, set to free.
			return s.updateUserPreset(ctx, userID, "free")
		}
		return err
	}

	// If subscription is not active, revert to free.
	if sub.Status != "active" && sub.Status != "trial" {
		return s.updateUserPreset(ctx, userID, "free")
	}

	return s.updateUserPreset(ctx, userID, sub.PlanTier)
}

func (s *SubscriptionService) updateUserPreset(ctx context.Context, userID uuid.UUID, preset string) error {
	return persistUserPreset(ctx, s.store.GetDB(), userID, preset)
}
