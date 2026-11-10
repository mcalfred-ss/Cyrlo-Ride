#!/usr/bin/env bash
# Installed on the VPS as /usr/local/sbin/cyrlo-ride-backup.sh
# Usage: cyrlo-ride-backup.sh hourly|daily
set -euo pipefail

MODE="${1:-daily}"
case "$MODE" in
  hourly|daily) ;;
  *)
    echo "ERROR: mode must be 'hourly' or 'daily' (got: $MODE)" >&2
    exit 1
    ;;
esac

set -a
# shellcheck disable=SC1091
. /etc/cyrlo-ride/ride.env
if [[ -f /etc/cyrlo-ride/providers.env ]]; then
  # shellcheck disable=SC1091
  . /etc/cyrlo-ride/providers.env
fi
set +a

# pg_dump rejects Prisma query params like schema=public
export DATABASE_URL="$(
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

export BACKUP_DIR="${BACKUP_DIR:-/var/backups/cyrlo-ride}"
export ENV_FILE="${ENV_FILE:-/etc/cyrlo-ride/ride.env}"
export PROVIDERS_ENV_FILE="${PROVIDERS_ENV_FILE:-/etc/cyrlo-ride/providers.env}"
export BUNNY_BACKUP_PREFIX="${BUNNY_BACKUP_PREFIX:-db-backups}"

exec bash /var/www/cyrlo-ride-api/app/backend/scripts/backup-postgres.sh "$MODE"
