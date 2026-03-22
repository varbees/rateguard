package proxy

import (
	"context"
	"fmt"
	"net"
	"net/http"
	"time"
)

// Private IP ranges to block
var privateIPBlocks []*net.IPNet

func init() {
	for _, cidr := range []string{
		"127.0.0.0/8",    // IPv4 loopback
		"10.0.0.0/8",     // RFC1918
		"172.16.0.0/12",  // RFC1918
		"192.168.0.0/16", // RFC1918
		"169.254.0.0/16", // RFC3927 link-local
		"::1/128",        // IPv6 loopback
		"fc00::/7",       // IPv6 unique local
		"fe80::/10",      // IPv6 link-local
	} {
		_, block, err := net.ParseCIDR(cidr)
		if err != nil {
			panic(fmt.Errorf("parse error on %q: %v", cidr, err))
		}
		privateIPBlocks = append(privateIPBlocks, block)
	}
}

// isPrivateIP checks if an IP address is in a private range
func isPrivateIP(ip net.IP) bool {
	if ip.IsLoopback() || ip.IsLinkLocalMulticast() || ip.IsLinkLocalUnicast() {
		return true
	}

	for _, block := range privateIPBlocks {
		if block.Contains(ip) {
			return true
		}
	}
	return false
}

// SafeTransport returns an http.Transport with a custom DialContext that blocks private IPs
func NewSafeTransport() *http.Transport {
	return &http.Transport{
		Proxy: http.ProxyFromEnvironment,
		DialContext: func(ctx context.Context, network, addr string) (net.Conn, error) {
			host, port, err := net.SplitHostPort(addr)
			if err != nil {
				return nil, err
			}

			// Resolve IP
			ips, err := net.LookupIP(host)
			if err != nil {
				return nil, err
			}

			// Check all resolved IPs
			for _, ip := range ips {
				if isPrivateIP(ip) {
					return nil, fmt.Errorf("access to private IP %s is blocked", ip.String())
				}
			}

			// Dial the first resolved IP (standard behavior, but we've checked them)
			// Note: There's a small TOCTOU race here if DNS changes between LookupIP and Dial,
			// but standard net.Dialer doesn't expose the resolved IP easily for validation before connection.
			// For high security, we would dial the specific IP we validated.
			
			// Let's dial the specific validated IP to avoid TOCTOU
			// We prefer IPv4 if available
			var targetIP net.IP
			for _, ip := range ips {
				if ip.To4() != nil {
					targetIP = ip
					break
				}
			}
			if targetIP == nil && len(ips) > 0 {
				targetIP = ips[0]
			}
			
			if targetIP == nil {
				return nil, fmt.Errorf("no valid IPs found for %s", host)
			}

			dialer := &net.Dialer{
				Timeout:   30 * time.Second,
				KeepAlive: 30 * time.Second,
			}
			
			// Reconstruct address with IP
			targetAddr := net.JoinHostPort(targetIP.String(), port)
			return dialer.DialContext(ctx, network, targetAddr)
		},
		ForceAttemptHTTP2:     true,
		MaxIdleConns:          100,
		IdleConnTimeout:       90 * time.Second,
		TLSHandshakeTimeout:   10 * time.Second,
		ExpectContinueTimeout: 1 * time.Second,
	}
}
