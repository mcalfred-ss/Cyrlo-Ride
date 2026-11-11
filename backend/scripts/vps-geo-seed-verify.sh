#!/bin/bash
set -euo pipefail
cd /var/www/cyrlo-ride-api/app/backend
set -a
# shellcheck disable=SC1091
source /etc/cyrlo-ride/ride.env
# shellcheck disable=SC1091
source /etc/cyrlo-ride/providers.env
set +a

echo "=== SEED ==="
npx tsx scripts/seed-ghana-pilot-hierarchy.ts

echo "=== LIVE CHECKS ==="
curl -sS -o /tmp/ride_health.json -w "ride_health=%{http_code}\n" https://cyrloride.eqostack.com/api/v1/health
curl -sS -o /tmp/ride_ready.json -w "ride_ready=%{http_code}\n" https://cyrloride.eqostack.com/api/v1/health/ready
curl -sS -o /tmp/maps_health.json -w "maps_health=%{http_code}\n" https://api.cyrlomap.eqostack.com/health
curl -sS -o /tmp/geo_unauth.json -w "geo_unauth=%{http_code}\n" https://cyrloride.eqostack.com/api/v1/admin/geo/countries
curl -sS -o /tmp/zones_unauth.json -w "zones_unauth=%{http_code}\n" https://cyrloride.eqostack.com/api/v1/admin/service-zones

python3 <<'PY'
import json
from pathlib import Path
ready = json.loads(Path("/tmp/ride_ready.json").read_text())
print("database=", ready.get("data", {}).get("database"))
print("maps=", ready.get("data", {}).get("maps"))
geo = json.loads(Path("/tmp/geo_unauth.json").read_text())
print("geo_unauth_code=", geo.get("error", {}).get("code") or geo.get("code"))
PY

DBURL=$(python3 <<'PY'
from pathlib import Path
for line in Path("/etc/cyrlo-ride/ride.env").read_text().splitlines():
    if line.startswith("DATABASE_URL="):
        print(line.split("=", 1)[1].strip().strip("'").strip('"').split("?")[0])
        break
PY
)

psql "$DBURL" -At -c "SELECT json_build_object(
  'countries', (SELECT count(*) FROM geo_countries),
  'regions', (SELECT count(*) FROM geo_regions),
  'districts', (SELECT count(*) FROM geo_districts),
  'communities', (SELECT count(*) FROM geo_communities),
  'active_zones', (SELECT count(*) FROM service_zones WHERE is_active OR status = 'ACTIVE'),
  'kokobin', (
    SELECT json_build_object(
      'status', status,
      'is_active', is_active,
      'verified', boundary_verification_status
    )
    FROM service_zones WHERE lower(name) = 'kokobin' LIMIT 1
  )
);"

systemctl is-active cyrlo-ride-api.service
systemctl is-active cyrlo-maps-api.service
cd /var/www/cyrlo-ride-api/app
git rev-parse HEAD
