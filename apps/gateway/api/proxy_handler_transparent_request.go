package api

import (
	"fmt"
	"strings"
	"time"

	"github.com/gofiber/fiber/v2"
	"github.com/google/uuid"
	"github.com/varbees/rateguard/internal/models"
)

func buildTransparentProxyRequest(c *fiber.Ctx, userID uuid.UUID, apiName string) (*models.ProxyRequest, string) {
	fullPath := c.Path()
	apiPath := ""

	proxyPrefix := fmt.Sprintf("/proxy/%s", apiName)
	if strings.HasPrefix(fullPath, proxyPrefix) {
		apiPath = strings.TrimPrefix(fullPath, proxyPrefix)
		if apiPath == "" {
			apiPath = "/"
		}
	}

	queryParams := make(map[string]string)
	c.Request().URI().QueryArgs().VisitAll(func(key, value []byte) {
		queryParams[string(key)] = string(value)
	})

	headers := make(map[string]string)
	c.Request().Header.VisitAll(func(key, value []byte) {
		keyStr := string(key)
		if keyStr != "Authorization" && keyStr != "X-API-Key" && !strings.HasPrefix(keyStr, "X-RateGuard") {
			headers[keyStr] = string(value)
		}
	})

	return &models.ProxyRequest{
		ID:          fmt.Sprintf("prx_%s", uuid.New().String()[:8]),
		UserID:      userID,
		TargetAPI:   apiName,
		Method:      c.Method(),
		Path:        apiPath,
		Headers:     headers,
		Body:        c.Body(),
		QueryParams: queryParams,
		Timestamp:   time.Now(),
	}, apiPath
}
