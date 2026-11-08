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
| App dir | `/var/www/cyrlo-ride-api` (deploy artifact) |
| Nginx site | `/etc/nginx/sites-enabled/cyrloride.eqostack.com` → `proxy_pass http://127.0.0.1:3020` |
| Maps unit | `cyrlo-maps-api.service` |

**Do not confuse with** PM2 process `cirlo-api` (`/var/www/cirlo/brolly/...`) — that is Cirlo/Brolly, not Cyrlo Ride.

Restart Ride after env changes:

```bash
systemctl restart cyrlo-ride-api
systemctl status cyrlo-ride-api --no-pager
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

Mapbox public `pk.` tokens are for Flutter **tiles** only (`MAPBOX_ACCESS_TOKEN`). Never use them as `MAPS_API_KEY`.

## Flutter client (2026-11-08)

- Defaults to `https://cyrloride.eqostack.com/api/v1` and Socket.IO on the same host.
- Live OTP: phone → role → SMS verify; tokens in `shared_preferences`.
- Demo nearby riders / ride history / job offers removed.
- Cyrlo Maps: Flutter calls Ride `/maps/*` proxy; Maps API key stays on the server (`CYRLO_MAPS_API_KEY` in providers.env).
- **Flutter Web** against staging needs `CORS_ORIGINS` to include the web origin; prefer Android/iOS for dogfood.

## Still open

- Deploy latest repo (maps client-config route + Flutter auth) to the VPS artifact if not yet pulled.
- Wire Flutter bookings / nearby / matching to live APIs.
- FCM push not configured.
- Profile/onboarding POST APIs for passenger & rider details.
