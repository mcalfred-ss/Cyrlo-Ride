#!/bin/bash
# Read-only staging inspection for audit. No restarts, no writes except temp curl files.
set -euo pipefail
cd /var/www/cyrlo-ride-api/app
echo "deploy_commit=$(git rev-parse HEAD)"
echo "deploy_short=$(git rev-parse --short HEAD)"
git status -sb
systemctl is-active cyrlo-ride-api.service
systemctl is-active cyrlo-maps-api.service
curl -sS -o /tmp/rh.json -w "ride_health=%{http_code}\n" https://cyrloride.eqostack.com/api/v1/health
curl -sS -o /tmp/rr.json -w "ride_ready=%{http_code}\n" https://cyrloride.eqostack.com/api/v1/health/ready
curl -sS -o /tmp/mh.json -w "maps_health=%{http_code}\n" https://api.cyrlomap.eqostack.com/health
curl -sS -o /tmp/mr.json -w "maps_ready=%{http_code}\n" https://api.cyrlomap.eqostack.com/ready
python3 <<'PY'
import json
from pathlib import Path
ready = json.loads(Path("/tmp/rr.json").read_text())
data = ready.get("data", {})
print("database=", data.get("database"))
print("maps=", data.get("maps"))
print("sms=", {k: data.get("sms", {}).get(k) for k in ("configured", "adapter", "ready")})
print("push=", {k: data.get("push", {}).get(k) for k in ("configured", "adapter", "ready")})
PY
python3 <<'PY'
from pathlib import Path
keys = []
for p in ("/etc/cyrlo-ride/ride.env", "/etc/cyrlo-ride/providers.env"):
    for line in Path(p).read_text().splitlines():
        if line and not line.startswith("#") and "=" in line and line[0].isupper():
            keys.append(line.split("=", 1)[0])
print("env_key_names=" + ",".join(sorted(set(keys))))
for needle in ("PAYSTACK_SECRET_KEY", "VYNFY_API_KEY", "CYRLO_MAPS_API_KEY", "CYRLO_MAPS_BASE_URL", "MAPBOX_ACCESS_TOKEN", "RIDER_OFFER_RESPONSE_TIMEOUT_SECONDS", "SMS_PROVIDER", "PUSH_PROVIDER", "FCM_PROJECT_ID"):
    present = any(k == needle for k in keys)
    print(f"has_{needle}={present}")
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
  'applied_migrations', (SELECT count(*) FROM _prisma_migrations WHERE finished_at IS NOT NULL),
  'countries', (SELECT count(*) FROM geo_countries),
  'regions', (SELECT count(*) FROM geo_regions),
  'districts', (SELECT count(*) FROM geo_districts),
  'communities', (SELECT count(*) FROM geo_communities),
  'zones_total', (SELECT count(*) FROM service_zones),
  'zones_active', (SELECT count(*) FROM service_zones WHERE is_active OR status = 'ACTIVE')
);"
psql "$DBURL" -At -c "SELECT status::text || '=' || count(*)::text FROM service_zones GROUP BY status ORDER BY status;"
psql "$DBURL" -At -c "SELECT coalesce(name,'') || '|' || status::text || '|' || is_active::text || '|' || boundary_verification_status::text || '|' || coalesce(community_id::text,'') FROM service_zones WHERE lower(name)='kokobin' LIMIT 1;"
psql "$DBURL" -At -c "SELECT c.name || '|' || c.slug || '|' || c.verification_status::text || '|boundary=' || (c.boundary IS NOT NULL)::text || '|center=' || (c.center_latitude IS NOT NULL)::text || '|' || d.name || '|' || r.name || '|' || co.name FROM geo_communities c JOIN geo_districts d ON d.id=c.district_id JOIN geo_regions r ON r.id=d.region_id JOIN geo_countries co ON co.id=r.country_id;"
echo "migration_dirs=$(ls /var/www/cyrlo-ride-api/app/backend/prisma/migrations | wc -l)"
