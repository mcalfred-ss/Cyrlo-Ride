#!/usr/bin/env bash
set -euo pipefail

BACKUP_DIR=/var/backups/cyrlo-ride
DRILL_DB=cyrlo_ride_restore_drill

set -a
# shellcheck disable=SC1091
. /etc/cyrlo-ride/ride.env
set +a

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

mkdir -p "$BACKUP_DIR"
bash /usr/local/sbin/cyrlo-ride-backup.sh
LATEST="$(ls -1t "$BACKUP_DIR"/cyrlo_ride_*.dump | head -n 1)"
SIZE="$(stat -c%s "$LATEST")"
echo "latest_dump=$LATEST size_bytes=$SIZE"
if [ "$SIZE" -lt 1000 ]; then
  echo "Backup too small; aborting restore drill"
  exit 1
fi

APP_ROLE="$(
python3 - <<'PY'
import os, urllib.parse
u = urllib.parse.urlparse(os.environ["DATABASE_URL"])
print(urllib.parse.unquote(u.username or ""))
PY
)"
echo "app_role=$APP_ROLE"
if [ -z "$APP_ROLE" ]; then
  echo "Could not parse DB role from DATABASE_URL"
  exit 1
fi

sudo -u postgres psql -v ON_ERROR_STOP=1 <<SQL
SELECT pg_terminate_backend(pid)
FROM pg_stat_activity
WHERE datname = '$DRILL_DB' AND pid <> pg_backend_pid();
DROP DATABASE IF EXISTS $DRILL_DB;
CREATE DATABASE $DRILL_DB OWNER $APP_ROLE;
SQL

# Ensure PG15+ public schema grants for the owning role.
sudo -u postgres psql -d "$DRILL_DB" -v ON_ERROR_STOP=1 <<SQL
GRANT ALL ON SCHEMA public TO $APP_ROLE;
GRANT CREATE ON SCHEMA public TO $APP_ROLE;
ALTER SCHEMA public OWNER TO $APP_ROLE;
SQL

export DRILL_DB
RESTORE_URL="$(
python3 - <<'PY'
import os, urllib.parse
u = urllib.parse.urlparse(os.environ["DATABASE_URL"])
print(urllib.parse.urlunparse((u.scheme, u.netloc, "/" + os.environ["DRILL_DB"], "", "", "")))
PY
)"

pg_restore --clean --if-exists --no-owner --role="$APP_ROLE" --dbname="$RESTORE_URL" "$LATEST"
TABLES="$(sudo -u postgres psql -d "$DRILL_DB" -Atc "SELECT count(*) FROM information_schema.tables WHERE table_schema='public';")"
echo "restore_drill_public_tables=$TABLES"
if [ "$TABLES" -lt 1 ]; then
  echo "Restore drill failed"
  exit 1
fi

sudo -u postgres psql -v ON_ERROR_STOP=1 -c "DROP DATABASE $DRILL_DB;"

cat >/etc/cron.d/cyrlo-ride-backup <<EOF
SHELL=/bin/bash
PATH=/usr/local/sbin:/usr/local/bin:/usr/sbin:/usr/bin:/sbin:/bin
15 2 * * * root /usr/local/sbin/cyrlo-ride-backup.sh >> /var/log/cyrlo-ride-backup.log 2>&1
EOF
chmod 644 /etc/cron.d/cyrlo-ride-backup
echo "ITEM7_PASS true"
