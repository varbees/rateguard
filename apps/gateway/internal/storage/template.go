package storage

import (
	"context"
	"database/sql"
	"fmt"
	"time"

	"github.com/google/uuid"
	"github.com/varbees/rateguard/internal/models"
	"github.com/varbees/rateguard/pkg/logger"
	"go.uber.org/zap"
)

// ========================================
// Template CRUD Operations
// ========================================

// ListAPITemplates retrieves all active templates, optionally filtered by category
func (s *PostgresStore) ListAPITemplates(ctx context.Context, category string) ([]models.APITemplate, error) {
	query := `
		SELECT id, provider, display_name, description, icon_url, category,
		       target_url, auth_type, required_headers, rate_limit_per_second,
		       burst_size, popularity_score, is_active, created_at, updated_at
		FROM api_templates
		WHERE is_active = true
	`
	
	args := []interface{}{}
	if category != "" {
		query += ` AND category = $1`
		args = append(args, category)
	}
	
	query += ` ORDER BY popularity_score DESC, display_name ASC`
	
	rows, err := s.db.QueryContext(ctx, query, args...)
	if err != nil {
		return nil, fmt.Errorf("failed to list templates: %w", err)
	}
	defer rows.Close()
	
	var templates []models.APITemplate
	for rows.Next() {
		var t models.APITemplate
		err := rows.Scan(
			&t.ID,
			&t.Provider,
			&t.DisplayName,
			&t.Description,
			&t.IconURL,
			&t.Category,
			&t.TargetURL,
			&t.AuthType,
			&t.RequiredHeaders,
			&t.RateLimitPerSecond,
			&t.BurstSize,
			&t.PopularityScore,
			&t.IsActive,
			&t.CreatedAt,
			&t.UpdatedAt,
		)
		if err != nil {
			return nil, fmt.Errorf("failed to scan template: %w", err)
		}
		templates = append(templates, t)
	}
	
	return templates, nil
}

// GetAPITemplateByProvider retrieves a template by its provider name
func (s *PostgresStore) GetAPITemplateByProvider(ctx context.Context, provider string) (*models.APITemplate, error) {
	query := `
		SELECT id, provider, display_name, description, icon_url, category,
		       target_url, auth_type, required_headers, rate_limit_per_second,
		       burst_size, popularity_score, is_active, created_at, updated_at
		FROM api_templates
		WHERE provider = $1 AND is_active = true
	`
	
	var t models.APITemplate
	err := s.db.QueryRowContext(ctx, query, provider).Scan(
		&t.ID,
		&t.Provider,
		&t.DisplayName,
		&t.Description,
		&t.IconURL,
		&t.Category,
		&t.TargetURL,
		&t.AuthType,
		&t.RequiredHeaders,
		&t.RateLimitPerSecond,
		&t.BurstSize,
		&t.PopularityScore,
		&t.IsActive,
		&t.CreatedAt,
		&t.UpdatedAt,
	)
	
	if err == sql.ErrNoRows {
		return nil, fmt.Errorf("template not found: %s", provider)
	}
	if err != nil {
		return nil, fmt.Errorf("failed to get template: %w", err)
	}
	
	return &t, nil
}

// CreateAPITemplate creates a new marketplace template (admin only)
func (s *PostgresStore) CreateAPITemplate(ctx context.Context, template *models.APITemplate) error {
	query := `
		INSERT INTO api_templates (
			id, provider, display_name, description, icon_url, category,
			target_url, auth_type, required_headers, rate_limit_per_second,
			burst_size, popularity_score, is_active, created_at, updated_at
		) VALUES (
			$1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15
		)
	`
	
	template.ID = uuid.New()
	template.CreatedAt = time.Now()
	template.UpdatedAt = time.Now()
	
	_, err := s.db.ExecContext(ctx, query,
		template.ID,
		template.Provider,
		template.DisplayName,
		template.Description,
		template.IconURL,
		template.Category,
		template.TargetURL,
		template.AuthType,
		template.RequiredHeaders,
		template.RateLimitPerSecond,
		template.BurstSize,
		template.PopularityScore,
		template.IsActive,
		template.CreatedAt,
		template.UpdatedAt,
	)
	
	if err != nil {
		return fmt.Errorf("failed to create template: %w", err)
	}
	
	logger.Info("Template created",
		zap.String("provider", template.Provider),
		zap.String("display_name", template.DisplayName),
	)
	
	return nil
}

// UpdateAPITemplate updates an existing template (admin only)
func (s *PostgresStore) UpdateAPITemplate(ctx context.Context, provider string, updates *models.UpdateTemplateRequest) error {
	// Build dynamic update query
	query := `UPDATE api_templates SET updated_at = NOW()`
	args := []interface{}{}
	argCount := 1
	
	if updates.DisplayName != nil {
		query += fmt.Sprintf(", display_name = $%d", argCount)
		args = append(args, *updates.DisplayName)
		argCount++
	}
	if updates.Description != nil {
		query += fmt.Sprintf(", description = $%d", argCount)
		args = append(args, *updates.Description)
		argCount++
	}
	if updates.IconURL != nil {
		query += fmt.Sprintf(", icon_url = $%d", argCount)
		args = append(args, *updates.IconURL)
		argCount++
	}
	if updates.Category != nil {
		query += fmt.Sprintf(", category = $%d", argCount)
		args = append(args, *updates.Category)
		argCount++
	}
	if updates.TargetURL != nil {
		query += fmt.Sprintf(", target_url = $%d", argCount)
		args = append(args, *updates.TargetURL)
		argCount++
	}
	if updates.AuthType != nil {
		query += fmt.Sprintf(", auth_type = $%d", argCount)
		args = append(args, *updates.AuthType)
		argCount++
	}
	if updates.RequiredHeaders != nil {
		query += fmt.Sprintf(", required_headers = $%d", argCount)
		args = append(args, updates.RequiredHeaders)
		argCount++
	}
	if updates.RateLimitPerSecond != nil {
		query += fmt.Sprintf(", rate_limit_per_second = $%d", argCount)
		args = append(args, *updates.RateLimitPerSecond)
		argCount++
	}
	if updates.BurstSize != nil {
		query += fmt.Sprintf(", burst_size = $%d", argCount)
		args = append(args, *updates.BurstSize)
		argCount++
	}
	if updates.PopularityScore != nil {
		query += fmt.Sprintf(", popularity_score = $%d", argCount)
		args = append(args, *updates.PopularityScore)
		argCount++
	}
	if updates.IsActive != nil {
		query += fmt.Sprintf(", is_active = $%d", argCount)
		args = append(args, *updates.IsActive)
		argCount++
	}
	
	query += fmt.Sprintf(" WHERE provider = $%d", argCount)
	args = append(args, provider)
	
	result, err := s.db.ExecContext(ctx, query, args...)
	if err != nil {
		return fmt.Errorf("failed to update template: %w", err)
	}
	
	rows, _ := result.RowsAffected()
	if rows == 0 {
		return fmt.Errorf("template not found: %s", provider)
	}
	
	logger.Info("Template updated", zap.String("provider", provider))
	return nil
}

// DeleteAPITemplate soft-deletes a template by setting is_active = false
func (s *PostgresStore) DeleteAPITemplate(ctx context.Context, provider string) error {
	query := `UPDATE api_templates SET is_active = false, updated_at = NOW() WHERE provider = $1`
	
	result, err := s.db.ExecContext(ctx, query, provider)
	if err != nil {
		return fmt.Errorf("failed to delete template: %w", err)
	}
	
	rows, _ := result.RowsAffected()
	if rows == 0 {
		return fmt.Errorf("template not found: %s", provider)
	}
	
	logger.Info("Template deleted", zap.String("provider", provider))
	return nil
}

// ========================================
// Template Usage Tracking
// ========================================

// TrackTemplateUsage increments usage counter for a template (async operation)
func (s *PostgresStore) TrackTemplateUsage(ctx context.Context, userID uuid.UUID, templateProvider string) error {
	query := `
		INSERT INTO template_usage (user_id, template_provider, requests, usage_date)
		VALUES ($1, $2, 1, CURRENT_DATE)
		ON CONFLICT (user_id, template_provider, usage_date)
		DO UPDATE SET requests = template_usage.requests + 1
	`
	
	_, err := s.db.ExecContext(ctx, query, userID, templateProvider)
	if err != nil {
		// Don't fail the request if tracking fails
		logger.Warn("Failed to track template usage",
			zap.String("user_id", userID.String()),
			zap.String("template", templateProvider),
			zap.Error(err),
		)
	}
	
	return nil
}

// GetTemplateUsageStats retrieves usage statistics for a user
func (s *PostgresStore) GetTemplateUsageStats(ctx context.Context, userID uuid.UUID, days int) ([]models.TemplateUsage, error) {
	query := `
		SELECT id, user_id, template_provider, requests, usage_date
		FROM template_usage
		WHERE user_id = $1 AND usage_date >= CURRENT_DATE - $2::int
		ORDER BY usage_date DESC, requests DESC
	`
	
	rows, err := s.db.QueryContext(ctx, query, userID, days)
	if err != nil {
		return nil, fmt.Errorf("failed to get template usage stats: %w", err)
	}
	defer rows.Close()
	
	var stats []models.TemplateUsage
	for rows.Next() {
		var u models.TemplateUsage
		err := rows.Scan(&u.ID, &u.UserID, &u.TemplateProvider, &u.Requests, &u.UsageDate)
		if err != nil {
			return nil, fmt.Errorf("failed to scan usage stat: %w", err)
		}
		stats = append(stats, u)
	}
	
	return stats, nil
}
