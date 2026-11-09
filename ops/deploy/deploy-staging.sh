#!/usr/bin/env bash
# Deploy Cyrlo Ride API to the staging VPS (systemd unit cyrlo-ride-api).
# Intended to run on the server as root (or via SSH from CI / local).
set -euo pipefail

APP_ROOT="${APP_ROOT:-/var/www/cyrlo-ride-api/app}"
BACKEND="${APP_ROOT}/backend"
APP_USER="${APP_USER:-cyrlo-ride}"
SERVICE_NAME="${SERVICE_NAME:-cyrlo-ride-api}"
GIT_REF="${GIT_REF:-main}"
REMOTE="${REMOTE:-origin}"
HEALTH_URL="${HEALTH_URL:-https://cyrloride.eqostack.com/api/v1/health}"
READY_URL="${READY_URL:-https://cyrloride.eqostack.com/api/v1/health/ready}"
COEXIST_URL="${COEXIST_URL:-https://eqostack.com/}"
RIDE_ENV_FILE="${RIDE_ENV_FILE:-/etc/cyrlo-ride/ride.env}"
PROVIDERS_ENV_FILE="${PROVIDERS_ENV_FILE:-/etc/cyrlo-ride/providers.env}"

SKIP_PULL=0
SKIP_MIGRATE=0
SKIP_BUILD=0
SKIP_RESTART=0
FORCE_DIRTY=0
DRY_RUN=0

usage() {
  cat <<'EOF'
Usage: deploy-staging.sh [options]

Options:
  --ref <git-ref>     Deploy this ref (default: main)
  --skip-pull         Do not git fetch/checkout/pull
  --skip-migrate      Skip prisma migrate deploy
  --skip-build        Skip npm ci / build
  --skip-restart      Skip systemctl restart
  --force-dirty       Allow deploy with a dirty git working tree
  --dry-run           Print steps only
  -h, --help          Show help

Environment overrides: APP_ROOT, APP_USER, SERVICE_NAME, GIT_REF,
HEALTH_URL, READY_URL, COEXIST_URL, RIDE_ENV_FILE, PROVIDERS_ENV_FILE
EOF
}

while [[ $# -gt 0 ]]; do
  case "$1" in
    --ref) GIT_REF="$2"; shift 2 ;;
    --skip-pull) SKIP_PULL=1; shift ;;
    --skip-migrate) SKIP_MIGRATE=1; shift ;;
    --skip-build) SKIP_BUILD=1; shift ;;
    --skip-restart) SKIP_RESTART=1; shift ;;
    --force-dirty) FORCE_DIRTY=1; shift ;;
    --dry-run) DRY_RUN=1; shift ;;
    -h|--help) usage; exit 0 ;;
    *) echo "Unknown arg: $1" >&2; usage >&2; exit 2 ;;
  esac
done

log() { printf '[deploy-staging] %s\n' "$*"; }
die() { printf '[deploy-staging] ERROR: %s\n' "$*" >&2; exit 1; }

run() {
  if [[ "$DRY_RUN" -eq 1 ]]; then
    log "DRY-RUN: $*"
    return 0
  fi
  eval "$@"
}

require_root() {
  [[ "$(id -u)" -eq 0 ]] || die "Run as root (needed for systemctl and safe.directory)."
}

as_app() {
  local cmd="$1"
  if [[ "$DRY_RUN" -eq 1 ]]; then
    log "DRY-RUN (as ${APP_USER}): ${cmd}"
    return 0
  fi
  sudo -u "$APP_USER" -H bash -lc "$cmd"
}

health_wait() {
  local url="$1"
  local label="$2"
  local i
  for i in $(seq 1 30); do
    if curl -fsS -o /dev/null "$url"; then
      log "${label} OK (${url})"
      return 0
    fi
    sleep 2
  done
  die "${label} failed after retries: ${url}"
}

require_root
[[ -d "$APP_ROOT/.git" ]] || die "Missing git checkout at ${APP_ROOT}"
[[ -f "$RIDE_ENV_FILE" ]] || die "Missing ${RIDE_ENV_FILE}"
[[ -f "$PROVIDERS_ENV_FILE" ]] || die "Missing ${PROVIDERS_ENV_FILE}"
id -u "$APP_USER" >/dev/null 2>&1 || die "Missing system user ${APP_USER}"

run "git config --global --add safe.directory '${APP_ROOT}' || true"

if [[ "$FORCE_DIRTY" -eq 0 ]]; then
  if ! as_app "cd '${APP_ROOT}' && git diff --quiet && git diff --cached --quiet"; then
    die "Working tree is dirty under ${APP_ROOT}. Commit/push server-only edits, or pass --force-dirty."
  fi
else
  log "Allowing dirty working tree (--force-dirty)"
fi

if [[ "$SKIP_PULL" -eq 0 ]]; then
  log "Pulling ${REMOTE}/${GIT_REF}"
  as_app "cd '${APP_ROOT}' && git fetch '${REMOTE}' && git checkout '${GIT_REF}' && git pull --ff-only '${REMOTE}' '${GIT_REF}'"
else
  log "Skipping git pull"
fi

DEPLOYED_SHA="$(as_app "cd '${APP_ROOT}' && git rev-parse --short HEAD" 2>/dev/null || true)"
if [[ "$DRY_RUN" -eq 1 ]]; then
  DEPLOYED_SHA="(dry-run)"
fi
log "Tree at ${DEPLOYED_SHA}"

if [[ "$SKIP_BUILD" -eq 0 ]]; then
  log "npm ci"
  as_app "cd '${BACKEND}' && npm ci"
else
  log "Skipping npm ci / build"
fi

if [[ "$SKIP_MIGRATE" -eq 0 ]]; then
  log "prisma migrate deploy + generate"
  if [[ "$DRY_RUN" -eq 1 ]]; then
    log "DRY-RUN: source env files && prisma migrate deploy && prisma generate"
  else
    # shellcheck disable=SC1090
    set -a
    # ride.env / providers.env are group-readable by cyrlo-ride
    source "$RIDE_ENV_FILE"
    source "$PROVIDERS_ENV_FILE"
    set +a
    sudo -u "$APP_USER" -E bash -lc "cd '${BACKEND}' && npx prisma migrate deploy && npx prisma generate"
  fi
else
  log "Skipping migrations"
fi

if [[ "$SKIP_BUILD" -eq 0 ]]; then
  log "npm run build"
  as_app "cd '${BACKEND}' && npm run build"
fi

if [[ "$SKIP_RESTART" -eq 0 ]]; then
  log "Restart ${SERVICE_NAME}"
  run "systemctl restart '${SERVICE_NAME}'"
  run "systemctl is-active --quiet '${SERVICE_NAME}'"
else
  log "Skipping restart"
fi

if [[ "$DRY_RUN" -eq 0 ]]; then
  health_wait "$HEALTH_URL" "health"
  # readiness may be false if optional providers fail; still require HTTP 200
  if ! curl -fsS -o /dev/null "$READY_URL"; then
    die "ready check failed: ${READY_URL}"
  fi
  log "ready OK (${READY_URL})"
  health_wait "$COEXIST_URL" "eqostack coexistence"
fi

log "Deploy complete (${DEPLOYED_SHA})"
