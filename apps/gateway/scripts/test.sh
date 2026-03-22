#!/bin/bash

# RateGuard Unit Tests Runner
# Runs Go unit tests with coverage and race detection
# Usage: ./scripts/test.sh [options]

set -e

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m' # No Color

# Default values
COVERAGE=true
RACE=true
VERBOSE=false

# Parse arguments
while [[ $# -gt 0 ]]; do
    case $1 in
        --no-coverage)
            COVERAGE=false
            shift
            ;;
        --no-race)
            RACE=false
            shift
            ;;
        -v|--verbose)
            VERBOSE=true
            shift
            ;;
        -h|--help)
            echo "RateGuard Unit Tests Runner"
            echo ""
            echo "Usage: $0 [options]"
            echo ""
            echo "Options:"
            echo "  --no-coverage    Skip coverage report generation"
            echo "  --no-race        Skip race detection"
            echo "  -v, --verbose    Verbose test output"
            echo "  -h, --help       Show this help message"
            exit 0
            ;;
        *)
            echo "Unknown option: $1"
            echo "Use --help for usage information"
            exit 1
            ;;
    esac
done

echo -e "${GREEN}🧪 RateGuard Unit Tests${NC}"
echo -e "${BLUE}========================${NC}"
echo ""

# Build test command
TEST_CMD="go test"

if [ "$VERBOSE" = true ]; then
    TEST_CMD="$TEST_CMD -v"
fi

if [ "$RACE" = true ]; then
    TEST_CMD="$TEST_CMD -race"
fi

if [ "$COVERAGE" = true ]; then
    TEST_CMD="$TEST_CMD -coverprofile=coverage.out"
fi

TEST_CMD="$TEST_CMD ./..."

# Run tests
echo -e "${YELLOW}Command: $TEST_CMD${NC}"
if $TEST_CMD; then
    echo -e "${GREEN}✅ All tests passed!${NC}"
    
    if [ "$COVERAGE" = true ]; then
        echo -e "${GREEN}📊 Generating coverage report...${NC}"
        go tool cover -html=coverage.out -o coverage.html
        
        # Display coverage summary
        COVERAGE_PCT=$(go tool cover -func=coverage.out | grep total | awk '{print $3}')
        echo -e "${GREEN}Total coverage: $COVERAGE_PCT${NC}"
        
        if command -v xdg-open &> /dev/null; then
            echo -e "${YELLOW}Opening coverage report...${NC}"
            xdg-open coverage.html &
        fi
    fi
else
    echo -e "${RED}❌ Tests failed!${NC}"
    exit 1
fi
