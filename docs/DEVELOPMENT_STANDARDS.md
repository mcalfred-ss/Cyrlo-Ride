# Development standards

## Local setup

1. Install Flutter 3.47 or newer, Node.js 20 or newer, and PostgreSQL 16 or newer on the machine that will run the database.
2. Copy `backend/.env.example` to `backend/.env`.
3. Create the local database and user named in `DATABASE_URL`.
4. From `backend`, run `npm install` and `npx prisma migrate dev`.
5. From `apps/cyrlo_app`, run `flutter pub get`.

The API boots without a live database, but readiness stays down until PostgreSQL answers. Do not point local development at the VPS database.

## Environment

Secrets stay in `.env` or the server environment. `.env` is gitignored. Production boot refuses JWT and OTP secrets that still contain `change-me` or `development-only`. Access and refresh secrets must differ.

`TRUST_PROXY=true` only behind Nginx. `CORS_ORIGINS` lists browser origins. The mobile app does not send an Origin header.

Flutter configuration uses `--dart-define`, not a committed secrets file:

- `API_BASE_URL` defaults to `http://localhost:3000/api/v1`
- `SOCKET_URL` defaults to `http://localhost:3000`

## Flutter

Keep the app feature-first.

- `presentation` renders widgets.
- `application` holds Riverpod notifiers.
- `domain` holds role rules that must stay stable.
- `data` talks to `ApiClient` and `RealtimeClient`.

Passenger screens go under `lib/passenger_app`. Rider screens go under `lib/rider_app`. Do not copy a business rule into both trees. If both roles need it, put it in `lib/core`, `lib/shared`, or `lib/features`.

Navigation goes through GoRouter. HTTP goes through the shared Dio client so the error envelope is parsed in one place. Do not add a second HTTP stack.

## Backend

TypeScript is strict. Import paths use NodeNext `.js` extensions.

- Routes name endpoints and stay thin.
- Controllers translate HTTP into service calls.
- Services own business rules and transactions.
- Repositories are the only Prisma access for that module.
- Zod schemas in `module.schema.ts` are the request contract.
- Tests live in `module.test.ts` or `backend/tests` when they cross modules.

A module imports another module only from that module's `index.ts`, and only in the direction in `docs/ARCHITECTURE.md`.

Money is integer pesewas. Coordinates on the API are `{ latitude, longitude }` in WGS84. Service-zone polygons stored in JSON are GeoJSON, so the axis order is `[longitude, latitude]`.

Log with the shared Pino logger. Do not log OTP codes, tokens, or the `Authorization` header. Those fields are redacted.

Return `501 NOT_IMPLEMENTED` from a service that is still a contract shell. Do not register a route that pretends the feature is finished.

## Checks before handing work over

```bash
cd apps/cyrlo_app
flutter analyze
flutter test

cd backend
npm test
npm run typecheck
npx prisma validate
```

## Production notes

- Bind PostgreSQL to localhost.
- Terminate TLS at Nginx.
- Run one PM2 process.
- Verify Paystack with the raw body signature.
- Apply wallet and booking changes in one database transaction.
- Keep the backup cron in place.
