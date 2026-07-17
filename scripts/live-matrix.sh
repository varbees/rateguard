#!/usr/bin/env bash
# Run the live provider suite against every configured provider and print a grid.
#
# Everything else in the test suite proves RateGuard is self-consistent. This
# proves it survives contact with providers that were not built to our
# assumptions — real usage schemas, real SSE framing, real latency. It is the
# only thing that has ever caught a metering bug here (e6eba43: Python and Node
# silently metered ZERO tokens for the most common streaming shape in the
# ecosystem, while 790 tests passed).
#
# Providers are configured by exporting <PREFIX>_API_KEY. Nothing runs without
# a key, and a missing key is reported as SKIP — never as a pass.
#
# NO LOCAL MODELS. Not Ollama, not vLLM, not llama.cpp. They OOM the dev box.
# The offline/CI need is served by conformance/sse_usage_vectors.json, which
# carries real captured bytes from these same providers: deterministic, free,
# no GPU. Capture once here, replay forever there.
#
# Usage:
#   export NVIDIA_NIM_API_KEY=... GROQ_API_KEY=... DEEPSEEK_API_KEY=...
#   scripts/live-matrix.sh
#
# Cost: a handful of ~40-token completions per provider. Free tier: ₹0.

set -uo pipefail

cd "$(dirname "$0")/.." || exit 1
PY_DIR="packages/sdk-python"

# name | base URL | key env var | model
PROVIDERS=(
  "nvidia_nim|https://integrate.api.nvidia.com/v1|NVIDIA_NIM_API_KEY|meta/llama-3.1-8b-instruct"
  "groq|https://api.groq.com/openai/v1|GROQ_API_KEY|llama-3.3-70b-versatile"
  "deepseek|https://api.deepseek.com/v1|DEEPSEEK_API_KEY|deepseek-chat"
  "openai|https://api.openai.com/v1|OPENAI_API_KEY|gpt-4o-mini"
  "openrouter|https://openrouter.ai/api/v1|OPENROUTER_API_KEY|meta-llama/llama-3.3-70b-instruct"
)

pass=0 fail=0 skip=0
declare -a RESULTS

for entry in "${PROVIDERS[@]}"; do
  IFS='|' read -r name base_url key_var model <<<"$entry"
  key="${!key_var:-}"

  if [ -z "$key" ]; then
    RESULTS+=("SKIP|$name|$key_var not set")
    skip=$((skip + 1))
    continue
  fi

  echo "── $name ($model)"
  out=$(cd "$PY_DIR" && \
    RATEGUARD_LIVE_BASE_URL="$base_url" \
    RATEGUARD_LIVE_API_KEY="$key" \
    RATEGUARD_LIVE_MODEL="$model" \
    python3 -m pytest tests/live -q 2>&1)
  code=$?

  summary=$(echo "$out" | tail -1 | tr -d '\r')
  if [ $code -eq 0 ]; then
    RESULTS+=("PASS|$name|$summary")
    pass=$((pass + 1))
  else
    RESULTS+=("FAIL|$name|$summary")
    fail=$((fail + 1))
    echo "$out" | grep -E "^(FAILED|E  |assert)" | head -6
  fi
done

echo
echo "┌─ live provider matrix ─────────────────────────────────────────"
for r in "${RESULTS[@]}"; do
  IFS='|' read -r status name detail <<<"$r"
  case "$status" in
    PASS) icon="✓" ;;
    FAIL) icon="✗" ;;
    *)    icon="·" ;;
  esac
  printf "│ %s %-12s %-6s %s\n" "$icon" "$name" "$status" "${detail:0:52}"
done
echo "└────────────────────────────────────────────────────────────────"
echo "  $pass passed · $fail failed · $skip skipped (no key)"

# A skipped provider is not a pass. Only a real failure fails the run, but
# never let an all-skipped run look green.
if [ $fail -gt 0 ]; then
  exit 1
fi
if [ $pass -eq 0 ]; then
  echo "  NOTHING RAN — every provider was skipped. Export a key."
  exit 2
fi
