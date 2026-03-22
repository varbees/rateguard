package api

import (
	"fmt"
	"time"

	"github.com/go-resty/resty/v2"
	httpadapter "github.com/varbees/rateguard/internal/adapters/http"
	"github.com/varbees/rateguard/internal/models"
)

func forwardProxyRequest(
	client *resty.Client,
	targetURL string,
	method string,
	requestID string,
	configure func(*resty.Request),
) (*models.ProxyResponse, error) {
	start := time.Now()

	req := client.R()
	if configure != nil {
		configure(req)
	}

	resp, err := httpadapter.ExecuteRestyRequest(req, method, targetURL)
	if err != nil {
		return nil, fmt.Errorf("request failed: %w", err)
	}

	return &models.ProxyResponse{
		RequestID:  requestID,
		StatusCode: resp.StatusCode(),
		Headers:    resp.Header(),
		Body:       resp.Body(),
		Duration:   time.Since(start),
	}, nil
}
