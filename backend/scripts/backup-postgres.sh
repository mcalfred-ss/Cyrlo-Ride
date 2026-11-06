#!/usr/bin/env bash
# Local PostgreSQL backup for the Cyrlo Ride VPS.
# Run from cron as a user that can reach PostgreSQL on the server itself.
# Do not expose PostgreSQL to the public internet.
set -euo pipefail

: "${DATABASE_URL:?DATABASE_URL is required}"

BACKUP_DIR="${BACKUP_DIR:-/var/backups/cyrlo-ride}"
RETENTION_DAYS="${RETENTION_DAYS:-14}"

mkdir -p "$BACKUP_DIR"
stamp="$(date -u +%Y%m%dT%H%M%SZ)"
pg_dump "$DATABASE_URL" --format=custom --file="$BACKUP_DIR/cyrlo_ride_${stamp}.dump"
find "$BACKUP_DIR" -type f -name 'cyrlo_ride_*.dump' -mtime +"$RETENTION_DAYS" -delete
