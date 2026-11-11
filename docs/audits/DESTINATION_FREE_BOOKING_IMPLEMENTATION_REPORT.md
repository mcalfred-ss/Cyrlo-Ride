# Destination-free booking and GH₵1 connection fee

**Date:** 2026-11-11  
**Model:** Cyrlo connects passenger ↔ rider from **pickup only**. Destination and transport fare are agreed directly. Cyrlo collects a fixed **GH₵1 connection fee** when a rider **accepts**.

---

## 1. Files changed (primary)

### Backend
| Area | Files |
| --- | --- |
| Schema / migration | `backend/prisma/schema.prisma`, `backend/prisma/migrations/20261111200000_destination_free_connection_fee/migration.sql` |
| Constants | `backend/src/config/constants.ts` |
| Booking contract | `backend/src/modules/bookings/module.schema.ts`, `module.repository.ts`, `module.service.ts`, `booking-rules.ts` |
| Matching | `backend/src/modules/matching/module.service.ts` |
| Payments | `backend/src/modules/payments/module.service.ts` |
| Composition | `backend/src/composition.ts` (`attachMatching`) |
| API docs | `docs/architecture/API_CONTRACT.md` |
| Tests | `module.test.ts`, `destination-free.unit.test.ts`, `module.db.test.ts` |

### Flutter
| Area | Files |
| --- | --- |
| Trip plan | `passenger_trip_plan.dart` (pickup-only) |
| Map | `passenger_map_screen.dart` |
| Live booking | `live_booking_flow.dart` |
| API / models | `bookings_api.dart`, `booking_models.dart` |
| Home / rides | `passenger_home_screen.dart`, `passenger_rides_provider.dart` |
| Tests | `passenger_trip_plan_test.dart`, `live_booking_create_payload_test.dart` |

---

## 2. Booking contract changes

**`POST /bookings` body**
- Required: `pickup`, `vehicleCategory`
- Optional: `pickupLabel`, legacy `destination` / `destinationLabel` (accepted, not used for fare/routing)
- Missing pickup → validation error
- Outside ACTIVE zone → `409 CONFLICT` / `Pickup is outside the active service area`

**Create behavior**
1. Validate passenger + ACTIVE service zone covering pickup  
2. Insert booking **`SEARCHING`** with `searchExpiresAt` (no Paystack)  
3. `payment` = `null` on response  
4. Dispatch matching (immediate + workers)  
5. `destination` stored as `null` when omitted  

**Backward compatibility**
- Clients may still send destination; values are stored if provided  
- Historical rows keep destination columns  
- Legacy `AWAITING_PAYMENT` fee-before-search path retained via `createBookingWithFeePayment` for older payment tests / residual rows  

---

## 3. Passenger UI changes

- Map headline: **“Where should your rider pick you up?”**
- Primary CTA: **“Find a Rider”** (`find-a-rider`)
- Removed: destination search, suggestions, landmarks selection for booking, destination marker, pin target destination, route preview/polyline, distance/duration
- Kept: map tiles, GPS, manual pickup pin, reverse geocode, pickup label, My location, nearby riders, active-ride contact
- Home: **Find a rider** entry (no “Where to?”)
- Live flow: pickup-only create → SEARCHING → map “looking for rider”; **no Paystack WebView at create**
- Copy distinguishes **GH₵1 Cyrlo connection fee** vs transport fare agreed with the rider

---

## 4. Rider flow changes

- Offers still use pickup + vehicle category + eligibility (zone, tokens, GPS freshness, availability)
- Matching **no longer requires** a SUCCESS connection fee before dispatch
- Accept: atomic SEARCHING→ACCEPTED + token debit + invalidate siblings (unchanged race control)
- After accept: `initiateConnectionFeeAfterAccept` creates idempotent `BOOKING_FEE` payment (`booking-fee:{bookingId}`) and initializes Paystack (**MemoryPaystackClient in tests**)
- Rider UI was already pickup-centric; destination not required
- Passenger notified: rider assigned + pay GH₵1 connection fee

---

## 5. Payment implementation

| Rule | Implementation |
| --- | --- |
| Amount | Always `BOOKING_FEE_PESEWAS = 100` (GH₵1) |
| Timing | On **rider accept**, not create |
| Duplicate prevention | Prisma idempotency key `booking-fee:{bookingId}` |
| Explicit state | Payment row `PENDING` / `SUCCESS` / `FAILED` / `ABANDONED`; booking stays `ACCEPTED` while fee pending |
| Init failure | Accept still committed; passenger can retry via `initiateBookingFee` / accept response `connectionFee` |
| Verify failure / charge.failed | Payment `FAILED`; booking remains ACCEPTED until fee window expires |
| Unpaid after accept | `expireUnpaidBookings` cancels ACCEPTED, abandons PENDING fee, **reverses rider token** (`CONNECTION_FEE_UNPAID_TIMEOUT`) |
| Rider cancel after fee SUCCESS | Existing matrix: fee refund + token reverse |
| Search expire before accept | No fee usually → no refund; legacy fee-captured SEARCHING still refunds |
| Live Paystack in tests | **Never** — `MemoryPaystackClient` only; unit test asserts `fetch` not called |

**Architectural note:** Acceptance is synchronous; Paystack checkout is asynchronous after accept. Consistency is enforced by (1) idempotent payment row, (2) unpaid connection-fee expiry that cancels ACCEPTED and restores the rider token, (3) webhook handling for SUCCESS on ACCEPTED without moving status back to SEARCHING.

**Staging risk:** Do not run accept→fee against live Paystack credentials in staging without an explicit QA plan. Prefer Memory / test keys.

---

## 6. Database migration decisions

Migration `20261111200000_destination_free_connection_fee`:

```sql
ALTER TABLE bookings
  ALTER COLUMN destination_latitude DROP NOT NULL,
  ALTER COLUMN destination_longitude DROP NOT NULL,
  ALTER COLUMN payment_expires_at DROP NOT NULL;
```

- **No column drops** — historical destination data remains readable  
- `payment_expires_at` null while searching; set when connection fee is initiated on accept  
- Default enum status remains `AWAITING_PAYMENT` for Prisma; new creates explicitly set `SEARCHING`  

**Staging:** apply migration before deploying API that writes null destinations.

---

## 7. Tests and results

### Backend (ran)
```text
npx vitest run src/modules/bookings/module.test.ts \
  src/modules/bookings/destination-free.unit.test.ts \
  src/modules/maps/module.service.test.ts
```
**21 passed.** Covers: pickup-only schema, missing/invalid pickup, fixed GH₵1, connection-fee unpaid refund matrix, MemoryPaystack no-network.

`npx tsc --noEmit` — clean after fixes.

`module.db.test.ts` updated for SEARCHING-at-create and legacy fee fixtures (requires Postgres + migration applied).

### Flutter (ran)
```text
flutter test test/mapping/passenger_trip_plan_test.dart \
  test/booking/live_booking_create_payload_test.dart
```
**17 passed.** Covers: GPS/manual pickup, permissions, Find-a-Rider submit lock, zone rejection preserves pickup, no destination in create JSON, no Paystack-at-create in flow source, connection-fee vs transport-fare copy.

### Not concealed
Matching/payment DB suites and unrelated Flutter widget failures outside this scope were not re-run as a full-repo gate. Apply the Prisma migration before expecting booking DB tests to pass against a live database.

---

## 8. Remaining blockers

1. **ACTIVE service zone** still required for create — none activated in this work (by design). End-to-end accept/fee cannot complete in staging until a zone is ACTIVE.  
2. **Passenger connection-fee UI after accept** — notification carries `authorizationUrl`; a dedicated in-app “Pay GH₵1” sheet on ACCEPTED can be tightened further (initializeBookingFee retry path exists).  
3. **Matching DB fixtures** still seed SUCCESS fees for older narratives; they remain valid for legacy rows but are not required for new SEARCHING dispatches.  
4. **Staging Paystack credentials** — treat as live-risk; do not smoke-test accept fees against production keys.  
5. **Maps landmark/destination search code** remains in the backend for possible future POI tools; it is **not** part of the passenger booking journey anymore.

---

## 9. Staging deployment requirements

1. Apply migration `20261111200000_destination_free_connection_fee`  
2. Deploy API with destination-free create + matching without fee gate + accept→connection fee  
3. Deploy Flutter build with Find a Rider map  
4. Confirm `PAYSTACK_*` are test/sandbox for QA; never use live charges for automated checks  
5. Do **not** activate service zones unless product explicitly requests it  
6. Manual QA: pickup → Find a Rider → zone reject message (no ACTIVE zone) with pickup retained; with a future ACTIVE zone: SEARCHING → rider accept → GH₵1 checkout → agree destination/fare offline  

---

## 10. Legacy flows (safe to remove later)

| Flow | Status |
| --- | --- |
| Fee-at-create + AWAITING_PAYMENT passenger checkout | Legacy helper retained; unreachable from new Flutter create |
| Destination search on passenger map | Removed from UI; Maps places API still exists for other uses |
| Simulated nearby-destination offset booking | Already removed earlier; remains forbidden |

Do not delete payment webhook / AWAITING_PAYMENT transition code until staging confirms no residual unpaid legacy bookings.
