package auth

import (
	"context"
	"encoding/json"
	"fmt"
	"io"
	"net/http"
	"strings"
	"time"

	"github.com/varbees/rateguard/internal/cache"
	"github.com/varbees/rateguard/pkg/logger"
	"go.uber.org/zap"
)

// GeoDetector handles geographic and currency detection from IP addresses
type GeoDetector struct {
	redisClient *cache.RedisClient
	httpClient  *http.Client
}

// GeoData represents the detected geographic information
type GeoData struct {
	CountryCode string
	Currency    string
	Provider    string
}

// IPAPIResponse represents the response from ipapi.co
type IPAPIResponse struct {
	CountryCode string `json:"country_code"`
	Country     string `json:"country"`
	Error       bool   `json:"error"`
	Reason      string `json:"reason"`
}

// NewGeoDetector creates a new geo detector instance
func NewGeoDetector(redisClient *cache.RedisClient) *GeoDetector {
	return &GeoDetector{
		redisClient: redisClient,
		httpClient: &http.Client{
			Timeout: 3 * time.Second, // Fast timeout for non-blocking behavior
		},
	}
}

// DetectCurrencyFromIP detects country, currency, and payment provider from IP address
// Returns: countryCode, currency, provider
// Logic:
//   1. Check Redis cache first (geo:ip:{ip})
//   2. Check Cloudflare-IPCountry header (if available via context)
//   3. Fallback to ipapi.co free API
//   4. India (IN) → INR, razorpay
//   5. All others → USD, stripe
//   6. On error → default: "", USD, stripe
func (g *GeoDetector) DetectCurrencyFromIP(ctx context.Context, ip string, cfCountry string) GeoData {
	// Default fallback
	defaultGeo := GeoData{
		CountryCode: "",
		Currency:    "USD",
		Provider:    "stripe",
	}

	// Validate IP
	if ip == "" || ip == "127.0.0.1" || ip == "::1" || strings.HasPrefix(ip, "192.168.") || strings.HasPrefix(ip, "10.") {
		logger.Debug("Skipping geo detection for local/invalid IP", zap.String("ip", ip))
		return defaultGeo
	}

	// 1. Check Redis cache first
	cacheKey := fmt.Sprintf("geo:ip:%s", ip)
	if g.redisClient != nil {
		cachedData, err := g.redisClient.Get(cacheKey)
		if err == nil && cachedData != "" {
			geo := parseGeoCache(cachedData)
			logger.Debug("Geo data from cache",
				zap.String("ip", ip),
				zap.String("country", geo.CountryCode),
				zap.String("currency", geo.Currency),
			)
			return geo
		}
	}

	// 2. Check Cloudflare-IPCountry header if available
	if cfCountry != "" && len(cfCountry) == 2 {
		geo := mapCountryToGeo(strings.ToUpper(cfCountry))
		g.cacheGeoData(cacheKey, geo)
		logger.Info("Geo data from Cloudflare header",
			zap.String("ip", ip),
			zap.String("country", geo.CountryCode),
			zap.String("currency", geo.Currency),
		)
		return geo
	}

	// 3. Fallback to ipapi.co API
	geo, err := g.detectFromIPAPI(ctx, ip)
	if err != nil {
		logger.Warn("Failed to detect geo from IP API, using default",
			zap.String("ip", ip),
			zap.Error(err),
		)
		return defaultGeo
	}

	// Cache the result
	g.cacheGeoData(cacheKey, geo)

	logger.Info("Geo data detected from IP API",
		zap.String("ip", ip),
		zap.String("country", geo.CountryCode),
		zap.String("currency", geo.Currency),
	)

	return geo
}

// detectFromIPAPI queries ipapi.co for IP geolocation
func (g *GeoDetector) detectFromIPAPI(ctx context.Context, ip string) (GeoData, error) {
	url := fmt.Sprintf("https://ipapi.co/%s/json/", ip)

	req, err := http.NewRequestWithContext(ctx, "GET", url, nil)
	if err != nil {
		return GeoData{}, fmt.Errorf("failed to create request: %w", err)
	}

	// Add User-Agent to avoid rate limiting
	req.Header.Set("User-Agent", "RateGuard/1.0")

	resp, err := g.httpClient.Do(req)
	if err != nil {
		return GeoData{}, fmt.Errorf("failed to query ipapi.co: %w", err)
	}
	defer resp.Body.Close()

	if resp.StatusCode != http.StatusOK {
		body, _ := io.ReadAll(resp.Body)
		return GeoData{}, fmt.Errorf("ipapi.co returned status %d: %s", resp.StatusCode, string(body))
	}

	var apiResp IPAPIResponse
	if err := json.NewDecoder(resp.Body).Decode(&apiResp); err != nil {
		return GeoData{}, fmt.Errorf("failed to decode ipapi.co response: %w", err)
	}

	if apiResp.Error {
		return GeoData{}, fmt.Errorf("ipapi.co error: %s", apiResp.Reason)
	}

	if apiResp.CountryCode == "" {
		return GeoData{}, fmt.Errorf("empty country code from ipapi.co")
	}

	return mapCountryToGeo(apiResp.CountryCode), nil
}

// mapCountryToGeo maps country code to currency and payment provider
// mapCountryToGeo maps country code to currency and payment provider
func mapCountryToGeo(countryCode string) GeoData {
	countryCode = strings.ToUpper(countryCode)

	if countryCode == "IN" {
		return GeoData{
			CountryCode: "IN",
			Currency:    "INR",
			Provider:    "razorpay",
		}
	}

	// Eurozone countries
	eurozone := map[string]bool{
		"AT": true, "BE": true, "HR": true, "CY": true, "EE": true,
		"FI": true, "FR": true, "DE": true, "GR": true, "IE": true,
		"IT": true, "LV": true, "LT": true, "LU": true, "MT": true,
		"NL": true, "PT": true, "SK": true, "SI": true, "ES": true,
	}

	if eurozone[countryCode] {
		return GeoData{
			CountryCode: countryCode,
			Currency:    "EUR",
			Provider:    "stripe",
		}
	}

	// All other countries default to USD and Stripe
	return GeoData{
		CountryCode: countryCode,
		Currency:    "USD",
		Provider:    "stripe",
	}
}

// cacheGeoData caches geo data in Redis
func (g *GeoDetector) cacheGeoData(key string, geo GeoData) {
	if g.redisClient == nil {
		return
	}

	// Format: {country_code}:{currency}:{provider}
	value := fmt.Sprintf("%s:%s:%s", geo.CountryCode, geo.Currency, geo.Provider)
	if err := g.redisClient.Set(key, value, 24*time.Hour); err != nil {
		logger.Warn("Failed to cache geo data",
			zap.String("key", key),
			zap.Error(err),
		)
	}
}

// parseGeoCache parses cached geo data string
func parseGeoCache(data string) GeoData {
	parts := strings.Split(data, ":")
	if len(parts) != 3 {
		return GeoData{Currency: "USD", Provider: "stripe"}
	}

	return GeoData{
		CountryCode: parts[0],
		Currency:    parts[1],
		Provider:    parts[2],
	}
}

// ExtractIPFromRequest extracts the client IP from request headers
// Checks X-Forwarded-For, X-Real-IP, and falls back to RemoteAddr
func ExtractIPFromRequest(xForwardedFor, xRealIP, remoteAddr string) string {
	// Try X-Forwarded-For first (Cloudflare, load balancers)
	if xForwardedFor != "" {
		// Take first IP if multiple (client, proxy1, proxy2)
		ips := strings.Split(xForwardedFor, ",")
		if len(ips) > 0 {
			ip := strings.TrimSpace(ips[0])
			if ip != "" {
				return ip
			}
		}
	}

	// Try X-Real-IP (some proxies)
	if xRealIP != "" {
		return strings.TrimSpace(xRealIP)
	}

	// Fallback to RemoteAddr (format: "ip:port")
	if remoteAddr != "" {
		// Strip port if present
		if idx := strings.LastIndex(remoteAddr, ":"); idx != -1 {
			return remoteAddr[:idx]
		}
		return remoteAddr
	}

	return ""
}
