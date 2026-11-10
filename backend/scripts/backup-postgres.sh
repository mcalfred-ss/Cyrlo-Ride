#!/usr/bin/env bash
# =============================================================================
# Cyrlo Ride Postgres backup → local disk + Bunny Storage (db-backups/)
# =============================================================================
#
# Modes (first arg):
#   hourly  — cyrlo_ride-hourly-YYYY-mm-dd_HHMMSS.dump ; retain ~48h locally + Bunny
#   daily   — cyrlo_ride-daily-YYYY-mm-dd_HHMMSS.dump  ; retain 30d locally + Bunny
#   (none)  — treated as daily
#
# Usage on VPS:
#   /var/www/cyrlo-ride-api/app/backend/scripts/backup-postgres.sh hourly
#   /var/www/cyrlo-ride-api/app/backend/scripts/backup-postgres.sh daily
#   /usr/local/sbin/cyrlo-ride-backup.sh hourly
#
# Requires DATABASE_URL (Prisma query params like schema=public are stripped).
#
# Env overrides:
#   BACKUP_DIR, FILE_PREFIX, BUNNY_BACKUP_PREFIX, BUNNY_REQUIRED
#   ENV_FILE / PROVIDERS_ENV_FILE — for Bunny creds if not already exported
#   BUNNY_STORAGE_ZONE_NAME, BUNNY_STORAGE_ACCESS_KEY, BUNNY_STORAGE_HOSTNAME
# =============================================================================

set -euo pipefail

BACKUP_DIR="${BACKUP_DIR:-/var/backups/cyrlo-ride}"
FILE_PREFIX="${FILE_PREFIX:-cyrlo_ride}"
ENV_FILE="${ENV_FILE:-/etc/cyrlo-ride/ride.env}"
PROVIDERS_ENV_FILE="${PROVIDERS_ENV_FILE:-/etc/cyrlo-ride/providers.env}"
BUNNY_PREFIX="${BUNNY_BACKUP_PREFIX:-db-backups}"
BUNNY_REQUIRED="${BUNNY_REQUIRED:-0}"

MODE="${1:-daily}"
case "$MODE" in
  hourly|daily) ;;
  *)
    echo "ERROR: mode must be 'hourly' or 'daily' (got: $MODE)" >&2
    exit 1
    ;;
esac

if [[ "$MODE" == "hourly" ]]; then
  BUNNY_RETENTION_HOURS=48
else
  BUNNY_RETENTION_HOURS=$((30 * 24))
fi

STAMP="$(date -u +%Y-%m-%d_%H%M%S)"
OUT="${BACKUP_DIR}/${FILE_PREFIX}-${MODE}-${STAMP}.dump"
LOG="${BACKUP_DIR}/backup.log"
BASENAME="$(basename "$OUT")"
LIST_TMP="/tmp/cyrlo-ride-bunny-backup-list.json"
RESP_TMP="/tmp/cyrlo-ride-bunny-backup-resp.txt"

mkdir -p "$BACKUP_DIR"
chgrp postgres "$BACKUP_DIR" 2>/dev/null || true
chmod 750 "$BACKUP_DIR"

log() {
  echo "[$(date -u +%Y-%m-%dT%H:%M:%SZ)] $*"
}

die() {
  log "ERROR: $*"
  exit 1
}

env_get() {
  local key="$1"
  local file
  for file in "$ENV_FILE" "$PROVIDERS_ENV_FILE"; do
    [[ -f "$file" ]] || continue
    local val
    val="$(grep -E "^${key}=" "$file" 2>/dev/null | head -1 | cut -d= -f2- | tr -d '\r' || true)"
    if [[ -n "$val" ]]; then
      printf '%s' "$val"
      return 0
    fi
  done
  return 0
}

bunny_cleanup_old() {
  local zone="$1"
  local access="$2"
  local host="$3"

  local list_json
  list_json="$(
    curl -sS -H "AccessKey: ${access}" -H "Accept: application/json" \
      "https://${host}/${zone}/${BUNNY_PREFIX}/" || true
  )"
  printf '%s' "$list_json" >"$LIST_TMP"

  command -v python3 >/dev/null 2>&1 || return 0

  MODE="$MODE" KEEP_HOURS="$BUNNY_RETENTION_HOURS" BUNNY_PREFIX="$BUNNY_PREFIX" \
    ZONE="$zone" HOST="$host" ACCESS="$access" FILE_PREFIX="$FILE_PREFIX" \
    LIST_TMP="$LIST_TMP" python3 - <<'PY' || true
import json, os, re, urllib.request
from datetime import datetime, timezone, timedelta

mode = os.environ["MODE"]
keep_hours = int(os.environ["KEEP_HOURS"])
cutoff = datetime.now(timezone.utc) - timedelta(hours=keep_hours)
zone = os.environ["ZONE"]
host = os.environ["HOST"]
access = os.environ["ACCESS"]
prefix = os.environ["BUNNY_PREFIX"].rstrip("/")
file_prefix = os.environ["FILE_PREFIX"]
list_tmp = os.environ["LIST_TMP"]
pat = re.compile(
    rf"^{re.escape(file_prefix)}-{re.escape(mode)}-(\d{{4}}-\d{{2}}-\d{{2}})_(\d{{6}})"
)
# Legacy Ride naming: cyrlo_ride_YYYYMMDDTHHMMSSZ.dump
legacy_pat = re.compile(
    rf"^{re.escape(file_prefix)}_(\d{{8}})T(\d{{6}})Z\.dump$"
)

try:
    with open(list_tmp, "r", encoding="utf-8") as f:
        items = json.load(f)
except Exception:
    raise SystemExit(0)

if not isinstance(items, list):
    raise SystemExit(0)

for item in items:
    name = item.get("ObjectName") or item.get("objectName") or ""
    base = name.split("/")[-1]
    stamp_dt = None
    m = pat.match(base)
    if m:
        try:
            stamp_dt = datetime.strptime(
                f"{m.group(1)}_{m.group(2)}", "%Y-%m-%d_%H%M%S"
            ).replace(tzinfo=timezone.utc)
        except ValueError:
            stamp_dt = None
    elif mode == "daily":
        m2 = legacy_pat.match(base)
        if m2:
            try:
                stamp_dt = datetime.strptime(
                    f"{m2.group(1)}T{m2.group(2)}Z", "%Y%m%dT%H%M%SZ"
                ).replace(tzinfo=timezone.utc)
            except ValueError:
                stamp_dt = None
    if stamp_dt is None or stamp_dt >= cutoff:
        continue
    key = f"{prefix}/{base}"
    url = f"https://{host}/{zone}/{key}"
    req = urllib.request.Request(url, method="DELETE", headers={"AccessKey": access})
    try:
        with urllib.request.urlopen(req, timeout=60) as resp:
            print(f"Bunny deleted old dump {base} (HTTP {resp.status})")
    except Exception as e:
        print(f"Bunny delete skipped {base}: {e}")
PY
}

# Redirect all output to log while still printing to stdout via tee
exec > >(tee -a "$LOG") 2>&1

log "Starting ${MODE} backup → $OUT"

: "${DATABASE_URL:?DATABASE_URL is required}"

if ! command -v pg_dump >/dev/null 2>&1; then
  die "pg_dump not found"
fi

# Prisma URLs often include ?schema=public — pg_dump rejects that query param.
DUMP_URL="$(
python3 - <<'PY'
import os, urllib.parse
u = urllib.parse.urlparse(os.environ["DATABASE_URL"])
q = [
    (k, v)
    for k, v in urllib.parse.parse_qsl(u.query, keep_blank_values=True)
    if k.lower() != "schema"
]
print(urllib.parse.urlunparse((u.scheme, u.netloc, u.path, "", urllib.parse.urlencode(q), "")))
PY
)"

TMP_OUT="/tmp/${FILE_PREFIX}-backup-$$.dump"
if ! pg_dump "$DUMP_URL" --format=custom --file="$TMP_OUT"; then
  rm -f "$TMP_OUT"
  die "pg_dump failed"
fi
mv "$TMP_OUT" "$OUT"
chown postgres:postgres "$OUT" 2>/dev/null || true
chmod 640 "$OUT"
SIZE="$(du -h "$OUT" | awk '{print $1}')"
log "OK size=$SIZE"

zone="${BUNNY_STORAGE_ZONE_NAME:-$(env_get BUNNY_STORAGE_ZONE_NAME)}"
access="${BUNNY_STORAGE_ACCESS_KEY:-$(env_get BUNNY_STORAGE_ACCESS_KEY)}"
host="${BUNNY_STORAGE_HOSTNAME:-$(env_get BUNNY_STORAGE_HOSTNAME)}"

bunny_ok=0
if [[ -n "$zone" && -n "$access" && "$zone" != "your-storage-zone" && "$access" != "your-storage-access-key" ]]; then
  bunny_ok=1
fi

if [[ "$bunny_ok" -eq 0 ]]; then
  if [[ "$BUNNY_REQUIRED" == "1" ]]; then
    die "Bunny credentials required but missing (BUNNY_STORAGE_ZONE_NAME / BUNNY_STORAGE_ACCESS_KEY)"
  fi
  log "Bunny upload skipped (BUNNY_* not configured)"
else
  if [[ -z "$host" ]]; then
    host="storage.bunnycdn.com"
  fi
  object_key="${BUNNY_PREFIX}/${BASENAME}"
  url="https://${host}/${zone}/${object_key}"
  log "Uploading to Bunny → ${zone}/${object_key}"
  http_code="$(
    curl -sS -o "$RESP_TMP" -w '%{http_code}' \
      -X PUT "$url" \
      -H "AccessKey: ${access}" \
      -H "Content-Type: application/octet-stream" \
      --data-binary "@${OUT}"
  )" || die "Bunny upload curl failed"

  if [[ "$http_code" != "201" && "$http_code" != "200" ]]; then
    die "Bunny upload FAILED HTTP ${http_code}: $(head -c 200 "$RESP_TMP" 2>/dev/null || true)"
  fi
  log "Bunny upload OK"

  bunny_cleanup_old "$zone" "$access" "$host"
fi

if [[ "$MODE" == "hourly" ]]; then
  find "$BACKUP_DIR" -type f -name "${FILE_PREFIX}-hourly-*.dump" -mmin +2880 -print -delete || true
else
  find "$BACKUP_DIR" -type f -name "${FILE_PREFIX}-daily-*.dump" -mtime +30 -print -delete || true
  # Legacy Ride naming from the previous local-only script: cyrlo_ride_YYYYMMDDTHHMMSSZ.dump
  find "$BACKUP_DIR" -type f -name "${FILE_PREFIX}_*.dump" \
    ! -name "${FILE_PREFIX}-hourly-*" ! -name "${FILE_PREFIX}-daily-*" \
    -mtime +30 -print -delete || true
fi
log "Local retention done (mode=${MODE})"
