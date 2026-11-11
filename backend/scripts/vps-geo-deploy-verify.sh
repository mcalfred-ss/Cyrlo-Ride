#!/bin/bash
set -euo pipefail

APP_ROOT=/var/www/cyrlo-ride-api/app
BACKEND=$APP_ROOT/backend

echo "=== PREFLIGHT ==="
systemctl is-active cyrlo-ride-api.service
systemctl is-active cyrlo-maps-api.service
curl -sS -o /tmp/maps_health.json -w "maps_health=%{http_code}\n" https://api.cyrlomap.eqostack.com/health

echo "=== DEPLOY ==="
bash "$APP_ROOT/ops/deploy/deploy-staging.sh" --ref main

echo "=== SEED PILOT HIERARCHY (no activation) ==="
cd "$BACKEND"
# Load ride.env for DATABASE_URL without printing secrets
set -a
# shellcheck disable=SC1091
source /etc/cyrlo-ride/ride.env
set +a
# Ensure NODE can resolve tsx; use built path via npx under env -u NODE_ENV
sudo -u cyrlo-ride -H env -u NODE_ENV HOME=/var/www/cyrlo-ride-api \
  DATABASE_URL="$DATABASE_URL" \
  bash -lc 'cd /var/www/cyrlo-ride-api/app/backend && npx tsx scripts/seed-ghana-pilot-hierarchy.ts'

echo "=== VERIFY ==="
curl -sS -o /tmp/ride_health.json -w "ride_health=%{http_code}\n" https://cyrloride.eqostack.com/api/v1/health
curl -sS -o /tmp/ride_ready.json -w "ride_ready=%{http_code}\n" https://cyrloride.eqostack.com/api/v1/health/ready
python3 <<'PY'
import json
from pathlib import Path
ready = json.loads(Path("/tmp/ride_ready.json").read_text())
data = ready.get("data", {})
print("database=", data.get("database"))
print("maps=", data.get("maps"))
print("sms_ready=", data.get("sms", {}).get("ready"))
PY

# Unauthenticated admin geo should be 401
curl -sS -o /tmp/geo_unauth.json -w "geo_unauth=%{http_code}\n" https://cyrloride.eqostack.com/api/v1/admin/geo/countries
curl -sS -o /tmp/zones_unauth.json -w "zones_unauth=%{http_code}\n" https://cyrloride.eqostack.com/api/v1/admin/service-zones

# Confirm seeded hierarchy exists without activating
python3 <<'PY'
import os, json
from pathlib import Path
# Parse DATABASE_URL from ride.env without printing it
env = {}
for line in Path("/etc/cyrlo-ride/ride.env").read_text().splitlines():
    if not line or line.startswith("#") or "=" not in line:
        continue
    k, v = line.split("=", 1)
    env[k] = v.strip().strip("'").strip('"')
os.environ["DATABASE_URL"] = env["DATABASE_URL"]
import subprocess
sql = """
SELECT json_build_object(
  'countries', (SELECT count(*) FROM geo_countries),
  'regions', (SELECT count(*) FROM geo_regions),
  'districts', (SELECT count(*) FROM geo_districts),
  'communities', (SELECT count(*) FROM geo_communities),
  'active_zones', (SELECT count(*) FROM service_zones WHERE is_active = true OR status = 'ACTIVE'),
  'kokobin', (
    SELECT json_build_object('status', status, 'is_active', is_active, 'boundary_verification_status', boundary_verification_status)
    FROM service_zones WHERE lower(name) = 'kokobin' LIMIT 1
  )
);
"""
# Use psql via DATABASE_URL without echoing URL
out = subprocess.check_output(["psql", env["DATABASE_URL"].split("?")[0], "-At", "-c", sql], text=True)
print("seed_summary=", out.strip())
PY

systemctl is-active cyrlo-ride-api.service
systemctl is-active cyrlo-maps-api.service
cd "$APP_ROOT" && echo "deploy_commit=$(git rev-parse HEAD)"
