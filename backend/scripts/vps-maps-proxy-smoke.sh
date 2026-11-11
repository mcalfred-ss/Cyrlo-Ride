#!/bin/bash
# Safe Maps proxy smoke via review OTP account (no SMS, no booking, no payment).
set -euo pipefail
BASE=https://cyrloride.eqostack.com/api/v1
PHONE=+233555010001
OTP=246810

curl -sS -o /tmp/otp.json -w "otp=%{http_code}\n" \
  -H 'Content-Type: application/json' \
  -X POST "$BASE/auth/otp" \
  -d "{\"phoneNumber\":\"$PHONE\"}"

curl -sS -o /tmp/verify.json -w "verify=%{http_code}\n" \
  -H 'Content-Type: application/json' \
  -X POST "$BASE/auth/otp/verify" \
  -d "{\"phoneNumber\":\"$PHONE\",\"code\":\"$OTP\",\"role\":\"PASSENGER\"}"

TOKEN=$(python3 <<'PY'
import json
from pathlib import Path
d=json.loads(Path("/tmp/verify.json").read_text())
data=d.get("data") or {}
tok = None
if isinstance(data, dict):
  toks = data.get("tokens") if isinstance(data.get("tokens"), dict) else data
  if isinstance(toks, dict):
    tok = toks.get("accessToken") or toks.get("access_token")
print(tok or "")
PY
)

if [ -z "$TOKEN" ]; then
  echo "token_missing"
  python3 <<'PY'
import json
from pathlib import Path
d=json.loads(Path("/tmp/otp.json").read_text())
print("otp_error=", (d.get("error") or d))
d=json.loads(Path("/tmp/verify.json").read_text())
print("verify_error=", (d.get("error") or d))
PY
  exit 1
fi
echo "token_acquired=yes"

auth_post() {
  local path="$1"; local body="$2"; local out="$3"
  curl -sS -o "$out" -w "%{http_code}" \
    -H "Authorization: Bearer $TOKEN" \
    -H 'Content-Type: application/json' \
    -X POST "$BASE$path" \
    -d "$body"
}

echo -n "geocode="; auth_post /maps/geocode '{"query":"Kumasi, Ghana","limit":3}' /tmp/maps_geocode.json; echo
echo -n "reverse="; auth_post /maps/geocode/reverse '{"latitude":6.6885,"longitude":-1.6244}' /tmp/maps_reverse.json; echo
echo -n "places="; auth_post /maps/places/search '{"text":"Kejetia Market","limit":3}' /tmp/maps_places.json; echo
echo -n "estimate="; auth_post /maps/routes/estimate '{"from":{"latitude":6.6885,"longitude":-1.6244},"to":{"latitude":6.7000,"longitude":-1.6300}}' /tmp/maps_estimate.json; echo
echo -n "routes="; auth_post /maps/routes '{"from":{"latitude":6.6885,"longitude":-1.6244},"to":{"latitude":6.7000,"longitude":-1.6300}}' /tmp/maps_routes.json; echo
echo -n "invalid_coords="; auth_post /maps/geocode/reverse '{"latitude":999,"longitude":0}' /tmp/maps_invalid.json; echo
echo -n "empty_query="; auth_post /maps/places/search '{"text":"zzzznonexistentplacexyz123","limit":3}' /tmp/maps_empty.json; echo
echo -n "config="; curl -sS -o /tmp/maps_config.json -w "%{http_code}\n" -H "Authorization: Bearer $TOKEN" "$BASE/maps/config"
echo -n "unauth_geocode="; curl -sS -o /tmp/maps_unauth.json -w "%{http_code}\n" -H 'Content-Type: application/json' -X POST "$BASE/maps/geocode" -d '{"query":"Kumasi"}'

python3 <<'PY'
import json
from pathlib import Path

def load(p):
    return json.loads(Path(p).read_text())

def has_secret(obj):
    s=json.dumps(obj)
    return any(x in s for x in ("sk.", "CYRLO_MAPS_API_KEY", "apiKey"))

geo=load("/tmp/maps_geocode.json")
rev=load("/tmp/maps_reverse.json")
places=load("/tmp/maps_places.json")
est=load("/tmp/maps_estimate.json")
routes=load("/tmp/maps_routes.json")
inv=load("/tmp/maps_invalid.json")
emp=load("/tmp/maps_empty.json")
cfg=load("/tmp/maps_config.json")
unauth=load("/tmp/maps_unauth.json")

results=(geo.get("data") or {}).get("results") or []
print("geocode_count=", len(results))
if results:
    print("geocode_has_label=", bool(results[0].get("label")))
print("reverse_has_result=", (rev.get("data") or {}).get("result") is not None)
print("places_count=", len((places.get("data") or {}).get("results") or []))
edata=(est.get("data") or {})
print("estimate_distanceMeters=", edata.get("distanceMeters"))
print("estimate_durationSeconds=", edata.get("durationSeconds"))
rdata=(routes.get("data") or {})
geom=rdata.get("geometry") or []
print("routes_geometry_points=", len(geom) if isinstance(geom,list) else 0)
print("routes_distanceMeters=", rdata.get("distanceMeters"))
print("invalid_error=", (inv.get("error") or {}).get("code") or inv.get("code"))
print("empty_places_count=", len((emp.get("data") or {}).get("results") or []))
tok=(cfg.get("data") or {}).get("mapboxPublicToken") or ""
print("config_has_pk_prefix=", isinstance(tok,str) and tok.startswith("pk."))
print("config_is_sk=", isinstance(tok,str) and tok.startswith("sk."))
print("unauth_code=", (unauth.get("error") or {}).get("code") or unauth.get("code"))
print("any_response_secret_leak=", any(has_secret(x) for x in (geo,rev,places,est,routes,inv,emp,cfg)))
PY
