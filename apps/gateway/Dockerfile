# ============================================
# Build stage
# ============================================
FROM golang:1.24-alpine AS builder

# Install build dependencies
RUN apk add --no-cache \
    git \
    make \
    ca-certificates \
    tzdata

# Set working directory
WORKDIR /build/apps/gateway

# Copy go mod files first (better caching)
COPY apps/gateway/go.mod apps/gateway/go.sum ./
COPY packages/sdk-go/go.mod ../../packages/sdk-go/go.mod
COPY packages/sdk-go/go.sum ../../packages/sdk-go/go.sum

# Download dependencies (cached if go.mod/go.sum unchanged)
RUN go mod download && go mod verify

# Copy source code
COPY apps/gateway/. .
COPY packages/sdk-go/ ../../packages/sdk-go/

# Run tests during build (fail fast if tests fail)
# Run tests during build (fail fast if tests fail)
# RUN go test -short ./...

# Build optimized binary
RUN CGO_ENABLED=0 GOOS=linux GOARCH=amd64 \
    go build \
    -ldflags='-w -s -extldflags "-static"' \
    -a \
    -o aggregator \
    ./cmd/main.go

# Verify binary (skip execution as it requires DB connection)
# RUN chmod +x aggregator && ./aggregator --help || echo "Binary built successfully"

# ============================================
# Final stage - Minimal runtime image
# ============================================
FROM alpine:3.19

# Add metadata labels
LABEL maintainer="ops@example.com" \
      version="1.0.1" \
      description="RateGuard Gateway - Production Ready" \
      org.opencontainers.image.source="https://github.com/varbees/rateguard"

# Install runtime dependencies
RUN apk --no-cache add \
    ca-certificates \
    tzdata \
    curl \
    jq \
    && update-ca-certificates

# Create non-root user for security
RUN addgroup -g 1000 aggregator && \
    adduser -D -u 1000 -G aggregator aggregator && \
    mkdir -p /app/config /app/logs && \
    chown -R aggregator:aggregator /app

# Set working directory
WORKDIR /app

# Copy binary and config from builder
COPY --from=builder --chown=aggregator:aggregator /build/apps/gateway/aggregator .
COPY --from=builder --chown=aggregator:aggregator /build/apps/gateway/config ./config
COPY --from=builder --chown=aggregator:aggregator /build/apps/gateway/migrations ./migrations

# Copy monitoring scripts (optional, for debugging)
# COPY --from=builder --chown=aggregator:aggregator /build/monitoring ./monitoring

# Switch to non-root user
USER aggregator

# Expose port (configurable via env)
EXPOSE 8080

# Health check (uses curl from alpine)
HEALTHCHECK --interval=30s --timeout=3s --start-period=10s --retries=3 \
  CMD curl -f http://localhost:${AGG_SERVER_PORT:-8080}/health || exit 1

# Use exec form for proper signal handling
ENTRYPOINT ["/app/aggregator"]

# Optional: Add default CMD that can be overridden
CMD []
