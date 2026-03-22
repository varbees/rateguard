package integration

import (
	"bytes"
	"encoding/json"
	"fmt"
	"net/http"
	"os"
	"testing"
	"time"

	"github.com/stretchr/testify/require"
)

func baseURL() string {
	if value := os.Getenv("RATEGUARD_INTEGRATION_BASE_URL"); value != "" {
		return value
	}
	return "http://localhost:8008"
}

// Helper struct to manage test state
type TestClient struct {
	t           *testing.T
	AccessToken string
	APIKey      string
	UserID      string
}

func NewTestClient(t *testing.T) *TestClient {
	return &TestClient{t: t}
}

// Login authenticates the test client using an email address or handle.
func (c *TestClient) Login(identifier, password string) {
	payload := map[string]string{
		"identifier": identifier,
		"password": password,
	}
	body, _ := json.Marshal(payload)

	resp, err := http.Post(baseURL()+"/api/v1/auth/login", "application/json", bytes.NewBuffer(body))
	require.NoError(c.t, err, "Login request failed")
	defer resp.Body.Close()

	require.Equal(c.t, http.StatusOK, resp.StatusCode, "Login failed")

	var result struct {
		AccessToken string `json:"access_token"`
		APIKey      string `json:"api_key"`
		User        struct {
			ID string `json:"id"`
		} `json:"user"`
	}
	err = json.NewDecoder(resp.Body).Decode(&result)
	require.NoError(c.t, err, "Failed to decode login response")

	c.AccessToken = result.AccessToken
	c.APIKey = result.APIKey
	c.UserID = result.User.ID
}

// CreateProxy creates a new proxy endpoint
func (c *TestClient) CreateProxy(name, targetURL string, rateLimit int) string {
	payload := map[string]interface{}{
		"name":                  name,
		"provider":              "custom",
		"base_url":              targetURL,
		"rate_limit_per_second": rateLimit,
		"burst_size":            rateLimit * 2,
		"enable_caching":        false,
		"cors_origins":          []string{"*"},
	}
	body, _ := json.Marshal(payload)

	req, _ := http.NewRequest("POST", baseURL()+"/api/v1/apis", bytes.NewBuffer(body))
	req.Header.Set("Content-Type", "application/json")
	req.Header.Set("Cookie", "access_token="+c.AccessToken)

	client := &http.Client{}
	resp, err := client.Do(req)
	require.NoError(c.t, err, "Create proxy request failed")
	defer resp.Body.Close()

	// If it already exists, try to find it
	if resp.StatusCode == http.StatusConflict || resp.StatusCode == 500 {
		return c.GetProxyIDByName(name)
	}

	require.Equal(c.t, http.StatusCreated, resp.StatusCode, "Create proxy failed")

	var result struct {
		ID string `json:"id"`
	}
	json.NewDecoder(resp.Body).Decode(&result)
	return result.ID
}

// GetProxyIDByName finds an existing proxy ID
func (c *TestClient) GetProxyIDByName(name string) string {
	req, _ := http.NewRequest("GET", baseURL()+"/api/v1/apis", nil)
	req.Header.Set("Cookie", "access_token="+c.AccessToken)

	client := &http.Client{}
	resp, err := client.Do(req)
	require.NoError(c.t, err)
	defer resp.Body.Close()

	var result struct {
		APIs []struct {
			ID   string `json:"id"`
			Name string `json:"name"`
		} `json:"apis"`
	}
	json.NewDecoder(resp.Body).Decode(&result)

	for _, api := range result.APIs {
		if api.Name == name {
			return api.ID
		}
	}
	return ""
}

// MakeProxyRequest makes a request through the proxy
func (c *TestClient) MakeProxyRequest(proxyID, path string) (*http.Response, error) {
	url := fmt.Sprintf("%s/proxy/%s%s", baseURL(), proxyID, path)
	req, _ := http.NewRequest("GET", url, nil)
	req.Header.Set("Cookie", "access_token="+c.AccessToken)

	client := &http.Client{Timeout: 10 * time.Second}
	return client.Do(req)
}
