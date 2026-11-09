#!/usr/bin/env bash
set -euo pipefail
set -a
# shellcheck disable=SC1091
. /etc/cyrlo-ride/ride.env
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

export BACKUP_DIR=/var/backups/cyrlo-ride
export RETENTION_DAYS=14
exec bash /var/www/cyrlo-ride-api/app/backend/scripts/backup-postgres.sh
