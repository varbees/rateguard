#!/bin/bash

# RateGuard Run Script
# Usage: ./scripts/run.sh [dev|prod|docker]

set -e

MODE=${1:-dev}

# Colors for output
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m'

case $MODE in
    dev)
        echo -e "${GREEN}🔥 RateGuard - Development Mode${NC}"
        echo -e "${BLUE}================================${NC}"
        
        # Development environment variables
        export SERVER_PORT=8008
        export BASE_URL=http://localhost:8008
        export AGG_LOGGING_LEVEL=debug
        export AGG_LOGGING_FORMAT=console
        export AGG_LOGGING_DEVELOPMENT=true
        
        # Database (use defaults from .env if not set)
        export DB_HOST=${DB_HOST:-localhost}
        export DB_PORT=${DB_PORT:-5432}
        export DB_USER=${DB_USER:-rateguard}
        export DB_NAME=${DB_NAME:-rateguard}
        
        # Redis (use defaults from .env if not set)
        export REDIS_HOST=${REDIS_HOST:-localhost}
        export REDIS_PORT=${REDIS_PORT:-6379}
        export RATE_LIMITER_BACKEND=${RATE_LIMITER_BACKEND:-memory}
        
        echo -e "${YELLOW}→${NC} Server: http://localhost:8008"
        echo -e "${YELLOW}→${NC} Database: postgresql://$DB_USER@$DB_HOST:$DB_PORT/$DB_NAME"
        echo -e "${YELLOW}→${NC} Redis: $REDIS_HOST:$REDIS_PORT"
        echo -e "${YELLOW}→${NC} Rate Limiter: $RATE_LIMITER_BACKEND"
        echo -e "${YELLOW}→${NC} Logging: debug (console)"
        echo ""
        
        go run cmd/main.go
        ;;
    prod)
        echo -e "${GREEN}🚀 RateGuard - Production Mode${NC}"
        echo -e "${BLUE}================================${NC}"
        
        # Production environment variables
        export AGG_LOGGING_LEVEL=info
        export AGG_LOGGING_FORMAT=json
        export AGG_LOGGING_DEVELOPMENT=false
        
        # Build if not exists
        if [ ! -f "bin/rateguard" ]; then
            echo -e "${YELLOW}Building application...${NC}"
            mkdir -p bin
            go build -ldflags="-s -w" -o bin/rateguard ./cmd/main.go
            echo -e "${GREEN}✓${NC} Build complete"
        fi
        
        echo -e "${YELLOW}→${NC} Running production binary"
        echo -e "${YELLOW}→${NC} Logging: info (json)"
        echo ""
        
        ./bin/rateguard
        ;;
    docker)
        echo -e "${GREEN}🐳 RateGuard - Docker Mode (Full Stack)${NC}"
        echo -e "${BLUE}===========================================${NC}"
        echo -e "${YELLOW}Starting services:${NC}"
        echo -e "  • PostgreSQL (port 5432)"
        echo -e "  • Redis (port 6379)"
        echo -e "  • RateGuard API (port 8008)"
        echo ""
        
        # Check if docker-compose is installed
        if ! command -v docker-compose &> /dev/null; then
            echo -e "${RED}Error: docker-compose is not installed${NC}"
            exit 1
        fi
        
        # Build and start all services
        echo -e "${YELLOW}Building and starting services...${NC}"
        docker-compose up --build
        ;;
    stop)
        echo -e "${YELLOW}Stopping Docker services...${NC}"
        docker-compose down
        echo -e "${GREEN}✓${NC} Services stopped"
        ;;
    logs)
        docker-compose logs -f
        ;;
    *)
        echo "Usage: $0 [dev|prod|docker|stop|logs]"
        echo ""
        echo "Modes:"
        echo "  dev      - Run in development mode (local, no Docker)"
        echo "  prod     - Run in production mode (optimized binary)"
        echo "  docker   - Run full stack with Docker Compose (PostgreSQL + Redis + App)"
        echo "  stop     - Stop Docker services"
        echo "  logs     - View Docker logs"
        echo ""
        echo "Examples:"
        echo "  ./scripts/run.sh          # Run in development mode"
        echo "  ./scripts/run.sh dev      # Run in development mode"
        echo "  ./scripts/run.sh docker   # Start full stack with Docker"
        echo "  ./scripts/run.sh stop     # Stop Docker services"
        exit 1
        ;;
esac
