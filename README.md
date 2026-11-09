# Cyrlo Ride

Cyrlo Ride is an okada ride-booking platform. Passengers and riders use one Flutter app. The account role decides which experience opens. The backend is one Node.js modular monolith with one PostgreSQL database.

```text
apps/cyrlo_app/          the only Flutter application
  lib/passenger_app/     passenger experience
  lib/rider_app/         rider experience
backend/                 one Express + Socket.IO + Prisma application
admin/                   future admin UI; admin behaviour lives in the API
docs/                    architecture and the frontend/backend contract
```

`lib/passenger_app` and `lib/rider_app` are folders inside the same install. They are not separate apps.

## Run the app

By default the Flutter app talks to the hosted API at `https://cyrloride.eqostack.com` and saves accounts in the live Postgres database via OTP SMS.

```bash
cd apps/cyrlo_app
flutter pub get
# Prefer Android/iOS. Flutter Web needs the API to allow localhost CORS (deployed).
flutter run -d chrome
```

Signup order: phone → role → SMS OTP. Tokens are stored on device; demo riders/jobs/history are removed.

If Chrome shows “Could not reach Cyrlo Ride”, the staging API must allow local browser origins (built-in for `localhost` / `127.0.0.1` after the CORS fix) and `cyrlo-ride-api` must be restarted on the VPS.

Optional overrides:

```bash
# Local backend instead of hosted
flutter run --dart-define=API_BASE_URL=http://localhost:3000/api/v1 --dart-define=SOCKET_URL=http://localhost:3000

# Android emulator → machine localhost
flutter run --dart-define=API_BASE_URL=http://10.0.2.2:3000/api/v1 --dart-define=SOCKET_URL=http://10.0.2.2:3000
```

Optional map defines:

- `MAPBOX_ACCESS_TOKEN` — optional local override for Mapbox **tiles**. Prefer leaving empty so the app loads the public `pk.` from Ride `GET /maps/config` (server `MAPBOX_ACCESS_TOKEN` or legacy `MAPS_API_KEY` if it is a `pk.`). Never use as the Cyrlo Maps HTTP API key.
- `USE_RIDE_MAPS_PROXY` — default `true`; Flutter geocode/places/routes go through Ride `/maps/*` (Maps key stays server-side).

Server Maps secrets (never in Flutter): `CYRLO_MAPS_BASE_URL`, `CYRLO_MAPS_API_KEY`.

Cyrlo Maps is a git dependency pinned to commit `9e344c5b862824c75b463f43a3c05b7734253bad`. See `docs/architecture/CYRLO_MAPS_INTEGRATION_REPORT.md`.

The opening screen previews the passenger or rider experience. After sign-in exists, the API role replaces that choice.

## Run the API

```bash
cd backend
copy .env.example .env
npm install
npx prisma migrate dev --name init
npm run dev
```

- Health: `GET http://localhost:3000/api/v1/health`
- Readiness: `GET http://localhost:3000/api/v1/health/ready`
- OpenAPI for live routes: `http://localhost:3000/api/docs`

`npm test` and `npm run typecheck` do not need a running database. `prisma migrate dev` does.

## Checks

```bash
cd apps/cyrlo_app && flutter analyze && flutter test
cd backend && npm test && npm run typecheck && npx prisma validate
```

Staging ops status (host, systemd, SMS, Maps): [docs/deployment/STAGING_LIVE_STATUS.md](docs/deployment/STAGING_LIVE_STATUS.md).

Deploy scripts + GitHub Actions: [ops/deploy/README.md](ops/deploy/README.md).

Auth OTP against staging is live. Prefer Android/iOS over Flutter Web unless `CORS_ORIGINS` includes your web origin. Bookings / nearby / matching client wiring is still in progress — see the API docs and architecture notes.
