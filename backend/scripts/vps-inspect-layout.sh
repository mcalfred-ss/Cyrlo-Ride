#!/bin/bash
set -euo pipefail
echo "=== APP LAYOUT ==="
ls -la /var/www/cyrlo-ride-api/app | head -40
if [ -d /var/www/cyrlo-ride-api/app/backend ]; then
  echo "has_backend_subdir=yes"
  ls /var/www/cyrlo-ride-api/app/backend | head -20
else
  echo "has_backend_subdir=no"
fi
echo "=== SYSTEMD ==="
systemctl cat cyrlo-ride-api.service
echo "=== OPENAPI SECURITY ==="
python3 <<'PY'
from pathlib import Path
import re
text = Path("/opt/cyrlo-maps-api/src/openapi/openapi.yaml").read_text(encoding="utf-8")
m = re.search(r"(?ms)^  securitySchemes:\n((?:    .+\n)+)", text)
print(m.group(0) if m else "securitySchemes_missing")
m2 = re.search(r"(?ms)^security:\n((?:  .+\n)+)", text)
print(m2.group(0) if m2 else "global_security_missing")
# Sample one secured path
m3 = re.search(r"(?ms)^  /v1/geocode:\n((?:    .+\n)+)", text)
block = m3.group(1) if m3 else ""
for line in block.splitlines():
    if "security" in line or "bearer" in line.lower() or "apiKey" in line or "Authorization" in line:
        print("geocode_line:", line)
PY
