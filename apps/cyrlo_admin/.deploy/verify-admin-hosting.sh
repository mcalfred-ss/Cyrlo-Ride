#!/usr/bin/env bash
set -euo pipefail

echo "=== homepage ==="
curl -sS -o /tmp/admin_index.html -w 'home:%{http_code} ssl=%{ssl_verify_result}\n' https://cyrlorideadmin.eqostack.com/
head -c 180 /tmp/admin_index.html; echo

JS=$(grep -oE '/assets/index-[^"]+\.js' /tmp/admin_index.html | head -1)
CSS=$(grep -oE '/assets/index-[^"]+\.css' /tmp/admin_index.html | head -1)
echo "js=$JS"
echo "css=$CSS"
curl -sS -o /dev/null -w 'js:%{http_code}\n' "https://cyrlorideadmin.eqostack.com${JS}"
curl -sS -o /dev/null -w 'css:%{http_code}\n' "https://cyrlorideadmin.eqostack.com${CSS}"

echo "=== spa routes ==="
curl -sS -o /dev/null -w 'overview:%{http_code}\n' https://cyrlorideadmin.eqostack.com/overview
curl -sS -o /dev/null -w 'riders:%{http_code}\n' https://cyrlorideadmin.eqostack.com/riders
curl -sS -o /dev/null -w 'nested:%{http_code}\n' https://cyrlorideadmin.eqostack.com/riders/aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa
curl -sS -o /dev/null -w 'applications:%{http_code}\n' https://cyrlorideadmin.eqostack.com/applications

echo "=== api base in bundle ==="
curl -sS "https://cyrlorideadmin.eqostack.com${JS}" | grep -o 'https://cyrloride\.eqostack\.com/api/v1' | head -1
if curl -sS "https://cyrlorideadmin.eqostack.com${JS}" | grep -q 'localhost:3000'; then
  echo 'FAIL: localhost API found in bundle'
  exit 1
fi
echo 'NO_LOCALHOST_IN_BUNDLE'

echo "=== CORS ==="
curl -sS -D- -o /dev/null -X OPTIONS https://cyrloride.eqostack.com/api/v1/admin/auth/otp/request \
  -H 'Origin: https://cyrlorideadmin.eqostack.com' \
  -H 'Access-Control-Request-Method: POST' \
  -H 'Access-Control-Request-Headers: content-type' \
  | tr -d '\r' | grep -iE 'HTTP/|access-control-'

echo "=== coexistence ==="
curl -sS https://cyrloride.eqostack.com/api/v1/health; echo
curl -sS -o /dev/null -w 'ready:%{http_code}\n' https://cyrloride.eqostack.com/api/v1/health/ready
curl -sS -o /dev/null -w 'maps:%{http_code}\n' https://api.cyrlomap.eqostack.com/
curl -sS -o /dev/null -w 'eqostack:%{http_code}\n' https://eqostack.com/
systemctl is-active cyrlo-ride-api.service
systemctl is-active cyrlo-maps-api.service
echo OK
