#!/bin/bash
set -euo pipefail
cd /var/www/cyrlo-ride-api/app
echo "deploy_commit=$(git rev-parse HEAD)"

# Build as root (matches prior deploy), then harden ownership for the service user.
export npm_config_cache=/root/.npm
cd /var/www/cyrlo-ride-api/app/backend
rm -rf node_modules
npm ci
npx prisma generate
npm run build
test -f dist/server.js

chown -R root:cyrlo-ride /var/www/cyrlo-ride-api/app
chmod -R g+rX /var/www/cyrlo-ride-api/app
# Ensure service can read built artifacts and node_modules
find /var/www/cyrlo-ride-api/app/backend/dist -type d -exec chmod 750 {} \;
find /var/www/cyrlo-ride-api/app/backend/dist -type f -exec chmod 640 {} \;
find /var/www/cyrlo-ride-api/app/backend/node_modules -type d -exec chmod 750 {} \; 2>/dev/null || true

systemctl restart cyrlo-ride-api.service
sleep 3
systemctl is-active cyrlo-ride-api.service
systemctl is-active cyrlo-maps-api.service
systemctl --no-pager --full status cyrlo-ride-api.service | sed -n '1,40p'
curl -sS -o /tmp/ride_ready_after.json -w "ready=%{http_code}\n" https://cyrloride.eqostack.com/api/v1/health/ready
python3 - <<'PY'
import json
from pathlib import Path
d=json.loads(Path("/tmp/ride_ready_after.json").read_text())
print("maps=", d.get("data",{}).get("maps"))
print("database=", d.get("data",{}).get("database"))
PY
