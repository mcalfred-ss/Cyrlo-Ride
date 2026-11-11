#!/bin/bash
set -euo pipefail

echo "=== SYNC MAPS KEY INTO providers.env ==="
python3 /tmp/sync-maps-api-key.py
python3 <<'PY'
from pathlib import Path
import pwd, grp
keys=[]
text = Path("/etc/cyrlo-ride/providers.env").read_text(encoding="utf-8")
for line in text.splitlines():
    if line and not line.startswith("#") and "=" in line and line[0].isupper():
        k, v = line.split("=", 1)
        keys.append(k)
        if k.startswith("CYRLO_MAPS_"):
            print(f"{k}=set value_chars={len(v.strip(chr(39)))}")
print("all_keys=" + ",".join(sorted(keys)))
stat = Path("/etc/cyrlo-ride/providers.env").stat()
print(
    "owner=%s:%s mode=%o"
    % (
        pwd.getpwuid(stat.st_uid).pw_name,
        grp.getgrgid(stat.st_gid).gr_name,
        stat.st_mode & 0o777,
    )
)
for forbidden in ("MAPBOX", "MAPBOX_ACCESS_TOKEN"):
    print(f"providers_contains_{forbidden}={forbidden in text}")
PY

echo "=== DEPLOY RIDE CODE ==="
cd /var/www/cyrlo-ride-api/app
git fetch origin main
if ! git diff --quiet || ! git diff --cached --quiet; then
  echo "dirty_tree_abort"
  git status
  exit 2
fi
git checkout -B main origin/main
echo "deploy_commit=$(git rev-parse HEAD)"
git log -1 --oneline

echo "=== BUILD BACKEND ==="
cd /var/www/cyrlo-ride-api/app/backend
# Ensure build tools available; production env is loaded only by systemd
sudo -u cyrlo-ride -H env -u NODE_ENV bash -lc 'cd /var/www/cyrlo-ride-api/app/backend && npm ci && npx prisma generate && npm run build'

echo "=== RESTART RIDE ONLY ==="
systemctl restart cyrlo-ride-api.service
sleep 3
systemctl is-active cyrlo-ride-api.service
systemctl is-active cyrlo-maps-api.service
systemctl --no-pager --full status cyrlo-ride-api.service | sed -n '1,30p'
