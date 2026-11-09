#!/usr/bin/env bash
# Install / verify Cyrlo Ride staging Postgres backups on the VPS.
set -euo pipefail

BACKUP_DIR=/var/backups/cyrlo-ride
SCRIPT_SRC=/var/www/cyrlo-ride-api/app/backend/scripts/backup-postgres.sh
WRAPPER=/usr/local/sbin/cyrlo-ride-backup.sh
CRON_FILE=/etc/cron.d/cyrlo-ride-backup

echo "== prechecks =="
command -v pg_dump >/dev/null
test -f "$SCRIPT_SRC"
test -f /etc/cyrlo-ride/ride.env

# Resolve DATABASE_URL without printing it.
# shellcheck disable=SC1091
set -a
. /etc/cyrlo-ride/ride.env
set +a
: "${DATABASE_URL:?DATABASE_URL missing in ride.env}"

# Confirm DB name is staging app DB, not legacy.
python3 - <<'PY'
import os, urllib.parse
url = os.environ["DATABASE_URL"]
path = urllib.parse.urlparse(url).path.lstrip("/")
db = path.split("?")[0]
print("database_name", db)
if db in ("cyrlo_ride",):
    raise SystemExit("Refusing to back up legacy database name cyrlo_ride")
if not db:
    raise SystemExit("Could not parse database name from DATABASE_URL")
PY

mkdir -p "$BACKUP_DIR"
chown root:root "$BACKUP_DIR"
chmod 750 "$BACKUP_DIR"

cat >"$WRAPPER" <<EOF
#!/usr/bin/env bash
set -euo pipefail
set -a
. /etc/cyrlo-ride/ride.env
set +a
export BACKUP_DIR=$BACKUP_DIR
export RETENTION_DAYS=14
exec bash $SCRIPT_SRC
EOF
chmod 750 "$WRAPPER"

# Daily 02:15 UTC
cat >"$CRON_FILE" <<EOF
SHELL=/bin/bash
PATH=/usr/local/sbin:/usr/local/bin:/usr/sbin:/usr/bin:/sbin:/bin
15 2 * * * root $WRAPPER >> /var/log/cyrlo-ride-backup.log 2>&1
EOF
chmod 644 "$CRON_FILE"

echo "== running first backup now =="
"$WRAPPER"
ls -lh "$BACKUP_DIR" | tail -n 5

LATEST="$(ls -1t "$BACKUP_DIR"/cyrlo_ride_*.dump | head -n 1)"
echo "latest_dump=$LATEST"

echo "== restore drill into temporary DB =="
# Create a throwaway restore target, restore, verify, drop.
DRILL_DB="cyrlo_ride_restore_drill"
sudo -u postgres psql -v ON_ERROR_STOP=1 <<SQL
SELECT pg_terminate_backend(pid)
FROM pg_stat_activity
WHERE datname = '$DRILL_DB' AND pid <> pg_backend_pid();
DROP DATABASE IF EXISTS $DRILL_DB;
CREATE DATABASE $DRILL_DB OWNER CURRENT_USER;
SQL

# Build a restore URL from DATABASE_URL by replacing the DB name.
export DRILL_DB
RESTORE_URL="$(python3 - <<'PY'
import os, urllib.parse
u = urllib.parse.urlparse(os.environ["DATABASE_URL"])
path = "/" + os.environ["DRILL_DB"]
print(urllib.parse.urlunparse((u.scheme, u.netloc, path, "", u.query, "")))
PY
)"

pg_restore --clean --if-exists --no-owner --dbname="$RESTORE_URL" "$LATEST"
TABLES="$(sudo -u postgres psql -d "$DRILL_DB" -Atc "SELECT count(*) FROM information_schema.tables WHERE table_schema='public';")"
echo "restore_drill_public_tables=$TABLES"
if [ "$TABLES" -lt 1 ]; then
  echo "Restore drill failed: no public tables"
  exit 1
fi

sudo -u postgres psql -v ON_ERROR_STOP=1 -c "DROP DATABASE $DRILL_DB;"
echo "ITEM7_PASS true"
