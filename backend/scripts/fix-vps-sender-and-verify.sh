#!/usr/bin/env bash
set -euo pipefail

python3 - <<'PY'
from pathlib import Path
p = Path('/etc/cyrlo-ride/providers.env')
lines = []
for line in p.read_text().splitlines(True):
    if line.startswith('VYNFY_SENDER_ID=') and not line.startswith('VYNFY_SENDER_ID="'):
        value = line.split('=', 1)[1].strip()
        lines.append(f'VYNFY_SENDER_ID="{value}"\n')
    else:
        lines.append(line)
p.write_text(''.join(lines))
for line in p.read_text().splitlines():
    if line.startswith('VYNFY_SENDER_ID='):
        print(repr(line))
PY

cd /var/www/cyrlo-ride-api/app/backend
set -a
# shellcheck disable=SC1091
. /etc/cyrlo-ride/ride.env
# shellcheck disable=SC1091
. /etc/cyrlo-ride/providers.env
set +a

echo "STORAGE_PROVIDER=${STORAGE_PROVIDER}"
echo "ZONE=${BUNNY_STORAGE_ZONE_NAME}"
echo "HOST=${BUNNY_STORAGE_HOSTNAME}"
echo "CDN=${BUNNY_CDN_BASE_URL}"

systemctl restart cyrlo-ride-api
sleep 2
systemctl is-active cyrlo-ride-api
curl -sS http://127.0.0.1:3020/api/v1/health
echo
curl -sS http://127.0.0.1:3020/api/v1/health/ready
echo

BUNNY_LIVE_VERIFY=1 npx --yes tsx /var/www/cyrlo-ride-api/app/backend/scripts/verify-bunny-storage.ts
