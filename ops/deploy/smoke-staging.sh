#!/usr/bin/env bash
# Quick staging smoke checks (API + coexistence hosts).
set -euo pipefail

HEALTH_URL="${HEALTH_URL:-https://cyrloride.eqostack.com/api/v1/health}"
READY_URL="${READY_URL:-https://cyrloride.eqostack.com/api/v1/health/ready}"
TERMS_URL="${TERMS_URL:-https://eqostack.com/cyrlo/terms}"
PRIVACY_URL="${PRIVACY_URL:-https://eqostack.com/cyrlo/privacy}"
HOME_URL="${HOME_URL:-https://eqostack.com/}"

check() {
  local label="$1"
  local url="$2"
  local code
  code="$(curl -sS -o /dev/null -w '%{http_code}' "$url" || true)"
  if [[ "$code" != "200" ]]; then
    printf 'FAIL %s %s -> %s\n' "$label" "$url" "$code" >&2
    return 1
  fi
  printf 'OK   %s %s\n' "$label" "$url"
}

check health "$HEALTH_URL"
check ready "$READY_URL"
check terms "$TERMS_URL"
check privacy "$PRIVACY_URL"
check home "$HOME_URL"
echo "smoke OK"
