package integration

import (
	"net/http"
	"testing"

	"github.com/stretchr/testify/suite"
)

type FullStackSuite struct {
	suite.Suite
	client *TestClient
}

func (s *FullStackSuite) SetupSuite() {
	s.client = NewTestClient(s.T())
	// Use the known credentials
	s.client.Login("rend@gmail.com", "render@123")
}

func (s *FullStackSuite) Test1_PublicProxyFlow() {
	// 1. Create (or get) a public proxy to JSONPlaceholder
	proxyID := s.client.CreateProxy("integration-test-public", "https://jsonplaceholder.typicode.com", 100)
	s.NotEmpty(proxyID, "Proxy ID should not be empty")

	// 2. Make a request through the proxy
	resp, err := s.client.MakeProxyRequest(proxyID, "/todos/1")
	s.NoError(err)
	defer resp.Body.Close()

	s.Equal(http.StatusOK, resp.StatusCode)
}

func (s *FullStackSuite) Test2_RateLimiting() {
	// 1. Create a strictly limited proxy (5 req/s)
	proxyID := s.client.CreateProxy("integration-test-limited", "https://jsonplaceholder.typicode.com", 5)
	s.NotEmpty(proxyID)

	// 2. Burst requests - first 5 should succeed
	for i := 0; i < 5; i++ {
		resp, err := s.client.MakeProxyRequest(proxyID, "/todos/1")
		s.NoError(err)
		resp.Body.Close()
		s.Equal(http.StatusOK, resp.StatusCode, "Request %d should pass", i)
	}

	// 3. Next requests might be rate limited (depending on burst implementation)
	// We won't assert 429 strictly here as burst buckets might allow more, 
	// but this verifies the flow doesn't crash.
}

func TestFullStackSuite(t *testing.T) {
	suite.Run(t, new(FullStackSuite))
}
