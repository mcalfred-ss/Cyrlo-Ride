# Destination-free booking — post-implementation payment & migration audit

**Date:** 2026-11-11  
**Mode:** READ-ONLY (no deploy, migration apply, zone activation, bookings, payments, SMS, or env changes)  
**Scope:** Passenger request → rider accept → GH₵1 init → Paystack webhook → confirm / cancel

---

## Verdict

### **READY WITH CONDITIONS**

| Allowed now (after deploy + migration) | Blocked until P0 fixes |
| --- | --- |
| Flutter **Find a Rider** → create → **zone reject** (0 ACTIVE zones) | Rider **accept → connection fee** E2E |
| Pickup GPS / pin / reverse geocode regression | Any Paystack init against staging secrets |
| Code review / unit tests with `MemoryPaystackClient` | Claiming payment lifecycle “production-safe” |

**Do not** treat accept→fee as QA-ready until the P0 items below are fixed. Staging still presents **live Paystack key risk** (prior audit; not re-printed).

---

## 1. Payment lifecycle

### Intended flow (code)

```
POST /bookings (pickup only)
  → zone check → SEARCHING (+ searchExpiresAt) → matching.dispatch
  → no Paystack

POST /matching/offers/:id/accept
  → FOR UPDATE booking+offer
  → SEARCHING→ACCEPTED (updateMany) + token debit + rider BUSY
  → initiateConnectionFeeAfterAccept (after txn)
       → ensureConnectionFeePayment (idempotency booking-fee:{bookingId})
       → Paystack initializeTransaction (GH₵1 / GHS)
  → passenger notified with authorizationUrl

Paystack charge.success webhook
  → payment_webhook_events (providerEventId) + processedAt gate
  → payment PENDING|ABANDONED → SUCCESS (txn)
  → finalizeBookingFeeAfterSuccess
       → ACCEPTED/IN_PROGRESS on-time: notify paid (dedupeKey)
       → ACCEPTED past deadline / CANCELLED|PAYMENT_FAILED: queue fee refund
       → legacy AWAITING_PAYMENT: SEARCHING or refund

expireUnpaidBookings
  → legacy AWAITING_PAYMENT → PAYMENT_FAILED + ABANDON PENDING
  → ACCEPTED + paymentExpiresAt due + PENDING fee
       → CANCELLED + ABANDON PENDING + reverse token (idempotent) + rider AVAILABLE
```

### Verification matrix

| Check | Result | Notes |
| --- | --- | --- |
| Payment init idempotent | **PASS (row)** / **WEAK (init)** | Unique `idempotencyKey = booking-fee:{bookingId}` prevents duplicate **payment rows**. Retries can call `initializeTransaction` again with the same reference (provider-dependent). |
| Duplicate accept → duplicate payments | **PASS** | `acceptOfferAtomically`: `FOR UPDATE` + `updateMany … status=SEARCHING`. Loser gets 409. Only winner reaches fee init. |
| Duplicate webhooks | **PASS** | `payment_webhook_events.providerEventId` unique; early return when `processedAt` set; SUCCESS replay re-enters finalize safely. |
| Delayed SUCCESS after cancel | **PASS (mostly)** | CANCELLED falls through to `late_payment_after_deadline` refund (payment may be ABANDONED→SUCCESS). Does **not** revive SEARCHING/ACCEPTED. |
| Failed/abandoned → token restore once | **PASS (path)** / **GAP (tests)** | `reverseAcceptanceDebitInTx` uses `token-refund:booking:{id}`; existing row returned. Covered by wallet design; **no new destination-free DB test** for unpaid-timeout reverse. |
| Successful payment inconsistent state | **CONDITIONAL** | On-time SUCCESS on ACCEPTED only notifies — booking stays ACCEPTED (correct). **Gaps:** see P0 races / orphan accept. |
| Rider availability while fee pending | **PASS** | Accept sets `BUSY`; unpaid timeout / rider cancel restores `AVAILABLE` via `releaseRiderIfIdle`. Rider stays BUSY during pending fee (intended). |
| Expiry / cancel vs pending payment | **PARTIAL** | Unpaid timeout abandons PENDING. Passenger post-accept cancel is **support review only** — pending fee + BUSY rider can linger until timeout. |
| Passenger/rider state consistency | **PARTIAL** | Accept notifies both sides. Fee-init failure after accept is **swallowed** in matching (`catch → connectionFee null`) — passenger may see ACCEPTED without checkout. |

### Transaction / concurrency findings

**Strong**
- Accept: row locks + conditional status update + in-txn token debit + BUSY.
- Webhook: event insert race handled; payment status flip under short txn.
- Token refund: unique ledger idempotency key.

**Weak / broken**

1. **P0 — Fee init outside accept transaction**  
   Accept commits, then `initiateConnectionFeeAfterAccept` runs. On failure, matching **swallows** the error. Booking remains **ACCEPTED**, rider **BUSY**, often **no** `paymentExpiresAt` and **no** PENDING payment.  
   Unpaid expiry only selects `ACCEPTED` **with** `paymentExpiresAt <= now` **and** a PENDING `BOOKING_FEE`.  
   → Orphan accepted trips can **never** auto-expire.

2. **P0 — Unpaid cancel vs SUCCESS race**  
   `cancelAcceptedForUnpaidConnectionFee` reads `findSuccessfulFeePayment` **before** `FOR UPDATE`. Inside the txn it does not re-check SUCCESS; it cancels ACCEPTED and reverses the token even if a concurrent webhook already marked the fee SUCCESS.  
   → Paid connection can be cancelled and token restored incorrectly (refund path may also fire).

3. **P1 — Trip can start without paid fee**  
   `startTrip` allows ACCEPTED→IN_PROGRESS with no SUCCESS `BOOKING_FEE` check. Rider can begin trip while connection fee is still PENDING.

4. **P1 — Late SUCCESS on ACCEPTED past deadline**  
   Refunds fee but **leaves** booking ACCEPTED (rider still assigned). Acceptable as compensating money movement, but product state ≠ “unpaid connection cancelled” if timeout already missed the race.

5. **P2 — `paymentExpiresAt` null treated as infinite deadline** in finalize for ACCEPTED (`?? POSITIVE_INFINITY`), which interacts badly with fee-init failure (P0).

---

## 2. GH₵1 fee correctness

| Check | Result |
| --- | --- |
| Amount exactly GH₵1 | **PASS** — `BOOKING_FEE_PESEWAS = 100` enforced on create storage, ensureConnectionFeePayment, initiate, and initiateBookingFee |
| Currency GHS | **PASS** — hardcoded `currency: 'GHS'`; webhook rejects amount/currency mismatch |
| Independent of destination / distance / duration | **PASS** — no fare engine; destination optional and unused for fee |
| Passenger charged only connection fee | **PASS (product intent)** — only BOOKING_FEE payment for this path |
| Rider transport fare not collected/calculated | **PASS** — no transport fare fields or Paystack charge for rider fare |
| Records distinguish connection vs other types | **PARTIAL** — DB `purpose` remains `BOOKING_FEE` (shared with legacy). Metadata `feeType: 'connection_fee'` on init; API exposes `connectionFeePesewas`. Prefer documenting as connection fee; optional future enum value |

Automated tests assert amount 100 and Memory client (no `fetch`) in `destination-free.unit.test.ts`.

---

## 3. Database migration

**File:** `backend/prisma/migrations/20261111200000_destination_free_connection_fee/migration.sql`

```sql
ALTER TABLE "bookings"
  ALTER COLUMN "destination_latitude" DROP NOT NULL,
  ALTER COLUMN "destination_longitude" DROP NOT NULL,
  ALTER COLUMN "payment_expires_at" DROP NOT NULL;
```

| Check | Result |
| --- | --- |
| Existing bookings readable | **PASS** — no DROP COLUMN / UPDATE of rows |
| Historical destinations preserved | **PASS** — values unchanged; columns only nullable |
| Pickup-only null destinations | **PASS** (after migrate + Prisma client) |
| Indexes / constraints | **PASS** — no index rebuild required for nullability; `payments.idempotency_key` unique unchanged |
| Staging-safe apply | **PASS** — additive nullability; short lock possible on ALTER |
| No reset/delete/overwrite | **PASS** |

**Not applied this audit** (per instructions). Staging migration status: **unknown / assume pending** until Ops runs `prisma migrate deploy`. Deploying API that inserts `destination_* = null` **before** this migration will fail at the DB.

---

## 4. Testing review

### Present (relevant)

| Area | Coverage |
| --- | --- |
| Pickup-only schema / GH₵1 constant / MemoryPaystack no-network | `destination-free.unit.test.ts`, `module.test.ts` |
| Concurrent accept + single token debit | `matching/module.db.test.ts` (existing) |
| Duplicate webhook / crash before `processedAt` / late SUCCESS refund | `bookings/module.db.test.ts` (legacy fee-at-create fixtures adapted) |
| Flutter pickup-only + no Paystack at create + fee vs fare copy | trip plan + live booking tests |

### Missing / insufficient for new model

| Gap | Priority |
| --- | --- |
| Accept → `initiateConnectionFeeAfterAccept` success (MemoryPaystack) + single payment row | **P0** |
| Fee init **failure** after accept (orphan ACCEPTED / retry) | **P0** |
| Concurrent webhook SUCCESS vs unpaid-timeout cancel | **P0** |
| Token reverse **exactly once** on connection-fee unpaid timeout | **P0** |
| Payment SUCCESS after ACCEPTED cancel (ABANDONED→SUCCESS → refund, no revive) | **P1** |
| `charge.failed` after accept (payment FAILED, booking stays ACCEPTED) | **P1** |
| Passenger cancel / support request while fee PENDING | **P2** |
| `startTrip` blocked or allowed when fee unpaid (product decision + test) | **P1** |
| Flutter: open connection-fee checkout after ACCEPTED (not only create path) | **P1** |

All of the above must use **mocks** (`MemoryPaystackClient`); never live Paystack.

---

## 5. Staging configuration (read-only)

| Item | Finding | Source |
| --- | --- | --- |
| Migration `20261111200000_…` on staging | **Not verified applied** (not run; treat as pending) | This session |
| ACTIVE service zones | **0 bookable** (Kokobin LOCKED / inactive in last DB-backed audit) | `CYRLO_RIDE_IMPLEMENTATION_AUDIT.md` |
| Paystack credential type | **Live keys historically present on staging** (name only; values not read/printed) | Same + `PASSENGER_MAP_STAGING_READINESS.md` |
| Accidental live charge risk | **HIGH** if accept→fee deployed while `PAYSTACK_SECRET_KEY` is non-empty non-test: `createPaystackClient()` uses **HttpPaystackClient** whenever secret is set and `NODE_ENV !== 'test'` | `paystack-client.ts` |
| Empty secret behavior | Falls back to **MemoryPaystackClient** (safe for local/test) | Same |
| Flutter create | **No** Paystack at create (good for zone-reject QA) | `live_booking_flow.dart` |
| Accept fee trigger | Server-side on accept — **does not require Flutter checkout to hit Paystack init** | matching + bookings services |

**Config that can trigger live transactions after deploy:** any successful rider accept while staging holds a real Paystack secret. Zone count 0 currently blocks create, which currently blocks accept — but that is **not** a substitute for test keys once a zone is activated.

---

## 6. Blockers and recommended fixes (priority)

### P0 — must fix before accept/fee QA

1. **Make fee initiation durable after accept**  
   - In the accept transaction (or immediately with compensating job): create PENDING payment + set `paymentExpiresAt` **even if** Paystack `initializeTransaction` fails.  
   - Do not swallow init failure without a retryable PENDING fee row + deadline.  
   - Optionally enqueue a worker to retry Paystack init.

2. **Re-check fee SUCCESS inside unpaid-cancel txn**  
   After `FOR UPDATE`, abort cancel if a SUCCESS `BOOKING_FEE` exists (or if payment flipped SUCCESS). Never reverse token for a paid connection.

3. **Apply migration on staging before deploying null-destination creates**  
   Ops only; not done in this audit.

4. **Paystack discipline**  
   Confirm staging secret is **test** mode (or empty→Memory) before any accept smoke. Do not print secrets. Prefer explicit financial approval if still live.

### P1 — before calling lifecycle “consistent”

5. Gate `startTrip` (or product-document) until connection fee SUCCESS — or explicitly allow unpaid start and test it.  
6. Add DB/unit tests listed in §4 (accept+fee, init failure, SUCCESS vs timeout race, token reverse once, charge.failed).  
7. Flutter: reliable post-accept “Pay GH₵1” path (poll booking / use notification `authorizationUrl` / `initializeBookingFee`).

### P2 — hygiene

8. Consider distinct `PaymentPurpose` or mandatory `feeType` on payment records for reporting.  
9. Passenger cancel-after-accept vs PENDING fee: auto-abandon or shorten timeout.  
10. Reconcile late SUCCESS-on-ACCEPTED-after-deadline (refund-only) with timeout cancel semantics.

---

## 7. Controlled staging QA checklist (when conditions met)

**Safe without P0 (zones still inactive, after migrate+deploy):**
1. Authenticate with allowlisted OTP (no SMS).  
2. Map: pickup GPS/pin → Find a Rider → expect service-unavailable.  
3. Confirm **no** Paystack UI and **no** accept path exercised.

**Unsafe until P0 + test Paystack:**
- Rider accept, connection-fee checkout, webhook, refunds.

---

## 8. Summary

The destination-free **create/search** shape and GH₵1 **amount/currency** rules are sound, and accept locking / webhook dedupe / token-refund keys are strong foundations. The **fee-after-accept** cutover introduced two correctness holes (orphan ACCEPTED if init fails; SUCCESS vs unpaid-cancel race) that fail the payment-lifecycle bar for uncontrolled QA. Staging still has **zero ACTIVE zones** and a **historical live Paystack** risk.

**Verdict: READY WITH CONDITIONS** — limited pickup/zone-reject QA only after migration + deploy; **not** ready for accept→payment staging exercises until P0 fixes and Paystack test-key confirmation.
