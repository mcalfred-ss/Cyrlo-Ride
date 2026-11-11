#!/bin/bash
set -euo pipefail
echo "=== MAPS HEALTH ==="
curl -sS -o /tmp/maps_health.json -w "health_http=%{http_code}\n" https://api.cyrlomap.eqostack.com/health
curl -sS -o /tmp/maps_ready.json -w "ready_http=%{http_code}\n" https://api.cyrlomap.eqostack.com/ready
python3 -c 'import json; [print(p, sorted(json.load(open(p)).keys())) for p in ("/tmp/maps_health.json","/tmp/maps_ready.json")]'
echo "=== FILES ==="
ls -la /root/cyrlo-maps-api-client.key /etc/cyrlo-ride/providers.env
stat -c '%U:%G %a %n' /etc/cyrlo-ride/providers.env /root/cyrlo-maps-api-client.key
systemctl is-active cyrlo-maps-api.service cyrlo-ride-api.service
echo "=== OPENAPI ==="
OA=$(find /opt/cyrlo-maps-api /var/www -name openapi.yaml 2>/dev/null | head -1 || true)
echo "openapi_path=${OA:-missing}"
if [ -n "${OA:-}" ]; then
  python3 - "$OA" <<'PY'
import re, sys
from pathlib import Path
text = Path(sys.argv[1]).read_text(encoding="utf-8")
print("has_securitySchemes", "securitySchemes" in text)
print("has_bearerAuth", "bearerAuth" in text or "Bearer" in text)
for path in [
    "/v1/geocode",
    "/v1/geocode/reverse",
    "/v1/places/search",
    "/v1/routes",
    "/v1/routes/estimate",
    "/v1/config",
    "/health",
    "/ready",
]:
    # crude method scan near path
    m = re.search(rf"(?m)^  {re.escape(path)}:\n((?:    .+\n)+)", text)
    if not m:
        print(path, "MISSING")
        continue
    methods = re.findall(r"(?m)^    (get|post|put|patch|delete):", m.group(1))
    print(path, ",".join(methods) if methods else "no-methods")
PY
fi
echo "=== RIDE APP ==="
cd /var/www/cyrlo-ride-api/app
git rev-parse HEAD
git status -sb
