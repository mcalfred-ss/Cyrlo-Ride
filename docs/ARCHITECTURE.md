# Architecture

Cyrlo Ride is one product with two clients of the same binary and one backend.

## One app, two experiences

`apps/cyrlo_app` is the only Flutter application. It has one `pubspec.yaml`, one Android project, and one iOS project.

- `lib/passenger_app/` holds the passenger experience: home, maps, booking, live tracking, history, and passenger profile.
- `lib/rider_app/` holds the rider experience: onboarding, availability, incoming requests, navigation, active rides, wallet, and rider profile.
- `lib/features/auth`, `lib/features/notifications`, and `lib/features/settings` are shared by both roles.
- `lib/core` and `lib/shared` hold configuration, HTTP, sockets, routing, and theme.

The signed-in account has one role, `PASSENGER` or `RIDER`. The app opens the matching folder's experience. A preview switch exists only so both sides can be opened before authentication is built. It must not remain as a way to skip the server role.

## One modular monolith

The backend is one Node.js TypeScript process:

- one Express application
- one HTTP server
- one Socket.IO server attached to that HTTP server
- one Prisma client
- one PostgreSQL database on the VPS
- one PM2 process (`instances: 1`)

Modules live in `backend/src/modules`. They are not separate deployable services.

| Module | Responsibility |
| --- | --- |
| auth | OTP, access tokens, refresh tokens |
| users | Shared user identity and passenger profile |
| riders | Onboarding, verification, availability |
| bookings | Ride requests and status transitions |
| matching | Nearby eligible riders, offers, accept and reject |
| locations | Rider GPS and who may see it |
| payments | Paystack booking fees and token purchases |
| wallet | Rider token balance and ledger |
| notifications | In-app, push, and SMS notifications |
| admin | Review, suspension, and operational actions |
| service-zones | Where Cyrlo operates |
| audit | Who changed what |

Each module keeps the same files: routes, controller, service, repository, schema, types, and tests. `index.ts` is the public boundary. Another module may depend on the exported service interface. It must not import `module.repository.ts` or another module's private classes.

`src/composition.ts` is the composition root. It constructs repositories and services. Feature code outside a module uses the service, not Prisma.

Allowed dependency direction:

1. `audit`, `service-zones`, and `notifications` do not depend on other business modules.
2. `auth` and `users` depend only on their own data.
3. `riders`, `locations`, `wallet`, and `payments` depend inward, through service interfaces.
4. `matching` can ask riders, locations, wallet, and service zones.
5. `bookings` is the ride orchestrator. It may call matching, payments, wallet, notifications, and service zones.
6. `admin` may call the others.

Do not introduce a cycle. If two modules need the same database transaction, the orchestrating service owns the transaction and calls the other services. Repositories stay private.

Shared infrastructure (Prisma, Paystack signature checks, SMS, push, maps, Socket.IO) lives under `src/infrastructure`. Modules call those adapters. Adapters do not call module repositories.

## Deployment shape

Nginx terminates HTTPS and proxies to the Node process on localhost. PostgreSQL listens on localhost only. PM2 runs `dist/server.js` as a single fork. More than one instance would split Socket.IO rooms, so clustering waits until a shared adapter is actually required.

Backups run on the VPS with `backend/scripts/backup-postgres.sh`. A cron job should call it daily and keep 14 days of dumps.

## What is intentionally absent

No microservices, no Supabase, no Firebase as the system of record, and no second API. Business routes are specified and unwired. The executable rules that already exist are booking transitions, refund decisions, GPS freshness, zone geometry, OTP limits, JWT helpers, and Paystack signature verification.
