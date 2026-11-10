# Cyrlo Ride database backups and restore

**RPO target:** lose at most about **1 hour** of app data after a total crash (hourly dumps + Bunny off-site).  
**Source of truth (script):** repo [`backend/scripts/backup-postgres.sh`](../../backend/scripts/backup-postgres.sh) → VPS `/var/www/cyrlo-ride-api/app/backend/scripts/backup-postgres.sh`.

This is **not** “backup on every app update.” App writes go to the live DB; backups are **scheduled point-in-time dumps**. That is normal.

## What runs on the VPS

| Mode | Cron (VPS root) | Local file pattern | Local retention | Bunny path |
|------|-----------------|--------------------|-----------------|------------|
| Hourly | `5 * * * * … cyrlo-ride-backup.sh hourly` | `cyrlo_ride-hourly-YYYY-mm-dd_HHMMSS.dump` | ~48 hours | `db-backups/` |
| Daily | `15 3 * * * … cyrlo-ride-backup.sh daily` | `cyrlo_ride-daily-YYYY-mm-dd_HHMMSS.dump` | 30 days | `db-backups/` |

- **Local directory:** `/var/backups/cyrlo-ride/` (`750` root:postgres so `pg_restore` can read dumps in place)
- **Log:** `/var/backups/cyrlo-ride/backup.log` (cron also appends to `/var/log/cyrlo-ride-backup.log`)
- **Wrapper:** `/usr/local/sbin/cyrlo-ride-backup.sh` (sources `/etc/cyrlo-ride/ride.env` + optional `providers.env`)
- **Cron file:** `/etc/cron.d/cyrlo-ride-backup`
- **Off-site:** Bunny Storage zone from Ride env (`BUNNY_STORAGE_ZONE_NAME`, `BUNNY_STORAGE_ACCESS_KEY`, `BUNNY_STORAGE_HOSTNAME`) under prefix `db-backups/`
- Legacy local files `cyrlo_ride_YYYYMMDDTHHMMSSZ.dump` (previous naming) are cleaned on the daily job after 30 days

If Bunny credentials are configured, upload failure exits non-zero (cron will surface a failure). Set `BUNNY_REQUIRED=1` to also fail when credentials are missing.

### Install / reinstall on the VPS

```bash
sudo bash /var/www/cyrlo-ride-api/app/backend/scripts/setup-staging-backup.sh
```

Manual run:

```bash
/usr/local/sbin/cyrlo-ride-backup.sh hourly
/usr/local/sbin/cyrlo-ride-backup.sh daily
# or:
bash /var/www/cyrlo-ride-api/app/backend/scripts/backup-postgres.sh daily
```

## Pre-migration / risky deploy habit

Before a risky deploy, Prisma migrate, or large schema change on the VPS:

```bash
/usr/local/sbin/cyrlo-ride-backup.sh daily
# confirm: tail /var/backups/cyrlo-ride/backup.log  → Bunny upload OK
```

Keep that dump until you are confident the migration is healthy.

## Restore runbook (incident)

**Downtime warning:** restoring **over** the live app database requires stopping the API and will replace live data with the dump’s point in time. Prefer restore-to-side DB first when validating.

**Note:** Dumps do not include encryption key material. Identity ciphertext is useless without `IDENTITY_ENCRYPTION_KEY`.

### A. List dumps

```bash
ls -lah /var/backups/cyrlo-ride/*.dump | tail -30
# Or download from Bunny Storage → zone → db-backups/
```

### B. Restore into a throwaway DB (safe drill / inspect)

```bash
DUMP=/var/backups/cyrlo-ride/cyrlo_ride-hourly-YYYY-mm-dd_HHMMSS.dump   # pick one
sudo -u postgres dropdb --if-exists cyrlo_ride_restore_drill
sudo -u postgres createdb cyrlo_ride_restore_drill
sudo -u postgres pg_restore --dbname=cyrlo_ride_restore_drill --no-owner --role=postgres "$DUMP"
sudo -u postgres psql -d cyrlo_ride_restore_drill -c '\dt'
sudo -u postgres dropdb cyrlo_ride_restore_drill
```

### C. Replace live DB (production / staging incident — plan downtime)

1. Announce maintenance; stop writers:

```bash
sudo systemctl stop cyrlo-ride-api
```

2. Dump current state one last time if the disk is still healthy:

```bash
/usr/local/sbin/cyrlo-ride-backup.sh daily
```

3. Recreate and restore (example — adjust dump path and DB name from `DATABASE_URL`):

```bash
DUMP=/var/backups/cyrlo-ride/cyrlo_ride-hourly-YYYY-mm-dd_HHMMSS.dump
# Example staging DB name — confirm from /etc/cyrlo-ride/ride.env
sudo -u postgres dropdb --if-exists cyrlo_ride_app
sudo -u postgres createdb cyrlo_ride_app
sudo -u postgres pg_restore --dbname=cyrlo_ride_app --no-owner --role=postgres "$DUMP"
```

4. Restart API and verify health:

```bash
sudo systemctl start cyrlo-ride-api
curl -sS https://cyrloride.eqostack.com/api/v1/health/ready
```

5. **Payments:** Paystack remains source of truth for charges. After a restore, reconcile any bookings/payments that happened after the dump timestamp (DB restore does not undo card charges).

### D. From Bunny only (droplet dead)

1. Provision a new droplet (or restore a full-server snapshot first for OS/app layout).
2. Install Postgres, recreate role/DB as in normal deploy docs.
3. Download the newest suitable object from Bunny `db-backups/`.
4. `pg_restore` as above, then bring API + nginx back.

Target: follow this runbook in under **30 minutes** once the dump file is in hand.

## Restore drill log

| Date (UTC) | Dump used | Result |
|------------|-----------|--------|
| 2026-11-09 | first staging dump → `cyrlo_ride_restore_drill` | OK (41 public tables; throwaway DB dropped) |

Re-run the throwaway restore at least quarterly and append a row. `setup-staging-backup.sh` runs a drill on install.

## What this does **not** cover

- Per-booking / per-payment transaction exports
- Bunny **rider documents** (already on Bunny; this script backs up Postgres only)
- Minute-level PITR (WAL / managed Postgres) — revisit when volume justifies it
- Whole-droplet snapshots (enable separately in the VPS provider UI)

## Success checklist

- [ ] Hourly + daily cron installed on VPS (`/etc/cron.d/cyrlo-ride-backup`)
- [ ] Script mirrored in repo under `backend/scripts/backup-postgres.sh`
- [ ] Bunny upload verified (`Bunny upload OK` in `/var/backups/cyrlo-ride/backup.log`)
- [ ] Restore steps documented; throwaway restore drill recorded
