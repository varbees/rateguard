#!/bin/bash

set -euo pipefail

SERVICE_URL="${AGG_SERVICE_URL:-http://localhost:8008}"

check_json() {
	local url="$1"
	local jq_expr="$2"
	local label="$3"

	echo "Checking ${label}..."
	curl -sf "${url}" | jq -e "${jq_expr}" >/dev/null
}

check_json "${SERVICE_URL}/health" '.status == "ok" or .status == "healthy"' "health"
check_json "${SERVICE_URL}/ready" '.healthy == true' "readiness"
check_json "${SERVICE_URL}/api/v1/openapi.json" '.openapi != null' "OpenAPI"
check_json "${SERVICE_URL}/" '.status == "running"' "root"

echo "Smoke checks passed for ${SERVICE_URL}"
