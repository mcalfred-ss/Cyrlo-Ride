# Cyrlo Ride repository audit

This audit describes the repository as inspected at the time it was written. Launch vehicles, booking statuses, staff roles, and refunds are in `CYRLO_RIDE_MASTER_SPEC.md` (Okada / Pragya / Aboboyaa).

Inspection date: 2026-11-06. Scope is the working tree on `main` at `83597ad` (`Center the signup screens on shared cards and accept 123456 as the test code`). This document records what is in the repository. It does not describe a target that has not been built.

No application logic was changed during this audit. Tests were not re-run. Findings come from reading source, Prisma, and the existing `docs/` notes.

## Layout

```text
apps/cyrlo_app/     one Flutter application (passenger and rider experiences)
backend/            one Express + Socket.IO + Prisma process
admin/              a README only; no admin UI
docs/               existing architecture, API, database, and business-rule notes
```

There is no Supabase or Firebase project in this repository. PostgreSQL is the intended database. The checked-in migration is `backend/prisma/migrations/20261106170000_init`.

## Flutter application

`apps/cyrlo_app` is the only client. Package name `cyrlo_app`, version `1.0.0+1`, Dart SDK `^3.13.2`, `publish_to: none`.

Entry point: `lib/main.dart` wraps `CyrloApp` in a Riverpod `ProviderScope`. `lib/app.dart` builds `MaterialApp.router` with `CyrloTheme.light` and `CyrloTheme.dark`, and forces `ThemeMode.light`.

### What is implemented in the UI

Signup is a local draft. `SignupController` never calls `ApiClient`. OTP accepts the constant `123456` and nothing else. The comment in that controller says this is a stand-in until SMS OTP is connected. Sign-out clears the draft and keeps the splash, onboarding, and welcome flags. Nothing is written to secure storage or disk, so a process restart loses the session.

The router (`go_router`) forces the next screen from that draft:

| Step | Route | Behaviour today |
| --- | --- | --- |
| Splash | `/splash` | Local completion flag |
| Onboarding | `/onboarding` | Local completion flag |
| Welcome | `/welcome` | Local completion flag |
| Phone | `/create-account` | Normalizes a Ghana number to E.164 |
| OTP | `/verify` | Accepts `123456` locally |
| Role | `/role` | `passenger` or `rider` |
| Passenger name | `/passenger/details` | Name length at least 2 |
| Passenger shell | `/passenger/home`, `/map`, `/rides`, `/account` | Home, Map, and Rides are titled placeholders |
| Vehicle | `/rider/vehicle` | Okada and pragya continue; aboboyaa is ignored |
| Rider application | `/rider/apply` | Local name only |
| Approval wait | `/rider/approval` | Stays here until `markRiderApproved()` |
| Rider shell | `/rider/jobs`, `/token`, `/account` | Jobs and Token are titled placeholders |

`DriverKind` is `okada`, `pragya`, or `aboboyaa`. The controller refuses `aboboyaa`. The backend onboarding schema has no vehicle-type field. The UI choice is not sent anywhere.

Passenger tabs: Home, Map, Rides, Account. Rider tabs: Jobs, Token, Account. Account can sign out locally.

### Navigation and state

- Navigation: `go_router` 18, with a redirect driven by `signupProvider`.
- State: `flutter_riverpod` 3. The only feature notifier is `SignupController`.
- HTTP: `dio` client in `lib/core/network/api_client.dart`. It expects `{ success: false, error: {...} }` and can set `Authorization: Bearer`. No feature screen uses it.
- Sockets: `socket_io_client` wrapper connects with `auth: { token }` and does not listen for events. Nothing in the UI calls `connect`.
- Config: `--dart-define=API_BASE_URL` (default `http://localhost:3000/api/v1`) and `SOCKET_URL` (default `http://localhost:3000`). No Mapbox token define exists in this app.

`lib/core/constants/api_paths.dart` lists a subset of the planned API (`/health`, OTP, refresh, logout, bookings, rider availability, rider location) and states that business paths are not implemented on the server.

`lib/core/constants/realtime_events.dart` lists the same seven event names as `backend/src/infrastructure/realtime/events.ts`.

### Dependencies present

| Package | Role |
| --- | --- |
| `flutter_riverpod` | State |
| `go_router` | Navigation |
| `dio` | HTTP |
| `socket_io_client` | Socket.IO |
| `google_fonts` | Typography |
| `cupertino_icons` | Icons |

Not present: `cyrlo_maps`, `flutter_map`, `geolocator`, `latlong2`, secure storage, a Paystack SDK, image upload, or any map widget. The Map tab does not render a map.

### Design system that already exists

Shared widgets live under `lib/shared/widgets/`: `CyrloButton`, `CyrloCard`, `CyrloPage`, `CyrloTextField`, `CenteredFrame`, `ChoiceCard`, `FlowScaffold`, `GhanaPhoneField`, `RoleShell`, `ScreenHeader`.

Theme tokens live under `lib/core/theme/` (`cyrlo_theme.dart`, `app_spacing.dart`, `app_radii.dart`, `app_motion.dart`) and `lib/core/constants/app_colors.dart`. Phone normalization is `lib/core/utils/phone_numbers.dart`. Coordinates type `GeoPoint` exists and is unused by a map.

### Flutter tests

- `test/widget_test.dart` walks the local passenger path to the four tabs, and the rider path through approval. It expects aboboyaa not to advance.
- `test/contract_test.dart` checks the seven socket event names and `ApiException.fromJson`.

There is no map test, no API integration test, and no test that a wrong OTP is rejected beyond the widget flow's happy path.

## Backend

`backend/` is one Node.js 20+ TypeScript process: Express 5, Socket.IO 4, Prisma 6, Zod, Helmet, CORS, `express-rate-limit`, Pino, `swagger-ui-express`, `jsonwebtoken`. Tests use Vitest and Supertest. There is no second service.

`src/server.ts` builds one HTTP server, attaches Socket.IO, and disconnects Prisma on shutdown.

`src/app.ts` mounts, under `/api/v1`:

- `GET /health` and `GET /health/ready` (live)
- empty routers for `auth`, `users`, `riders`, `bookings`, `matching`, `locations`, `payments`, `wallet`, `notifications`, `admin`, `service-zones`, and `audit`

OpenAPI at `/api/docs` documents only the two health routes. Its description says other business endpoints are not implemented.

An empty router does not register handlers, so those paths return the app 404 envelope (`NOT_FOUND`), not `501`. Each module service throws `NOT_IMPLEMENTED` if called in process. Module tests assert that. Controllers are empty classes. Repositories are constructed and unused by HTTP.

### What is executable today

These pieces run without a database and have tests in `backend/tests/domain.test.ts` and `backend/tests/foundation.test.ts`:

| Piece | Location | What it enforces |
| --- | --- | --- |
| Booking and offer transitions | `modules/bookings/booking-rules.ts` | Actor and status matrix |
| Booking-fee and token refund decisions | same file | When a captured fee or debited token is refundable |
| GPS freshness | `modules/locations/location-freshness.ts` | Age from 0 through 30 seconds |
| Zone geometry | `modules/service-zones/zone-geometry.ts` | Bounding box, then point-in-ring. GeoJSON axis order is longitude, latitude |
| OTP helpers | `common/security/otp.ts` | Expiry and attempt count. Codes are HMAC-SHA256 hashed |
| Access tokens | `common/security/tokens.ts` | JWT `sub` and `role`. Refresh tokens are random and hashed |
| Paystack signatures | `infrastructure/payments/paystack.ts` | HMAC-SHA512 over the raw body, timing-safe compare |
| Idempotency key names | `common/utils/idempotency.ts` | Fee, purchase, debit, and refund key shapes |
| Auth middleware | `common/middleware/authenticate.ts` | Bearer JWT and `requireRole`. Not attached to business routes because those routes are empty |
| Rate limit | `common/middleware/rate-limit.ts` | 300 requests / 15 minutes by default. Health is excluded |
| Env validation | `config/env.ts` | Zod. Production rejects placeholder secrets. Access and refresh secrets must differ |
| Socket handshake | `infrastructure/realtime/socket.ts` | Requires a valid access token and joins `user:{userId}`. Does not emit booking or location events |

Constants already fixed in code: booking fee `100` pesewas, one token per acceptance, location max age `30_000` ms, page size default 20 and max 100, access TTL 900 seconds, refresh TTL 30 days, OTP TTL 300 seconds, 5 attempts, 60 second resend cooldown.

SMS, push, and the backend maps provider throw `NOT_IMPLEMENTED`. The maps provider is a distance/duration function. It is not a Cyrlo Maps HTTP API, and nothing calls it.

### Environment

`backend/.env.example` lists Postgres, CORS, JWT, OTP, Paystack, SMS, push, `MAPS_PROVIDER`, `MAPS_API_KEY`, logging, proxy trust, and rate limits. `MAPS_*` are empty placeholders. They must not be turned into a hosted Cyrlo Maps dependency. Map rendering belongs in the Flutter package.

### Database artifacts present

`backend/prisma/schema.prisma` and migration `20261106170000_init` create the tables and the financial checks in `prisma/financial-constraints.sql` (non-negative balances, positive payment amounts, one successful booking fee per booking, one deduction and one refund ledger row per booking). No seed file is present. This audit did not run migrations or connect to a database.

`backend/scripts/backup-postgres.sh` dumps Postgres with `pg_dump --format=custom` and deletes dumps older than 14 days. It is not installed on a server by this repository.

## Admin

`admin/README.md` states there is no admin application. Admin behaviour is reserved for the `admin` module and the `ADMIN` role. Review and suspend input schemas exist. Their routes are not registered.

## Existing documentation

`docs/ARCHITECTURE.md`, `docs/API_DOCUMENTATION.md`, `docs/DATABASE_DESIGN.md`, `docs/BUSINESS_RULES.md`, and `docs/DEVELOPMENT_STANDARDS.md` already describe the modular monolith, the unwired contract, and the tested rules. This `docs/architecture/` set audits that material against the source and plans the work still required. Where they disagree, the source wins. The important agreement is: business HTTP routes are specified and not mounted.

## What this repository does not contain

- A working phone OTP, session persistence, or role loaded from the API.
- A map, device location, geocoding, or place search.
- A dependency on `cyrlo_maps`.
- Booking, matching, wallet, or Paystack flows that persist data.
- Socket emission of ride or location events.
- An admin UI, object storage, an SMS vendor, or a push vendor.
- School-transport screens, tables, or routes.
- Deployment configuration for Nginx, PM2, or TLS. The backup script is the only operations artifact.
