# Cyrlo Ride — Phase 3 Discovery Report  
## Booking and Trip Management (READ-ONLY)

**Date:** 2026-11-12  
**Branch:** `feature/admin-phase-0`  
**HEAD:** `44bf7b997fd106f0ee3ea270288bb9430c7e9b1f` (`feat(admin): complete phase 2 passenger management`)  
**Mode:** READ-ONLY discovery (this report only; no source/API/migration/deploy/stash changes)  
**Working tree at discovery start:** clean  
**Ghana/maps stash:** intact (`stash@{0}: wip-ghana-maps-preserve-phase0`)

**Naming note:** `ADMIN_IMPLEMENTATION_ROADMAP.md` labeled bookings under **Phase 4 — Live operations and bookings**. This project phase is **Phase 3 — Booking and Trip Management** per current plan. Passenger/rider UI already shipped in Phases 1–2.

---

## 1. Executive Summary

**Backend booking browse APIs already exist** (Phase 0 console). Phase 3 is primarily an Admin SPA integration onto:

| Capability | Backend | Admin SPA |
| --- | --- | --- |
| Global booking directory (filters + pagination) | **Exists** `GET /admin/bookings` | Placeholder `/bookings` |
| Booking detail (payments + status timeline) | **Exists** `GET /admin/bookings/:bookingId` | Missing |
| Passenger nested booking/cancellation history | **Exists** (Phase 2 UI) | Done |
| Exact GPS trail | **Exists** MFA-gated trip-gps | Not in ordinary screens |
| Dedicated admin “force cancel / reassign / complete” | **No** dedicated booking admin mutations | N/A |
| Live SEARCHING / offers board | **Missing** | Defer |
| Free-text booking search (`q`) | **Missing** | Filter by ids/status/dates only |

**No new backend endpoints are required** for a first Booking Directory + Booking Detail UI that mirrors passenger/rider patterns, if Phase 3 stays within ordinary `ViewBookingHistory` contracts and does **not** invent administrative trip mutations.

**Administrative actions that do exist** live under Support/disputes (cancellation-request recommend with optional `cancelBooking`, dispute recommend, trip-gps). Those belong in Support phase scope unless Phase 3 explicitly includes a narrow deep-link.

---

## 2. Existing Booking and Trip Architecture

### 2.1 Modules and mounts

| Area | Path | Mount |
| --- | --- | --- |
| Passenger/rider booking lifecycle | `backend/src/modules/bookings/` | `/api/v1/bookings` (non-admin) |
| Transition / refund matrix | `backend/src/modules/bookings/booking-rules.ts` | Shared domain rules |
| Connection-fee race helpers | `backend/src/modules/bookings/connection-fee-lifecycle.ts` | Pure helpers |
| Admin console list/detail | `backend/src/modules/admin/console.{schema,repository,service,controller}.ts` | `/api/v1/admin` via `module.routes.ts` |
| Disputes / cancel-review / trip-gps | `backend/src/modules/disputes/` | `/api/v1/admin` via `createDisputesAdminRouter` (`app.ts`) |

### 2.2 Core models (`backend/prisma/schema.prisma`)

- **`Booking`** — status, passenger/rider/zone FKs, pickup/destination labels + lat/lng columns, `bookingFeePesewas` (GH₵1 connection fee), payment/search expiry, lifecycle timestamps, `cancellationReason`, `cancellationActorType`.
- **`BookingStatusHistory`** — append-only transitions (`fromStatus`, `toStatus`, `actorType`, `actorId`, `reason`).
- **`BookingOffer`** — matching offers (`PENDING` → accept/reject/timeout/invalidate…).
- **`TripLocationPoint`** — append-only GPS trail for assigned trips (dispute evidence).
- **`BookingCancellationRequest`** — post-accept passenger cancel review queue.
- **`Dispute` / `DisputeEvent`** — post completion/cancel disputes.
- **`Payment`** — connection fee rows (`purpose: BOOKING_FEE`); not transportation fare.

### 2.3 Status enums

**`BookingStatus`:**  
`AWAITING_PAYMENT` · `PAYMENT_FAILED` · `SEARCHING` · `ACCEPTED` · `IN_PROGRESS` · `COMPLETED` · `EXPIRED` · `CANCELLED`

**`BookingOfferStatus`:**  
`PENDING` · `ACCEPTED` · `REJECTED` · `TIMED_OUT` · `INVALIDATED` · `EXPIRED` · `CANCELLED`

**`CancellationRequestStatus`:**  
`OPEN` · `UNDER_REVIEW` · `RESOLVED` · `DECLINED` · `ESCALATED`

**`SupportRecommendation`:**  
`NONE` · `REFUND_FEE` · `NO_REFUND` · `ESCALATE`

**Actors (`BookingActor`):** `PASSENGER` · `RIDER` · `ADMIN` · `SYSTEM`

### 2.4 Destination-free product model

Destination is optional/legacy. Admin ordinary DTOs expose `pickupLabel` (list) and `destinationLabel` (detail only). Exact lat/lng columns exist in DB but are **not selected** on admin console booking queries.

Connection fee is a fixed GH₵1 (`bookingFeePesewas`), not a transport fare. Overview/analytics already exclude transportation fare revenue.

---

## 3. Booking Lifecycle and Status Transitions

Source of truth: `backend/src/modules/bookings/booking-rules.ts` (`bookingTransitions`).

| From | To | Allowed actors |
| --- | --- | --- |
| `AWAITING_PAYMENT` | `SEARCHING` | SYSTEM |
| `AWAITING_PAYMENT` | `PAYMENT_FAILED` | SYSTEM |
| `AWAITING_PAYMENT` | `CANCELLED` | PASSENGER, ADMIN, SYSTEM |
| `PAYMENT_FAILED` | — | terminal |
| `SEARCHING` | `ACCEPTED` | RIDER |
| `SEARCHING` | `EXPIRED` | SYSTEM |
| `SEARCHING` | `CANCELLED` | PASSENGER, ADMIN, SYSTEM |
| `ACCEPTED` | `IN_PROGRESS` | RIDER |
| `ACCEPTED` | `CANCELLED` | PASSENGER, RIDER, ADMIN, SYSTEM |
| `IN_PROGRESS` | `COMPLETED` | RIDER |
| `IN_PROGRESS` | `CANCELLED` | RIDER, ADMIN, SYSTEM |
| `COMPLETED` / `EXPIRED` / `CANCELLED` | — | terminal |

### Non-admin HTTP lifecycle (`/api/v1/bookings`)

| Action | Method | Who |
| --- | --- | --- |
| Create | `POST /` | Passenger (or rider-as-passenger auth exception in router) |
| List / get own | `GET /`, `GET /:id` | Passenger auth |
| Cancel (pre-accept path) | `POST /:id/cancel` | Passenger auth |
| Cancel after accept | `POST /:id/cancel-after-accept` | Passenger only |
| Start trip | `POST /:id/start` | Rider |
| Complete trip | `POST /:id/complete` | Rider |
| Rider cancel | `POST /:id/rider-cancel` | Rider |
| Unable to complete | `POST /:id/unable-to-complete` | Rider |
| Acknowledge completion | `POST /:id/acknowledge` | Passenger |

### Admin vs rider/passenger

| Action | Admin support today |
| --- | --- |
| Browse/list/filter bookings | **Yes** — read APIs |
| View detail + status history + payments | **Yes** — read APIs |
| Create / accept / start / complete booking | **No** admin routes |
| Dedicated “admin cancel booking” endpoint | **No** |
| Cancel via Support cancellation-request review (`cancelBooking: true`) | **Yes** — Support module only |
| Reassign rider / force accept | **No** |
| View exact trip GPS | **Yes** — separate MFA-gated endpoint |
| Live matching/offers board | **No** API |

**Important:** Transition tables allow `ADMIN` actor on some cancels, but there is **no** general admin booking mutation that exercises those paths except Support’s cancellation-request recommend flow.

---

## 4. Backend API Contract Inventory

Base: `/api/v1`. Admin console router: `backend/src/modules/admin/module.routes.ts`. Disputes admin router: `backend/src/modules/disputes/module.routes.ts`.

### 4.1 Ordinary booking console (Phase 3 core)

| Method | Endpoint | Permission | Recent MFA | Query / body | Response highlights |
| --- | --- | --- | --- | --- | --- |
| `GET` | `/admin/bookings` | `ViewBookingHistory` | No | `page`, `pageSize` (default 20, max 100); optional `status`, `passengerId`, `riderId`, `serviceZoneId`, `from`, `to` (ISO datetime). **No `q`.** Sort fixed `createdAt desc`. | `{ items[], pagination, privacy }` — see fields below |
| `GET` | `/admin/bookings/:bookingId` | `ViewBookingHistory` | No | `bookingId` UUID | List fields + `destinationLabel`, `cancellationActorType`, `serviceZone`, `payments[]`, `statusHistory[]`, `privacy` |

**List item fields** (`AdminConsoleService.toBookingListItem`):  
`id`, `status`, `vehicleCategory`, `passengerId`, `riderId`, `serviceZoneId`, `pickupLabel`, `bookingFeePesewas`, `paymentExpiresAt`, `searchExpiresAt`, `createdAt`, `acceptedAt`, `startedAt`, `cancelledAt`, `completedAt`, `cancellationReason`, `exactCoordinatesIncluded: false`,  
`passenger{id,phoneNumber,displayName,status}`,  
`rider{id,fullName,phoneNumber,status}|null`,  
`connectionFeePayment{id,status,amountPesewas,currency,providerReference,createdAt}|null`

**Detail extras:**  
`destinationLabel`, `cancellationActorType`,  
`serviceZone{id,name,status,isActive}|null`,  
`payments[{id,purpose,status,amountPesewas,currency,providerReference,createdAt}]`,  
`statusHistory[{fromStatus,toStatus,actorType,createdAt}]` — **note:** ordinary detail omits history `actorId` / `reason` (present on dispute evidence path).

**Privacy envelope:**  
`privacy.exactCoordinatesIncluded: false` + explanatory `note` referencing MFA-gated trip-gps.

**Schema:** `listAdminBookingsQuerySchema`, `adminBookingIdParamSchema` in `console.schema.ts`.

### 4.2 Related read APIs (already used / adjacent)

| Method | Endpoint | Permission | Notes |
| --- | --- | --- | --- |
| `GET` | `/admin/passengers/:passengerId/bookings` | `ViewBookingHistory` | Nested; lighter item shape (no passenger/rider embeds) |
| `GET` | `/admin/passengers/:passengerId/cancellations` | `ViewBookingHistory` | Cancellation **requests**, not booking status |
| `GET` | `/admin/analytics` | any of MonitorOperations / ViewFinancialReports / InvestigateDisputes / ViewPayments | Period `bookings.byStatus` — Overview already |

### 4.3 Support / GPS / refunds (adjacent — not ordinary Phase 3 screens unless scoped)

| Method | Endpoint | Permission | Recent MFA | Purpose |
| --- | --- | --- | --- | --- |
| `GET` | `/admin/bookings/:bookingId/trip-gps` | `ViewTripGpsEvidence` | **Yes** | Exact lat/lng trail; audits `dispute.trip_gps.viewed` |
| `GET` | `/admin/cancellation-requests` | InvestigateDisputes **or** RecordSupportDecisions | No | Open cancel-review queue |
| `POST` | `/admin/cancellation-requests/:requestId/recommend` | `RecordSupportDecisions` | **Yes** | Recommend refund/no-refund/escalate; optional `cancelBooking` |
| `GET` | `/admin/disputes` | `InvestigateDisputes` | No | Dispute list |
| `GET` | `/admin/disputes/:disputeId` | `InvestigateDisputes` | No | Evidence summary (counts/timestamps; coords via trip-gps) |
| `POST` | `/admin/disputes/:disputeId/recommend` | `RecommendRefunds` | **Yes** | Queues REQUESTED fee refund; does not execute Paystack |

---

## 5. Admin Permissions and Role Access Matrix

Catalog: `backend/src/common/authz/permissions.ts` (mirrored in `apps/cyrlo_admin/src/config/permissions.ts`).

| Capability | Permission | SUPER | OPS | FINANCE | SUPPORT | Recent MFA |
| --- | --- | --- | --- | --- | --- | --- |
| Booking directory / detail | `ViewBookingHistory` | Y | Y | **N** | Y | Staff MFA session only |
| Passenger nested histories | `ViewBookingHistory` | Y | Y | **N** | Y | No |
| Trip GPS evidence | `ViewTripGpsEvidence` | Y | **N** | **N** | Y | **Yes** |
| List cancellation requests | Investigate **or** RecordSupportDecisions | Y | N | N | Y | No |
| Recommend on cancel request (+ optional cancel) | `RecordSupportDecisions` | Y | N | N | Y | **Yes** |
| List/get disputes | `InvestigateDisputes` | Y | N | N | Y | No |
| Dispute refund recommend | `RecommendRefunds` | Y | N | N | Y | **Yes** |
| Execute refunds (Finance) | `ExecuteRefunds` | Y | N | Y | N | (payments module; out of booking browse) |

**Nav today:** `/bookings` gated `ViewBookingHistory` (`nav.ts`) — Finance cannot see Bookings nav. Nested `/bookings/:id` will inherit via `canAccessPath`.

**Do not change** permission catalog or role mappings in Phase 3.

---

## 6. Available Administrative Actions

| Action | Supported? | How |
| --- | --- | --- |
| View booking directory | **Yes** | `GET /admin/bookings` |
| Filter by status / passenger / rider / zone / date | **Yes** | Query schema |
| Free-text search booking id/label | **No** | Would need new API or client-side UUID paste into path |
| View booking detail + timeline | **Yes** | `GET /admin/bookings/:id` |
| View passenger/rider summary on booking | **Yes** | Embedded on list/detail |
| View connection fee payment snapshot | **Yes** | `connectionFeePayment` + detail `payments` |
| View transport fare | **N/A** | Product does not store admin transport fare revenue |
| View exact pickup/dropoff coords | **Ordinary: No** / **Evidence: Yes** | trip-gps only |
| Force cancel / reassign / complete | **No** general admin booking API | |
| Cancel via Support cancel-request review | **Yes** | `cancelBooking` on recommend (Support) |
| Recommend fee refund | **Yes** | Support disputes/cancel-requests → REQUESTED refund |
| Suspend passenger/rider (does not cancel trips) | **Yes** | Existing Phase 1–2 users APIs |

**Audit logging**

| Event | When |
| --- | --- |
| Ordinary booking list/get | **No** per-read audit on console service |
| `dispute.trip_gps.viewed` | Trip GPS fetch |
| `booking.passenger.cancel_request.reviewed` | Cancel-request recommend |
| `dispute.recommendation.recorded` | Dispute recommend |

---

## 7. Data Fields and Sensitive Information

| Data | Ordinary list/detail | Trip-gps / dispute evidence |
| --- | --- | --- |
| Exact pickup/destination lat/lng | **Omitted** | Returned on trip-gps points |
| Pickup / destination labels | Shown (label text may still be sensitive) | N/A |
| Passenger phone / displayName | Shown to ViewBookingHistory roles | — |
| Rider phone / fullName | Shown | — |
| Ghana Card / identity docs | **Not** on booking APIs | Dispute get explicitly omits |
| Passwords / tokens / MFA secrets | **Not** exposed | — |
| Payment provider reference | Shown on fee payment objects | — |
| Status history reason / actorId | **Omitted** on ordinary detail | Present on dispute evidence |

**Security stance for Phase 3 ordinary UI:** never render lat/lng; do not call trip-gps without explicit Support/evidence scope + recent-MFA UX; do not invent fare charts.

---

## 8. Frontend Integration Plan

### Present foundations

| Asset | Reuse |
| --- | --- |
| Nav `/bookings` + `ViewBookingHistory` | Already gated |
| Router `/bookings` | **Placeholder** — replace |
| `PassengersPage` / `RidersPage` | URL query sync, stale `requestId`, ErrorBanner, pagination |
| `PassengerProfilePage` booking table | Field formatting patterns; deep-link target once detail exists |
| `formatGhsFromPesewas` | Connection fee display |
| `BOOKING_STATUSES` (`features/overview/bookingStatuses.ts`) | Status filter options |
| `AccountStatusBadge` / Panel / ConfirmReasonPanel | Status badges; ConfirmReasonPanel only if Support actions in scope |
| Overview booking status panel | Aggregate context, not directory |

### Missing

| Asset | Need |
| --- | --- |
| `api/admin-bookings.ts` | Typed `fetchAdminBookings` / `fetchAdminBooking` |
| Types in `api/types.ts` | List/detail DTOs matching console service |
| `BookingsPage` | Directory UI |
| `BookingDetailPage` | Detail + timeline + payments |
| Router `/bookings/:bookingId` | Nested route |
| Optional links from passenger booking rows | After detail ships |

### Map integrations

No Admin SPA map component for bookings today. Trip-gps is a point list API — map rendering is optional later and **out of ordinary Phase 3** unless Support evidence is scoped. Do not reuse Flutter maps / Ghana stash.

---

## 9. Gaps and Blockers

| Gap | Blocks? | Stance |
| --- | --- | --- |
| FE bookings clients + pages | Blocks Phase 3 UI | **Build** |
| No `q` search on `/admin/bookings` | UX limitation | Document; filter by UUID path or passenger/rider id |
| No live SEARCHING/offers board API | Live ops board | **Defer** (roadmap Phase 4 historically) |
| No admin force-cancel/reassign/complete | Admin trip control panel | **Defer** — do not invent |
| Ordinary statusHistory omits `reason`/`actorId` | Richer timeline | Show available fields; optional future API enrichment only if product asks |
| Detail does not embed offers / cancel-requests / disputes | Related-work panels | Link out to Support queues later; or omit |
| Ops lacks `ViewTripGpsEvidence` | Ops cannot open GPS evidence | Correct per matrix; Support/Super only |
| Finance lacks `ViewBookingHistory` | Finance cannot browse bookings | Correct; keep |

**Blocker for “full trip management console”:** missing mutation APIs. **Not a blocker** for browse/detail Phase 3.

---

## 10. Recommended Implementation Breakdown

### 3A — Booking Directory
- `admin-bookings.ts` + types  
- Replace `/bookings` placeholder with directory: status, passengerId, riderId, serviceZoneId, from/to, pagination, URL sync, stale guard, 401/403  
- Distinguish connection fee vs any fare language  
- Link rows to detail preserving query  

### 3B — Booking Details and Trip Timeline
- `/bookings/:bookingId`  
- Identity embeds, labels, fee payments, timestamps, cancellation fields, `statusHistory` timeline  
- Privacy notes; no lat/lng  
- Cross-links to `/passengers/:id` and `/riders/:id` when permitted  
- Deep-link from passenger profile booking rows  

### 3C — Administrative Actions (optional / narrow)
**Default recommendation: skip or defer.**  
If included, only Support surfaces already backed by APIs (cancellation-request recommend / trip-gps), behind correct permissions + recent-MFA — **not** Ops inventing cancel. Prefer a later Support phase.

### 3D — Security, Regression and Final Review
- Client + page tests (filters, privacy, permissions)  
- Regression: passengers, riders, applications, overview, auth  
- Backend re-run `console.test.ts` / permissions tests (no backend edits)  
- Implementation report  

---

## 11. Testing and Security Requirements

### Frontend (to require at implementation)
- Bookings list: load, empty, filters, date range, pagination, stale, 401, 403, URL sync  
- Detail: load, 404, 403, no coordinate leakage even on hostile payloads  
- Permission: Finance no nav/path; Support/Ops can view; suspend controls absent on booking pages  
- Regression suites green; typecheck + production build  

### Backend regression (re-run only)
- `console.test.ts` — schema + coordinate privacy  
- `console.permissions.test.ts` — ViewBookingHistory gates  
- `console.db.test.ts` if DB available — list filters / privacy  

### Security checklist
- No trip-gps in ordinary Phase 3A/3B  
- No Ghana Card / secrets  
- No permission-map edits  
- No production SMS / Paystack / live cancel mutations during discovery or local FE tests  

---

## 12. Explicitly Deferred Features

- Live operations board (SEARCHING / open offers / fee-pending timers)  
- Admin force cancel / reassign / complete / start  
- Ordinary booking exact coordinates  
- Trip-gps map UI (unless separate Support evidence phase)  
- Full Support disputes / cancellation-request workflow UI  
- Finance booking browser (no permission)  
- Free-text booking search API  
- Embedding offer batches on booking detail  
- Flutter / `apps/cyrlo_app` changes  
- Backend schema/migrations  

---

## 13. Discovery stop

Phase 3 Booking and Trip Management discovery complete.

**Backend readiness for browse/detail: high.**  
**Backend readiness for admin trip mutations: low / Support-adjacent only.**  
**Frontend readiness: patterns ready; bookings clients/pages missing.**

Do not implement until this report is reviewed. No source changes, commits, pushes, deploys, migrations, or stash operations were performed beyond creating this file.
