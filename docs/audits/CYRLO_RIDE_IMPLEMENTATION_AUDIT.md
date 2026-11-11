# Cyrlo Ride — Implementation Audit and Test Readiness Report

**Audit date:** 2026-11-11  
**Auditor role:** read-only inspection (no feature work, schema changes, deploys, SMS, payments, or zone activation)  
**Local HEAD:** `8261244af17b01e9790c5146ce3da7098ca1d6c4` (`main`)  
**Staging HEAD:** `8261244af17b01e9790c5146ce3da7098ca1d6c4` (matches local)  
**Working tree:** clean for tracked product code; untracked local VPS helper scripts and `docs/deployment/PHASE_13D_PILOT_CONFIGURATION_AUDIT.md` only

---

## A. Executive summary

Cyrlo Ride’s **backend is substantially built** as a modular monolith: OTP auth, admin MFA/RBAC, rider onboarding, booking fee + matching + trip execution, Paystack webhooks/refunds, rider token wallet, notifications outbox, Cyrlo Maps proxy, and nationwide geo hierarchy with zone lifecycle.

The **largest gap is end-to-end passenger ride UX and client/server trip recovery**:

1. Flutter’s live booking flow exists but is **not wired into any UI entry point**; the reachable “request ride” path **simulates payment**.
2. After offer accept, the API does **not expose a rider-facing assigned-booking read** (pickup/destination), and passenger booking views lack rider identity/vehicle details.
3. Socket.IO on the client is **never connected**; booking lifecycle events are largely **not emitted** from the server.
4. Passenger nearby-supply is **empty by design** (no demo pins, no live feed).
5. Pilot geo is seeded but **not bookable**: Kokobin zone is `LOCKED` / inactive; Ahenema Kokoben community is `UNVERIFIED`.

**Staging is aligned with `8261244`**, healthy (Ride + Maps + DB), with Vynfy SMS and FCM HTTP v1 marked ready. Staging has **live Paystack keys present** (name confirmed only) — treat financial tests as high risk.

**Safe local results this audit:**

| Suite | Result |
| --- | --- |
| Backend non-DB Vitest | **257/257 passed** (34 files) |
| Backend `*.db.test.ts` | **Not run** (requires shared local Postgres; would write DB rows) |
| Flutter `flutter test` | **15 passed, 3 failed** (widget/OTP and one ride-session test) |

---

## B. Feature implementation matrix

Status legend: **IMPLEMENTED** | **PARTIALLY IMPLEMENTED** | **NOT IMPLEMENTED** | **BROKEN** | **BLOCKED** | **UNTESTED** | **TESTED** (automated evidence in this audit or dedicated suite).

| Module | Feature | Implementation | Test status | Evidence | Outstanding issues |
| --- | --- | --- | --- | --- | --- |
| Auth | OTP request/verify, create-on-verify | IMPLEMENTED | TESTED (unit); live OTP historically verified on staging | `backend/src/modules/auth/*` | Live SMS not re-sent this audit |
| Auth | Refresh rotation / logout | IMPLEMENTED | TESTED (unit/DB files exist) | `AuthRepository.rotateRefreshSession` | — |
| Auth | Passwords | NOT IMPLEMENTED | — | No schema column | OTP-only by design |
| Auth | Suspension on REST | IMPLEMENTED | TESTED (unit/DB) | `requireActiveAccount` | Socket handshake does not re-check suspension |
| Auth | Admin MFA + RBAC | IMPLEMENTED | TESTED (unit) | `modules/admin/*`, `permissions.ts` | Refreshed access tokens lose `mfa` claim → staff re-auth every access TTL |
| Users | Passenger profile | IMPLEMENTED | TESTED (unit) | `modules/users/*` | — |
| Users | Soft delete | PARTIALLY IMPLEMENTED | UNIT | `users/module.repository.ts` | No active-trip guard |
| Passenger | Saved locations | NOT IMPLEMENTED | — | No module | Only profile home fields |
| Passenger | Booking create/list/cancel | IMPLEMENTED (API) | TESTED (unit + DB files) | `modules/bookings/*` | Flutter UI not wired to live create |
| Passenger | Fare estimate | NOT IMPLEMENTED | — | Maps estimate not used by bookings | Fixed GHS 1.00 booking fee only |
| Passenger | Assigned rider details | NOT IMPLEMENTED | — | `toBookingView` has `riderId` only | — |
| Rider | Onboarding / identity / vehicles | IMPLEMENTED | TESTED (unit) | `modules/riders/*` | Flutter live path UNTESTED E2E |
| Rider | Online/offline + GPS | IMPLEMENTED | TESTED (unit/DB files) | `locations/*`, availability | GPS retention constant not enforced by job |
| Rider | Token wallet | IMPLEMENTED | TESTED (DB file exists) | `modules/wallet/*` | Not “earnings”; off-platform fare |
| Rider | Assigned booking GET | NOT IMPLEMENTED | — | No rider booking read after accept | Critical for trip UX / restart |
| Matching | Radius 5 km, batch 3, offers | IMPLEMENTED | TESTED (unit/DB files) | `matching/*`, `constants.ts` | Batch order by riderId, not nearest |
| Matching | Offer timeout env | IMPLEMENTED | UNIT | `offer-timeout.ts` | Staging has `RIDER_OFFER_RESPONSE_TIMEOUT_SECONDS` set |
| Matching | Retries / no-rider | PARTIALLY / IMPLEMENTED | DB files | workers + `expireSearch` | No re-offer to same rejector; wait until search expiry |
| Trip | ACCEPTED→IN_PROGRESS→COMPLETED | IMPLEMENTED | DB files | `booking-rules.ts`, trip services | No ARRIVING/ARRIVED states |
| Trip | Passenger cancel after accept | PARTIALLY | DB files | support review request | Booking not auto-cancelled |
| Payments | Paystack init + webhook HMAC | IMPLEMENTED | UNIT + DB files | `payments/*` | **Live keys on staging** |
| Payments | Refunds + MFA gate | IMPLEMENTED | DB files | `refund-processor.ts` | Do not run live refunds |
| Payments | Transaction poll fallback | NOT IMPLEMENTED | — | `fetchTransaction` unused | Lost webhook risk |
| Payments | Commissions | NOT IMPLEMENTED | — | — | Fee + token model only |
| Notifications | Vynfy SMS | IMPLEMENTED | UNIT | `infrastructure/sms/*` | Staging ready=true |
| Notifications | FCM HTTP v1 + outbox | IMPLEMENTED | UNIT/DB files | push + outbox worker | Staging push ready=true |
| Notifications | Socket booking events | PARTIALLY | none | `realtime/socket.ts` | Few events emitted; Flutter never connects |
| Maps | Cyrlo Maps HTTP client + `/maps/*` | IMPLEMENTED | UNIT (12) | `cyrlo-maps.client.ts`, `modules/maps/*` | Module routes lack dedicated HTTP tests |
| Maps | Flutter Ride proxy gateways | IMPLEMENTED | UNTESTED live | `ride_maps_gateway.dart` | Search/route unused by ride screens |
| Geo | Hierarchy + import + lifecycle | IMPLEMENTED | UNIT (geo 25+, zones 25+) | `modules/geo/*`, `service-zones/*` | No overlap prevention at activate |
| Admin UI | Web dashboard | NOT IMPLEMENTED | — | `admin/README.md` | API contract documented |
| Flutter | Auth → home shells | IMPLEMENTED | PARTIAL (widget failures) | `features/auth/*` | 2 widget tests failing |
| Flutter | Live booking UX | PARTIALLY | NOT wired | `live_booking_flow.dart` | Simulated fee path is what users reach |
| Flutter | Nearby riders | NOT IMPLEMENTED | — | empty provider | — |
| Flutter | FCM display/tap | PARTIALLY / BLOCKED | — | registration only | Needs real Firebase files |
| Flutter | Socket.IO | NOT IMPLEMENTED | — | never `connect()` | — |

---

## C. Maps and geospatial report

### C.1 Cyrlo Maps API integration (Ride → Maps)

| Capability | Status | Notes |
| --- | --- | --- |
| Forward geocode | IMPLEMENTED | `POST /v1/geocode` via `HttpCyrloMapsClient` |
| Reverse geocode | IMPLEMENTED | `POST /v1/geocode/reverse` |
| Place search | IMPLEMENTED | `POST /v1/places/search` |
| Routes | IMPLEMENTED | `POST /v1/routes` |
| Route estimate | IMPLEMENTED | `POST /v1/routes/estimate` |
| Auth | IMPLEMENTED | `Authorization: Bearer <secret>` (not Mapbox token) |
| Timeouts / 401 / 429 | IMPLEMENTED | Mapped to `AppError`; key not logged |
| Ride proxy | IMPLEMENTED | `/api/v1/maps/*` requires user JWT |
| Env | IMPLEMENTED | `CYRLO_MAPS_BASE_URL`, `CYRLO_MAPS_API_KEY` on staging |
| Booking wiring | NOT IMPLEMENTED | Estimate not used for fare |

**Staging readiness:** `maps.configured=true`, `adapter=cyrlo-maps-http`. Maps `/health` and `/ready` return 200 (read-only check this audit).

**Prior live verification (2026-11-08 integration):** authenticated geocode/reverse/places/estimate succeeded; unauthenticated Maps rejected. Not re-run with privileged calls this audit beyond health.

### C.2 Flutter mapping

| Item | Finding |
| --- | --- |
| `USE_RIDE_MAPS_PROXY` | Default **true** |
| Privileged geocode/search/routes | Via Ride proxy when flag true |
| Direct Mapbox Directions | Only if proxy **false** and public `pk.` token present |
| Hardcoded Maps API keys | **None found** in app source |
| `CYRLO_MAPS_API_TOKEN` | Defaults empty; client constructed with `apiKey: ''` |
| Tile token | `--dart-define` or authenticated `GET /maps/config` → `mapboxPublicToken` |
| Staging `MAPBOX_ACCESS_TOKEN` | **Not present** as env name; tiles may rely on config fallback / OSM |
| UI usage | Reverse geocode used on passenger details; **place search & route preview not used** by booking screens |

### C.3 Geographical hierarchy and pilot data (staging DB, read-only)

| Entity | Count / state |
| --- | --- |
| Countries | 1 — **Ghana** |
| Regions | 1 — **Ashanti Region** |
| Districts | 1 — **Atwima Kwanwoma District** |
| Communities | 1 — **Ahenema Kokoben** (`ahenema-kokoben`), `UNVERIFIED`, **no boundary**, **no center** |
| Service zones | 1 — **Kokobin**, `LOCKED`, `is_active=false`, boundary `VERIFIED`, linked to community |
| Active / bookable zones | **0** |
| Surrounding communities | **Not present** (not invented) |

Applied Prisma migrations on staging: **17** (matches repo migration count).

### C.4 Zone lifecycle & booking eligibility

- Statuses: `DRAFT`, `UNDER_REVIEW`, `LOCKED`, `ACTIVE`, `SUSPENDED`.
- Activate requires verified boundary + verified community + active parents.
- Booking pickup uses `isActive` + `status=ACTIVE` + point-in-polygon.
- Overlap: deterministic smallest bbox then oldest `createdAt` — **no create-time overlap prevention**.
- Parent geo deactivation does **not** cascade to active zones.

---

## D. Database and architecture report

### D.1 Topology

- Single Node process (`cyrlo-ride-api`) + Postgres + Socket.IO on same HTTP server.
- Maps is a separate service (`cyrlo-maps-api`).
- Flutter app defaults to `https://cyrloride.eqostack.com/api/v1`.

### D.2 Major model groups (Prisma)

Identity/auth: `User`, OTP, refresh families, admin grants/MFA.  
Rider: profile, identity secrets, vehicles, documents, locations, zone approvals.  
Geo: `Country`, `Region`, `District`, `Community`, `ServiceZone`.  
Booking: `Booking`, offers, status history, trip GPS points, cancellation requests, disputes.  
Money: `Payment`, webhooks, refunds, reconciliation, token packages/purchases, rider wallet ledger.  
Notifications: in-app, outbox, deliveries, device tokens.  
Audit: `AuditLog`.

### D.3 Migrations

17 migrations from `20261106170000_init` through `20261111120000_nationwide_geo_hierarchy`. Staging applied count: **17**.

### D.4 API mounts (`/api/v1`)

`/health`, `/auth`, `/users`, `/riders`, `/bookings`, `/matching`, `/locations`, `/maps`, `/payments`, `/wallet`, `/notifications`, `/admin/*`, `/admin/geo`, `/service-zones`, `/admin/service-zones`, `/audit` (**empty router**).

### D.5 Trip state machine (backend)

```
AWAITING_PAYMENT → SEARCHING | PAYMENT_FAILED | CANCELLED
SEARCHING → ACCEPTED | EXPIRED | CANCELLED
ACCEPTED → IN_PROGRESS | CANCELLED
IN_PROGRESS → COMPLETED | CANCELLED
```

**Missing product states:** rider arriving / arrived at pickup (not modeled).  
**Constants:** booking fee 100 pesewas; search 5 min; matching radius 5 km; batch 3; GPS freshness 30 s.

---

## E. Test inventory

### E.1 Backend

| Class | Files | This audit |
| --- | --- | --- |
| Non-DB unit | 34 files | **257 passed** |
| DB integration `*.db.test.ts` | 12 files | **Skipped** — needs local Postgres; writes data |
| Maps client | `cyrlo-maps.client.test.ts` | Included in 257 |
| Geo | `geo/module.test.ts` | Included |
| Service zones | `service-zones/module.test.ts` | Included |

**DB suites (exist, not executed here):** auth, bookings, trip, matching, payments/refunds, wallet, notifications, locations, disputes, admin suspend, service-zones.

**Skipped intentionally:** any test that would send SMS, charge Paystack, refund, or create live rider-facing bookings on staging.

### E.2 Flutter

| File | Intent | This audit |
| --- | --- | --- |
| `test/widget_test.dart` | Passenger/rider onboarding shells | **2 failures** (OTP success widget missing) |
| `test/ride_session/rider_accept_job_test.dart` | Offer accept clears siblings | **Failed** |
| `test/mapping/*` | Geo helpers / unavailable gateways | Covered in +15 pass set |
| `test/contract_test.dart` | Event names / ApiException | Covered |
| `test/messaging/ride_sms_gateway_test.dart` | Dev SMS gateway | Covered |

**Totals observed:** 15 passed, 3 failed. No device/integration tests. No live API tests.

### E.3 CI

`.github/workflows/ci.yml` — test/typecheck oriented; deploy remains manual (`ops/deploy/*`).

---

## F. Deployment comparison

| Item | Local | Staging |
| --- | --- | --- |
| Git commit | `8261244` | `8261244` |
| Ride service | n/a | **active** |
| Maps service | n/a | **active** |
| Ride health/ready | n/a | **200 / 200** |
| Maps health/ready | n/a | **200 / 200** |
| Migrations applied | 17 in repo | **17** |
| Maps configured | code | **true** (`cyrlo-maps-http`) |
| SMS | code | Vynfy **ready** |
| Push | code | FCM HTTP v1 **ready** |
| Untracked local only | VPS helper scripts, Phase 13D doc | not on product path |

**Env key names present on staging (values not read):** includes `PAYSTACK_*`, `VYNFY_*`, `CYRLO_MAPS_*`, `FCM_*`, `BUNNY_*`, `RIDER_OFFER_RESPONSE_TIMEOUT_SECONDS`, JWT/OTP/encryption keys, `TRUST_PROXY*`.  
**Absent as named key:** `MAPBOX_ACCESS_TOKEN` (tile token may still be supplied via other documented fallbacks).

**Docs drift:** some architecture docs still describe booking as NOT_IMPLEMENTED; OpenAPI document is largely health-only — **do not treat docs as source of truth over code**.

---

## G. Security and financial risk report

1. **Live Paystack credentials on staging** — any careless “smoke charge” hits real money rails. Refund/webhook tests must stay on fixtures or mock clients.
2. **OTP / Vynfy live** — do not blast SMS during QA; use allowlisted static OTP accounts only if configured (`OTP_STATIC_LOGINS` key exists — treat as sensitive).
3. **Maps API key** server-side only — Flutter audit found no embedded Maps secret; keep it that way.
4. **Admin MFA refresh gap** — refreshed tokens lack `mfa` claim; sensitive admin actions may fail until full re-login.
5. **Account-status enumeration** — lighter rate limiting than OTP route.
6. **Tokens in SharedPreferences** — not hardware-backed secure storage.
7. **Audit read API empty**; several RBAC permissions defined but unused by routes.
8. **Duplicate booking risk** — no passenger idempotency / single-active-booking constraint at create.
9. **Lost Paystack webhook** — no polling reconciliation.

---

## H. Missing and incomplete features (verified)

1. Flutter passenger **live booking UI wiring** (destination pick, estimate, Paystack for real create).
2. Flutter **nearby riders** supply feed.
3. Backend **rider assigned-booking read** + passenger **rider/vehicle display**.
4. Trip states **arriving/arrived**; Socket.IO **booking/offer events** + Flutter connect.
5. **Fare engine** (Maps estimate unused by bookings).
6. **Saved locations**, passenger wallet, rider **earnings** ledger.
7. **Paystack transaction poll** fallback.
8. Admin **web dashboard**; audit **list API**.
9. Surrounding Atwima Kwanwoma communities / verified polygons — **not in DB**.
10. Zone **activation** for Kokobin — intentionally not done; community still UNVERIFIED.
11. Flutter FCM **UI/tap routing** + checked-in Firebase config files.
12. Several Flutter widget tests currently **failing**.

---

## I. Recommended testing sequence

Order by dependency and risk (still avoiding live charges/SMS where possible):

1. **Backend unit (already green)** — keep as PR gate.  
2. **Backend DB suite on disposable DB** — auth → zones → bookings → matching → trip → wallet → refunds (mock Paystack).  
3. **Maps proxy with staging JWT** — geocode/search/estimate against `/api/v1/maps/*` (no Mapbox token in client).  
4. **Geo admin** — hierarchy read, refuse activate without verification; confirm Kokobin stays non-bookable.  
5. **OTP** — static review accounts only; one controlled Vynfy send if required.  
6. **Flutter** — fix failing widget tests; then manual Android/iOS dogfood of auth + rider online/GPS + offers against staging.  
7. **Booking E2E** — only after Flutter live booking is wired; use isolated test riders; Paystack test discipline (staging has **live** keys — prefer explicit approval).  
8. **Refund path** — mock/provider sandbox only unless finance signs off.  
9. **Push** — after Firebase files present; no mass sends.  
10. **Admin dashboard** — after API contract stabilization.

---

## J. Prioritized work backlog

### 1. Critical blockers
- Wire Flutter `startLiveBookingFlow` (or replace simulated fee path).
- Rider API: fetch assigned booking (pickup/destination) after accept; passenger rider/vehicle payload.
- Fix failing Flutter widget tests (OTP success key / accept-job).
- Decide nearest-first matching vs current riderId ordering.

### 2. Core ride-hailing functionality
- Destination search + route preview in passenger UX (already have proxy gateways).
- Emit + consume booking/offer Socket events (or document poll contract).
- Duplicate-booking / idempotency guard.
- Passenger cancel-after-accept product behavior clarity.
- Paystack webhook reconciliation poll.

### 3. Maps and geospatial
- Keep proxy-only privileged calls; supply public tile token path on staging.
- Verify community then Ops-approved zone activation for Kokobin.
- Research/import surrounding communities with **sourced** boundaries only.
- Overlap policy enforcement at activation; hierarchy deactivate cascade decision.

### 4. Operational readiness
- Retain/cleanup jobs for trip GPS and documents.
- MFA refresh token claims for admin.
- Tighten `/auth/account-status` limiting.
- Align OpenAPI and architecture docs with code.
- Staging financial runbook (live Paystack).

### 5. Admin dashboard work
- Build UI on `docs/architecture/NATIONWIDE_GEO_ADMIN_CONTRACT.md`.
- Verification queue, map boundary preview via Ride maps proxy, audit history viewer.

### 6. Future improvements
- Fare/pricing engine; commissions reporting.
- Saved places; trip sharing / SOS.
- Secure token storage; minify/release hardening.
- ARRIVING/ARRIVED states; turn-by-turn rider navigation.

---

## Appendix — Commands run (safe)

- `git status` / `git log` / `git rev-parse`
- `npx vitest run --exclude "**/*.db.test.ts"` → 257 passed
- `flutter test` → 15 passed, 3 failed (after restoring `pubspec.lock`)
- Read-only SSH: service status, health/ready, env **key names**, geo/zone counts (no restarts, no secret printing)

## Appendix — Explicitly not done

- No schema/code product changes for features  
- No deploys / service restarts  
- No zone activation  
- No SMS sends  
- No Paystack charges/refunds  
- No live booking creation against real riders  

---

*End of audit.*
