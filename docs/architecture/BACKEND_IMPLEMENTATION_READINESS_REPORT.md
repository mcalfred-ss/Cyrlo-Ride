# Backend implementation readiness report

Audit date: 2026-11-06. **Read-only.** No source, schema, migration, dependency, environment, database, or deployment file was changed.

Authoritative product target: `docs/architecture/CYRLO_RIDE_MASTER_SPEC.md`, with matching detail in `MATCHING_AND_CANCELLATION_POLICY.md`. Supporting context: `OPEN_DECISIONS.md`, `DATABASE_DESIGN.md`, `FINANCIAL_ARCHITECTURE.md`, `SECURITY_AND_OPERATIONS.md`, and the inspected tree under `backend/`.

Status labels used below:

| Label | Meaning |
| --- | --- |
| **Implemented** | Runs in process and is covered by tests or a live HTTP route |
| **Partial** | Helpers, schemas, tables, or middleware exist, but the use case is not wired end-to-end |
| **Not implemented** | Service throws `NOT_IMPLEMENTED`, router is empty, or the object is absent from Prisma |
| **Unresolved** | Master spec / open decisions still require a product answer before code should invent a value |

## Important clarification on offer timeout

This audit request listed a **30-second offer response timeout** among reconciliation checks. That value is **not** an approved decision in `CYRLO_RIDE_MASTER_SPEC.md` or `OPEN_DECISIONS.md`.

What **is** approved:

- GPS freshness maximum **30 seconds** (`RIDER_LOCATION_MAX_AGE_MS = 30_000` already exists as a constant and helper).
- Successive batches of up to three riders.
- Five-minute search deadline.
- Fixed 5 km matching radius.

What remains **Unresolved**:

- How long one offer stays open before it times out and the next batch may start.
- Which riders are chosen when more than three are inside 5 km.

Do not implement a 30-second offer timeout as if it were approved. Do not confuse it with GPS freshness.

---

## 1. Repository structure

```text
backend/
  prisma/
    schema.prisma
    migrations/20261106170000_init/
    financial-constraints.sql
  src/
    server.ts                 HTTP + Socket.IO + graceful shutdown
    app.ts                    Express app, mounts empty module routers
    composition.ts            Module composition root
    config/                   env, constants, logger
    common/                   errors, middleware, security, schemas
    infrastructure/           prisma, paystack signature, sms/push/maps stubs, socket
    modules/                  auth, users, riders, bookings, matching, locations,
                              payments, wallet, notifications, admin, service-zones, audit
    docs/openapi.ts           health only
  tests/                      foundation + domain helper tests
  scripts/backup-postgres.sh
```

Shape matches the approved modular monolith. One process, one Postgres database, no microservices, no Supabase/Firebase as system of record.

## 2. Current backend architecture diagram

```text
                    Clients (Flutter / future admin UI)
                              |
                              | HTTPS (later) / HTTP today
                              v
                 +----------------------------+
                 | Express createApp()        |
                 | helmet, cors, json+rawBody |
                 | requestId, pino, rateLimit |
                 +-------------+--------------+
                               |
              /api/v1 ----------+----------------------------+
              |                                              |
              v                                              v
        GET /health                                   empty routers:
        GET /health/ready                             /auth /users /riders
              |                                       /bookings /matching
              |                                       /locations /payments
              v                                       /wallet /notifications
         Prisma SELECT 1                              /admin /service-zones /audit
                                                              |
                                                              v
                                                    Module services:
                                                    throw NOT_IMPLEMENTED
                                                              |
                 +----------------------------+               |
                 | Socket.IO on same HTTP     |               |
                 | JWT handshake              |               |
                 | joins user:{id}            |               |
                 | no booking/location emit   |               |
                 +----------------------------+               |
                                                              v
                 +----------------------------+     +---------------------+
                 | Pure helpers (tested)      |     | Prisma schema +     |
                 | booking-rules (legacy)     |     | init migration +    |
                 | location-freshness         |     | financial checks    |
                 | zone-geometry              |     +----------+----------+
                 | OTP hash / JWT / Paystack  |                |
                 | signature / idempotency    |                v
                 | key names                  |         PostgreSQL (intended)
                 +----------------------------+

Infrastructure stubs (throw): SMS, push, MapsProvider
```

Composition root constructs every module with `{ prisma }` only. Modules do not yet call each other through service interfaces.

## 3. Current database entity relationship summary

**What exists in Prisma / init migration**

```text
users 1--0..1 passenger_profiles
users 1--0..1 rider_profiles
users 1--* refresh_tokens
users 1--* payments, notifications, passenger bookings, audit_logs

rider_profiles 1--0..1 rider_locations
rider_profiles 1--0..1 rider_wallets
rider_profiles 1--* rider_documents, booking_offers, token_ledger_entries, rider bookings

service_zones 1--* bookings
bookings 1--* booking_offers, payments, token_ledger_entries

otp_challenges (no FK; phone + purpose)
```

**Financial guards already in SQL (outside Prisma model)**

- `token_balance >= 0`, `balance_after >= 0`, `amount_pesewas > 0`
- One successful `BOOKING_FEE` per booking
- One `DEDUCTION` and one `REFUND` ledger row per booking

**Missing relative to master spec §13 (not migrated)**

| Target object | Purpose |
| --- | --- |
| Statuses `AWAITING_PAYMENT`, `PAYMENT_FAILED`, `SEARCHING`, `IN_PROGRESS` | Approved lifecycle; retire `REQUESTED` for new rows |
| `search_expires_at`, `payment_expires_at` | 5-minute search, 10-minute unpaid |
| `booking_status_history` | Immutable transitions |
| `payment_webhook_events` | Replay-safe webhook processing |
| `payment_refunds` | Fee refund lifecycle |
| `token_ledger_entries.reverses_entry_id` | Token refund → debit |
| FK ledger `payment_id` → `payments` | Purchase integrity |
| `rider_identity_secrets` | Encrypted Ghana Card (not plaintext column) |
| Vehicle category / vehicle row (`OKADA` \| `PRAGYA` \| `ABOBOYAA`) | Launch vehicles |
| `rider_zone_approvals` | Per-zone rider approval |
| `trip_location_points` | Dispute GPS trail |
| `disputes` | 24-hour window |
| Passenger completion acknowledgement | Not a status |
| `admin_role_grants` | Four staff roles |
| `token_packs` | Configurable STARTER / STANDARD / PRO |
| Partial unique: one accepted offer per booking; one active assigned booking per rider | Single-winner concurrency |

**Security note.** `rider_profiles.ghana_card_number` is plaintext `TEXT`. Nothing writes it today. The target forbids filling it.

## 4. List of implemented functionality

| Area | Evidence | Label |
| --- | --- | --- |
| Express process + graceful shutdown | `server.ts` | Implemented |
| Health / readiness | `GET /api/v1/health`, `/health/ready` | Implemented |
| OpenAPI shell | `/api/docs` documents health only | Implemented |
| Request id, helmet, CORS, rate limit, JSON + raw body | `app.ts` | Implemented |
| Error envelope | `AppError` + `errorHandler` | Implemented |
| Zod schemas for planned inputs | auth, bookings, riders, payments, etc. | Partial (schemas only) |
| Module folder boundaries + composition root | `modules/*`, `composition.ts` | Implemented (structure) |
| Socket.IO attach + JWT handshake + `user:{id}` room | `socket.ts` | Partial (no domain emits) |
| OTP hash / expiry / attempt helpers | `otp.ts`, env defaults | Partial |
| JWT sign/verify + refresh token create/hash | `tokens.ts` | Partial (no HS256 pin; unused by routes) |
| Auth / role middleware | `authenticate`, `requireRole` | Partial (not mounted) |
| Booking/offer transition tables | `booking-rules.ts` | Partial (legacy `REQUESTED` machine) |
| Refund predicate booleans | `shouldRefund*` | Partial (**conflicts** with approved matrix) |
| GPS freshness helper | `isFreshLocation`, 30 s constant | Partial |
| Zone bbox + point-in-ring | `zone-geometry.ts` | Partial |
| Paystack HMAC-SHA512 signature verify | `paystack.ts` | Partial |
| Idempotency key name helpers | `IdempotencyKey` | Partial |
| Financial CHECK / partial unique indexes | init migration | Implemented (DB rules) |
| Domain + foundation tests | `tests/domain.test.ts`, `foundation.test.ts`, per-module `NOT_IMPLEMENTED` tests | Implemented (for what exists) |
| Env validation | Zod `env.ts`, production rejects placeholder JWT/OTP secrets | Implemented |
| Backup script | `scripts/backup-postgres.sh` | Implemented (ops artifact; not scheduled) |

## 5. List of missing functionality

All business HTTP handlers. Empty routers → `404 NOT_FOUND`. Services throw `501 NOT_IMPLEMENTED`.

| Domain | Missing |
| --- | --- |
| Auth | OTP request/verify, SMS send, refresh rotation/revocation, logout, secure session persistence |
| Users | `GET/PATCH /users/me`, ownership checks |
| Riders | Onboarding with `OKADA`/`PRAGYA`/`ABOBOYAA`, documents, encrypted identity, availability intent, zone approvals |
| Admin RBAC | Four roles, grants table, MFA, explicit refund permission, audited suspend/reinstate |
| Bookings | Target statuses, unpaid 10-minute timeout, search 5-minute clock, history rows, start/complete/`IN_PROGRESS`, passenger ack |
| Matching | Eligibility query, 5 km filter, successive batches ≤3, exclude prior reject/timeout, locked single-winner accept |
| Locations | Persist GPS, freshness gate for matching, trip location log, scoped socket emit |
| Payments | Paystack initialize, webhook handler + event table, fee capture before `SEARCHING` |
| Wallet | Locked debit/credit/refund, `reverses_entry_id`, pack catalog table |
| Refunds | Policy service replacing booleans; `payment_refunds`; matrix-aligned fee/token decisions |
| Notifications | After-commit push/in-app/SMS; adapters configured |
| Service zones | Admin CRUD, activation, rider-zone approval, seeded verified polygons |
| Disputes | Create within 24 h, support review workflow |
| Token packs | Configurable STARTER/STANDARD/PRO rows |
| Security hardening | `algorithms: ['HS256']`, ACTIVE user re-check, ownership on every route, append-only grants on ledger/payments |

## 6. Conflicts between implementation and approved specification

| Topic | Code / schema today | Approved target | Severity |
| --- | --- | --- | --- |
| Booking statuses | `REQUESTED`, `ACCEPTED`, `CANCELLED`, `COMPLETED`, `EXPIRED` | `AWAITING_PAYMENT`, `PAYMENT_FAILED`, `SEARCHING`, `ACCEPTED`, `IN_PROGRESS`, `COMPLETED`, `EXPIRED`, `CANCELLED` | Blocking |
| Trip start | No `IN_PROGRESS`; `ACCEPTED → COMPLETED` allowed for rider | `ACCEPTED → IN_PROGRESS → COMPLETED` | Blocking |
| Fee refund after rider cancel | `shouldRefundBookingFee` false once accepted | Fee **refund** | Blocking (financial) |
| Token refund after rider cancel | `shouldRefundToken` false when `cancelledBy === RIDER` | Token **refund** | Blocking (financial) |
| Passenger cancel after accept | Fee kept, token refunded by boolean | **No automatic** fee or token refund; support review | Blocking (financial) |
| Staff roles | `UserRole.ADMIN` only | `SUPER_ADMIN`, `OPERATIONS_ADMIN`, `FINANCE_ADMIN`, `SUPPORT_ADMIN` via grants | Blocking |
| Availability | Stored `OFFLINE` / `AVAILABLE` / `BUSY` | Intent offline/online; display derived (`OFFER_PENDING`, `ON_TRIP`, `SUSPENDED`) | Blocking |
| Vehicles | Okada / Pragya / Aboboyaa in Flutter and API | `OKADA`, `PRAGYA`, `ABOBOYAA` | Done |
| Ghana Card | Plaintext column present | Encrypted secret store; never plaintext; never on ordinary APIs | Security risk |
| Token packs | Client `packCode` string; no catalog | Server-owned STARTER/STANDARD/PRO table | Blocking |
| Matching | No radius, batch, or timeout constants beyond GPS age | 5 km, batches of 3, successive batches, 5-minute search | Blocking |
| JWT | No `algorithms: ['HS256']` | Pin HS256 | Security |
| Auth middleware | Defined, unused | Mount on every business route + ownership | Security |
| Refund helpers | Booleans used as policy | Replace; do not extend with flags | Design conflict |
| Offer timeout “30 s” in this audit prompt | Not in code | **Not approved** in master spec (Unresolved) | Do not implement as confirmed |

## 7. Recommended implementation order

Aligned with master spec §17, adjusted for financial safety first:

1. **Replace booking/refund policy surface** — new transition module for target statuses; new refund decision function matching the matrix; leave legacy booleans unused. Schema migration for statuses/clocks/history when approved to migrate.
2. **Auth sessions** — OTP, refresh rotation, HS256 pin, mount `authenticate` / ownership.
3. **Staff grants + MFA decision** — before admin review routes go live.
4. **Identity + vehicles + zone approvals** — encrypted Ghana Card path, object storage, `OKADA`/`PRAGYA`/`ABOBOYAA`, per-zone approval.
5. **Paystack + wallet** — webhook events, immutable payments, locked ledger, `token_packs`, fee refund table.
6. **Matching + search** — unpaid 10-minute job, search 5-minute job, eligibility, batches (blocked on Unresolved offer timeout/sort until decided).
7. **Trip + disputes** — `IN_PROGRESS`, completion, ack, trip GPS log, 24-hour disputes.
8. **Notifications after commit** — SMS OTP first; push when vendor chosen.

Polygon data is an operations input to step 6, not code invention.

## 8. Dependencies between backend modules

Approved direction (from architecture docs); current constructors do not yet call across modules:

```text
audit, notifications, service-zones  (leaves / shared facts)
        ^
auth, users
        ^
riders, locations, wallet, payments
        ^
matching  (needs riders + locations + wallet + zones)
        ^
bookings  (orchestrates matching, payments, wallet, notifications, audit)
        ^
admin     (may call others; requires grants)
```

Critical transaction coupling when built:

- **Accept:** bookings + matching + wallet debit + rider availability, one Prisma transaction with row locks.
- **Fee success webhook:** payments → bookings `SEARCHING` → matching first batch.
- **Cancel/expire:** bookings → refund policy → payments refund and/or wallet refund → notifications.

## 9. Critical security and financial risks

| Risk | Why it matters now | Mitigation when implementing |
| --- | --- | --- |
| Plaintext `ghana_card_number` column | Ready to store PII incorrectly | Never write it; migrate to encrypted store; drop column when empty |
| Boolean refund helpers vs matrix | Wrong money if wired as-is | Replace before any cancel/expire path |
| No row locks / no accept transaction | Double accept / lost token updates | `FOR UPDATE` + conditional status update + one-debit index |
| `ON DELETE SET NULL` on payment/ledger booking FKs | Detach financial history | Tighten to `RESTRICT` in a future migration |
| Financial CHECKs outside Prisma schema | Later `migrate`/`db push` can drop them | Guard migrations; never `db push` blindly |
| JWT algorithm not pinned | Future algo confusion | `algorithms: ['HS256']` on sign/verify |
| Auth middleware unmounted | First unfinished route could be public | Mount before registering handlers |
| Single `ADMIN` role | Over-broad access if used for finance refunds | Grants + explicit refund permission |
| Webhook event id only on payment row | Replay / second event mishandled | `payment_webhook_events` |
| Empty Paystack/SMS secrets allowed in non-production | Easy to ship broken or insecure staging | Production refine before go-live |
| Matching without zone approval table | Any approved rider worldwide could be offered | Require `rider_zone_approvals` + active zone |

## 10. Recommended first implementation task

**Task:** Implement **phone OTP authentication and refresh-session lifecycle** against the existing helpers (`otp.ts`, `tokens.ts`, `authenticate`), with HS256 pinning and mounted routes — **without** wiring bookings, payments, or the legacy refund booleans.

Why first:

1. Almost every later route needs a real `PASSENGER` / `RIDER` identity.
2. Helpers and Zod schemas already exist; repositories are empty shells waiting for Prisma writes.
3. Avoids starting with money or matching while the refund matrix and offer-timeout Unresolved items are still dangerous.
4. Unblocks Flutter from the local `123456` stand-in.

Exit criteria for that task:

- `POST /auth/otp`, `/auth/otp/verify`, `/auth/refresh`, `/auth/logout` registered and tested.
- OTP hashed; attempt/expiry/resend enforced.
- Refresh rotated and revocable.
- Access JWT verified with `HS256` only.
- Suspended users rejected after DB status check.
- SMS adapter still may be a logged stub in development, but the service path must not accept a fixed server test code.

Do **not** start matching or Paystack as the first milestone: they depend on unpaid/search clocks, the refund matrix replacement, zone approvals, and (for matching) the still-Unresolved per-offer timeout and batch sort order.

---

## Reconciliation matrix (approved items)

| Approved rule | Backend status |
| --- | --- |
| Successive batches ≤ 3 | Not implemented |
| Offer response timeout | **Unresolved** (do not treat 30 s as approved) |
| Immediate next batch when all three reject | Not implemented (depends on batch loop + Unresolved timeout) |
| 5-minute search deadline | Not implemented (no `SEARCHING` / `search_expires_at`) |
| 5 km radius | Not implemented |
| GPS freshness 30 s | Partial helper + constant; not used by matching |
| 10-minute unpaid timeout | Not implemented |
| Separate fee and token refunds | Partial intent (indexes/keys); no refund table or service; booleans conflict |
| Immutable financial records | Partial DB constraints; no app enforcement / no revoke DELETE |
| Four admin roles | Not implemented |
| Manual Ghana Card verification | Partial `PENDING_REVIEW` enum; no secure storage or review path |
| Tricycle and Car | Not implemented |
| DB-configurable token packages | Not implemented |
| Suspension / availability rules | Partial suspend schema + availability enum; services unimplemented |
| Service-zone approval | Zones table Partial; rider-zone approval Not implemented |
| 24-hour disputes | Not implemented |

## Test coverage snapshot

| Suite | What it proves |
| --- | --- |
| `tests/foundation.test.ts` | Health, 404 envelope, validation, pagination, realtime event names |
| `tests/domain.test.ts` | Env guards, JWT round-trip, Paystack signature, OTP helpers, **legacy** booking transitions and refund booleans, GPS freshness, zone geometry |
| `modules/*/module.test.ts` | Each service still throws `NOT_IMPLEMENTED` |

There is **no** integration test that posts OTP, creates a booking, captures a fee, or accepts an offer against Postgres.

## Environment configuration

`.env.example` covers DB, CORS, JWT, OTP, Paystack, SMS, push, maps stubs, rate limits. Production rejects placeholder JWT/OTP secrets. Paystack/SMS may be empty outside that refine. Maps env vars must not be pointed at a hosted Cyrlo Maps API in this phase.

## Verdict

The backend is a **sound modular-monolith skeleton** with important pure helpers and financial SQL guards, but it is **not implementation-ready for booking, matching, or money**. The largest readiness gaps are: target booking lifecycle not in schema or transitions; refund policy conflict; missing RBAC/grants; missing secure identity and vehicle/zone models; empty HTTP surface.

**Ready to start:** auth/session milestone (first task above), after agreeing not to wire legacy refund booleans.

**Not ready without product decisions:** matching batch loop (per-offer timeout + sort order), MFA method, identity key manager / object storage, sourced zone polygons.

**Do not silently approve** a 30-second offer timeout from this audit prompt; treat it as Unresolved unless the product owner confirms it in writing against the master spec.
