#!/usr/bin/env bash
# Install / verify Cyrlo Ride staging Postgres backups on the VPS
# (local dumps + Bunny off-site under db-backups/).
set -euo pipefail

BACKUP_DIR=/var/backups/cyrlo-ride
SCRIPT_SRC=/var/www/cyrlo-ride-api/app/backend/scripts/backup-postgres.sh
WRAPPER_SRC=/var/www/cyrlo-ride-api/app/backend/scripts/cyrlo-ride-backup.wrapper.sh
WRAPPER=/usr/local/sbin/cyrlo-ride-backup.sh
CRON_FILE=/etc/cron.d/cyrlo-ride-backup
LOG=/var/log/cyrlo-ride-backup.log

echo "== prechecks =="
command -v pg_dump >/dev/null
command -v curl >/dev/null
test -f "$SCRIPT_SRC"
test -f "$WRAPPER_SRC"
test -f /etc/cyrlo-ride/ride.env

# Resolve DATABASE_URL without printing it.
# shellcheck disable=SC1091
set -a
. /etc/cyrlo-ride/ride.env
if [[ -f /etc/cyrlo-ride/providers.env ]]; then
  # shellcheck disable=SC1091
  . /etc/cyrlo-ride/providers.env
fi
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
chgrp postgres "$BACKUP_DIR" 2>/dev/null || true
chmod 750 "$BACKUP_DIR"

install -m 750 "$WRAPPER_SRC" "$WRAPPER"

# Hourly :05 UTC + daily 03:15 UTC (same cadence as Cirlo Food)
cat >"$CRON_FILE" <<EOF
SHELL=/bin/bash
PATH=/usr/local/sbin:/usr/local/bin:/usr/sbin:/usr/bin:/sbin:/bin
5 * * * * root $WRAPPER hourly >> $LOG 2>&1
15 3 * * * root $WRAPPER daily >> $LOG 2>&1
EOF
chmod 644 "$CRON_FILE"

echo "== running first hourly + daily backups now =="
"$WRAPPER" hourly
"$WRAPPER" daily
ls -lh "$BACKUP_DIR" | tail -n 10
echo "--- backup.log (tail) ---"
tail -n 40 "$BACKUP_DIR/backup.log" || true

LATEST="$(ls -1t "$BACKUP_DIR"/cyrlo_ride-*.dump 2>/dev/null | head -n 1 || true)"
if [[ -z "$LATEST" ]]; then
  # Fall back to legacy naming if only old dumps exist
  LATEST="$(ls -1t "$BACKUP_DIR"/cyrlo_ride_*.dump 2>/dev/null | head -n 1 || true)"
fi
: "${LATEST:?No dump files found in $BACKUP_DIR}"
echo "latest_dump=$LATEST"

if grep -q "Bunny upload OK" "$BACKUP_DIR/backup.log"; then
  echo "bunny_upload=ok"
elif grep -q "Bunny upload skipped" "$BACKUP_DIR/backup.log"; then
  echo "bunny_upload=skipped (set BUNNY_STORAGE_* in ride.env or providers.env)"
else
  echo "bunny_upload=unknown — check $BACKUP_DIR/backup.log"
fi

echo "== restore drill into temporary DB =="
# Create a throwaway restore target, restore, verify, drop.
DRILL_DB="cyrlo_ride_restore_drill"
sudo -u postgres psql -v ON_ERROR_STOP=1 -c "SELECT pg_terminate_backend(pid) FROM pg_stat_activity WHERE datname = '$DRILL_DB' AND pid <> pg_backend_pid();" >/dev/null || true
sudo -u postgres dropdb --if-exists "$DRILL_DB"
sudo -u postgres createdb "$DRILL_DB"
sudo -u postgres pg_restore --dbname="$DRILL_DB" --no-owner --role=postgres "$LATEST"
TABLES="$(sudo -u postgres psql -d "$DRILL_DB" -Atc "SELECT count(*) FROM information_schema.tables WHERE table_schema='public';")"
echo "restore_drill_public_tables=$TABLES"
if [ "$TABLES" -lt 1 ]; then
  echo "Restore drill failed: no public tables"
  exit 1
fi

sudo -u postgres dropdb "$DRILL_DB"
echo "ITEM7_PASS true"
echo "Installed cron: hourly :05 UTC + daily 03:15 UTC → $WRAPPER"
