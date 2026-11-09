# Cyrlo Ride — Staging live status

**Date:** 2026-11-08  
**Host:** `cyrloride.eqostack.com` → VPS `188.166.155.199`  
**Architecture:** modular monolith (one Node process, one Postgres, Socket.IO on the same HTTP server)

## What is live

| Piece | Status |
| --- | --- |
| API liveness `/api/v1/health` | Up |
| Readiness `/api/v1/health/ready` | DB up; SMS Vynfy ready; Maps HTTP configured |
| OTP `POST /api/v1/auth/otp` | Working (Vynfy SMS delivery) |
| Staging DB | `cyrlo_ride_staging` (Postgres on VPS) |
| Maps host | `https://api.cyrlomap.eqostack.com` (`cyrlo-maps-api.service`) |
| Process manager | **systemd** `cyrlo-ride-api.service` (not PM2) |
| Listen | `127.0.0.1:3020` (Nginx TLS terminates and proxies) |

## Server layout (ops)

| Item | Path / unit |
| --- | --- |
| Ride unit | `cyrlo-ride-api.service` |
| Env files | `/etc/cyrlo-ride/ride.env`, `/etc/cyrlo-ride/providers.env` |
| App dir | `/var/www/cyrlo-ride-api/app` (git checkout) |
| Backend cwd | `/var/www/cyrlo-ride-api/app/backend` (`WorkingDirectory` in systemd) |
| Nginx site | `/etc/nginx/sites-enabled/cyrloride.eqostack.com` → `proxy_pass http://127.0.0.1:3020` |
| Maps unit | `cyrlo-maps-api.service` |

**Do not confuse with** PM2 process `cirlo-api` (`/var/www/cirlo/brolly/...`) — that is Cirlo/Brolly, not Cyrlo Ride.

Restart Ride after env changes:

```bash
systemctl restart cyrlo-ride-api
systemctl status cyrlo-ride-api --no-pager
```

### Deploy / CI

| Piece | Path |
| --- | --- |
| Staging deploy (on VPS) | `ops/deploy/deploy-staging.sh` |
| Local SSH helper (Windows) | `ops/deploy/deploy-staging.ps1` |
| Smoke checks | `ops/deploy/smoke-staging.sh` |
| Docs | `ops/deploy/README.md` |
| CI (test/typecheck only) | `.github/workflows/ci.yml` |
| CD | none — always manual via deploy scripts above |

```bash
bash /var/www/cyrlo-ride-api/app/ops/deploy/deploy-staging.sh
bash /var/www/cyrlo-ride-api/app/ops/deploy/smoke-staging.sh
```

## Required provider env (names only)

```bash
SMS_PROVIDER=vynfy
VYNFY_API_KEY=...
VYNFY_SENDER_ID=...          # exact Vynfy-approved sender

MAPS_PROVIDER=cyrlo
MAPS_BASE_URL=https://api.cyrlomap.eqostack.com
MAPS_API_KEY=...             # Cyrlo Maps key — not Mapbox
```

Mapbox public `pk.` tokens are for Flutter **tiles**. Prefer `MAPBOX_ACCESS_TOKEN` in `providers.env` (also accepted if legacy `MAPS_API_KEY` is a `pk.`). Ride returns it to the app via authenticated `GET /maps/config` as `mapboxPublicToken`. Never use a Mapbox token as `CYRLO_MAPS_API_KEY`.

## Flutter client (2026-11-08)

- Defaults to `https://cyrloride.eqostack.com/api/v1` and Socket.IO on the same host.
- Live OTP: phone → role → SMS verify; tokens in `shared_preferences`.
- Demo nearby riders / ride history / job offers removed.
- Cyrlo Maps: Flutter calls Ride `/maps/*` proxy; Maps API key stays on the server (`CYRLO_MAPS_API_KEY` in providers.env).
- **Flutter Web:** API allows `localhost` / `127.0.0.1` (any port) plus `CORS_ORIGINS`. Helmet CORP is `cross-origin` so browsers can read JSON. Prefer Android/iOS when possible.

## Object storage (Bunny.net)

Preferred provider is Bunny Edge Storage + CDN token URLs (not Cloudflare R2):

```bash
STORAGE_PROVIDER=bunny
BUNNY_STORAGE_ZONE_NAME=...
BUNNY_STORAGE_ACCESS_KEY=...
BUNNY_STORAGE_HOSTNAME=storage.bunnycdn.com
BUNNY_CDN_BASE_URL=https://YOUR_ZONE.b-cdn.net
BUNNY_CDN_TOKEN_KEY=...
OBJECT_STORAGE_SIGNED_URL_TTL_SECONDS=60
```

## Pre-pilot checklist progress (2026-11-09)

| Gate | Status |
| --- | --- |
| Offer timeout = 20s | Done (env aligned) |
| Paystack webhook | Done (staging URL + signature check) |
| Bunny storage | Done (live upload + signed download verified) |
| Identity / MFA keys | Done (`IDENTITY_ENCRYPTION_KEY_VERSION=1`) |
| SMS OTP (Vynfy) | Done |
| Backups + restore drill | Done (cron + 41-table restore drill) |
| Single matching writer | Done (one API systemd unit) |
| Live polygons | Done (staging) — zone **Kokobin** created, currently **inactive** pending activate |
| Refund/dispute policy ack | Done — `docs/legal/PILOT_REFUND_AND_DISPUTE_POLICY.md` |
| Terms / Privacy hosted | Done — `https://eqostack.com/cyrlo/terms` · `https://eqostack.com/cyrlo/privacy` (Nginx on eqostack.com → `/var/www/cyrlo-legal/`) |

## Still open

- Live service-zone polygons for Atwima Kwanwoma / Ahenema Kokoben.
- Activate Kokobin zone when ready for pilot rides.
- Wire Flutter bookings / nearby / matching to live APIs.

- FCM push not configured.
- Rider onboarding POST APIs still incomplete.
- Passenger profile: `PATCH /users/me` + hydrate on login (deploy migration `20261109180000_passenger_profile_details`).
