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

```bash
cd apps/cyrlo_app
flutter pub get
flutter run --dart-define=API_BASE_URL=http://localhost:3000/api/v1 --dart-define=SOCKET_URL=http://localhost:3000
```

Optional map defines:

- `MAPBOX_ACCESS_TOKEN` — public `pk.` token for Mapbox tiles and device Directions. Empty uses the Cyrlo Maps CARTO fallback.
- `CYRLO_MAPS_API_BASE_URL` — leave empty until the hosted Maps OpenAPI contract is published. Do not invent endpoints.
- `CYRLO_MAPS_API_TOKEN` — reserved for that future contract.

On the Android emulator, point the API defines at `http://10.0.2.2:3000` instead of `localhost`.

Cyrlo Maps is a git dependency pinned to commit `d299ede80fb63ccaa3f8d8b2135f757897317dfd`. See `docs/architecture/CYRLO_MAPS_INTEGRATION_REPORT.md`.

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

Business endpoints are specified in [docs/API_DOCUMENTATION.md](docs/API_DOCUMENTATION.md) and are not implemented yet. Do not treat a 404 or an unwired module as a finished feature.
