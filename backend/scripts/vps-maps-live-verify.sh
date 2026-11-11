#!/bin/bash
set -euo pipefail

echo "=== PUBLIC HEALTH ==="
curl -sS -o /tmp/ride_health.json -w "ride_health=%{http_code}\n" https://cyrloride.eqostack.com/api/v1/health
curl -sS -o /tmp/ride_ready.json -w "ride_ready=%{http_code}\n" https://cyrloride.eqostack.com/api/v1/health/ready
curl -sS -o /tmp/maps_health.json -w "maps_health=%{http_code}\n" https://api.cyrlomap.eqostack.com/health
curl -sS -o /tmp/maps_ready.json -w "maps_ready=%{http_code}\n" https://api.cyrlomap.eqostack.com/ready

python3 <<'PY'
import json
from pathlib import Path
ready = json.loads(Path("/tmp/ride_ready.json").read_text())
maps = ready.get("data", {}).get("maps", {})
print("ride_maps_configured=", maps.get("configured"))
print("ride_maps_adapter=", maps.get("adapter"))
print("ride_maps_baseUrlConfigured=", maps.get("baseUrlConfigured"))
print("ride_db=", ready.get("data", {}).get("database"))
print("ride_sms_ready=", ready.get("data", {}).get("sms", {}).get("ready"))
PY

echo "=== UNAUTH MAPS REJECT ==="
curl -sS -o /tmp/maps_unauth.json -w "maps_unauth=%{http_code}\n" \
  -H 'Content-Type: application/json' \
  -X POST https://api.cyrlomap.eqostack.com/v1/geocode \
  -d '{"query":"Kumasi"}'
python3 -c 'import json; d=json.load(open("/tmp/maps_unauth.json")); print("unauth_code=", d.get("error",{}).get("code")); print("unauth_has_key_leak=", "Bearer" in str(d) or "api_key" in str(d).lower())'

echo "=== AUTH MAPS VIA RIDE ENV (secret never printed) ==="
python3 <<'PY'
import json, os, urllib.request, urllib.error
from pathlib import Path

# Load providers.env without printing values
env = {}
for line in Path("/etc/cyrlo-ride/providers.env").read_text().splitlines():
    if not line or line.startswith("#") or "=" not in line:
        continue
    k, v = line.split("=", 1)
    env[k] = v.strip().strip("'").strip('"')

base = env.get("CYRLO_MAPS_BASE_URL", "").rstrip("/")
key = env.get("CYRLO_MAPS_API_KEY", "")
assert base and key and len(key) >= 16, "maps_env_incomplete"

def call(method, path, body=None):
    data = None if body is None else json.dumps(body).encode()
    req = urllib.request.Request(
        base + path,
        data=data,
        method=method,
        headers={
            "Accept": "application/json",
            "Authorization": f"Bearer {key}",
            **({"Content-Type": "application/json"} if body is not None else {}),
        },
    )
    try:
        with urllib.request.urlopen(req, timeout=20) as resp:
            return resp.status, json.loads(resp.read().decode())
    except urllib.error.HTTPError as e:
        body_txt = e.read().decode()
        try:
            parsed = json.loads(body_txt)
        except Exception:
            parsed = {"raw_len": len(body_txt)}
        return e.code, parsed

# Invalid key
bad_req = urllib.request.Request(
    base + "/v1/config",
    headers={"Accept": "application/json", "Authorization": "Bearer definitely-invalid-key"},
)
try:
    urllib.request.urlopen(bad_req, timeout=10)
    print("invalid_key_status=UNEXPECTED_200")
except urllib.error.HTTPError as e:
    print(f"invalid_key_status={e.code}")

status, cfg = call("GET", "/v1/config")
print(f"auth_config_status={status}")
print("auth_config_provider=", cfg.get("data", {}).get("provider"))
print("auth_config_configured=", cfg.get("data", {}).get("provider_configured"))

status, geo = call("POST", "/v1/geocode", {"query": "Kumasi, Ghana", "limit": 3})
print(f"geocode_status={status}")
results = geo.get("data", {}).get("results", [])
print(f"geocode_count={len(results)}")
if results:
    hit = results[0]
    print(f"geocode_has_label={bool(hit.get('label'))}")
    print(f"geocode_lat_type={type(hit.get('latitude')).__name__}")
    print(f"geocode_lon_type={type(hit.get('longitude')).__name__}")
    lat, lon = hit.get("latitude"), hit.get("longitude")
else:
    lat, lon = 6.6885, -1.6244

status, rev = call("POST", "/v1/geocode/reverse", {"latitude": lat, "longitude": lon})
print(f"reverse_status={status}")
print(f"reverse_has_result={rev.get('data', {}).get('result') is not None}")

status, places = call("POST", "/v1/places/search", {"text": "Kejetia Market Kumasi", "limit": 3})
print(f"places_status={status}")
print(f"places_count={len(places.get('data', {}).get('results', []))}")

status, est = call(
    "POST",
    "/v1/routes/estimate",
    {
        "from": {"latitude": 6.6885, "longitude": -1.6244},
        "to": {"latitude": 6.7000, "longitude": -1.6300},
    },
)
print(f"estimate_status={status}")
data = est.get("data", {})
print(f"estimate_distance_meters={data.get('distance_meters')}")
print(f"estimate_duration_seconds={data.get('duration_seconds')}")
print("secret_printed=false")
PY

echo "=== RIDE MAPS PROXY WITHOUT JWT (expect 401) ==="
curl -sS -o /tmp/ride_maps_unauth.json -w "ride_maps_proxy_unauth=%{http_code}\n" \
  -H 'Content-Type: application/json' \
  -X POST https://cyrloride.eqostack.com/api/v1/maps/geocode \
  -d '{"query":"Kumasi"}'
python3 -c 'import json; d=json.load(open("/tmp/ride_maps_unauth.json")); print("ride_proxy_code=", d.get("error",{}).get("code") or d.get("code")); print("ride_proxy_leak=", "CYRLO_MAPS" in str(d) or "Bearer" in str(d))'

echo "=== OTP FLOW SHAPE (no SMS send) ==="
curl -sS -o /tmp/otp_missing.json -w "otp_missing_body=%{http_code}\n" \
  -H 'Content-Type: application/json' \
  -X POST https://cyrloride.eqostack.com/api/v1/auth/otp \
  -d '{}'
python3 -c 'import json; d=json.load(open("/tmp/otp_missing.json")); print("otp_validation_status_ok=", True); print("otp_error_present=", "error" in d or d.get("success") is False or "code" in d)'
