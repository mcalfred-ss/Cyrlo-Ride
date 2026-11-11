# Destination-free P0 payment lifecycle & concurrency fixes

**Date:** 2026-11-11  
**Reference:** `docs/audits/DESTINATION_FREE_POST_IMPLEMENTATION_AUDIT.md`  
**Scope:** P0.1 fee-init orphan after accept; P0.2 unpaid-cancel vs Paystack SUCCESS race  
**Constraints:** No deploy, no migration apply, no live Paystack, no zones/SMS/real bookings

---

## Verdict

### Both P0 issues are **resolved in code**, with **deterministic tests** for the race decisions and payment-init failure/retry.

DB-backed concurrent accept remains covered by the existing matching suite (not re-run here against Postgres). New lifecycle unit tests: **15 passed** in `connection-fee-lifecycle.test.ts` (30 total with related booking unit files).

---

## 1. Root causes

### P0.1 — Orphan ACCEPTED after payment init failure
1. Accept committed `SEARCHING→ACCEPTED` + token debit + `BUSY` **before** any payment row existed.  
2. `initiateConnectionFeeAfterAccept` ran after commit; matching **swallowed** all errors.  
3. Unpaid expiry required `paymentExpiresAt` **and** a PENDING fee — missing both → booking never expired.

### P0.2 — Unpaid cancel vs SUCCESS race
1. `findSuccessfulFeePayment` ran **outside** the cancel transaction.  
2. Cancel then locked the booking and abandoned PENDING / reversed the token without re-checking SUCCESS under lock.  
3. Webhook could mark SUCCESS concurrently → paid connection cancelled + token reversed incorrectly.  
4. Webhook locked **payment only**, so lock order vs cancel (booking then payment) was unsafe.

---

## 2. Files changed

| File | Change |
| --- | --- |
| `backend/src/modules/bookings/connection-fee-lifecycle.ts` | **New** pure decision helpers + race simulator |
| `backend/src/modules/bookings/connection-fee-lifecycle.test.ts` | **New** P0 tests (init fail/retry, races, dedupe keys) |
| `backend/src/modules/matching/module.repository.ts` | Create PENDING `BOOKING_FEE` + `paymentExpiresAt` **inside** accept txn |
| `backend/src/modules/matching/module.service.ts` | Surface `connectionFeeError`; do not swallow silently; expose `paymentExpiresAt` |
| `backend/src/modules/bookings/module.service.ts` | Atomic unpaid cancel; init failure notifications; orphan reconciliation |
| `backend/src/modules/payments/module.service.ts` | Lock **booking then payment** on SUCCESS; finalize via `decideFeeSuccessFinalize` |
| `backend/src/infrastructure/payments/paystack-client.ts` | `MemoryPaystackClient.failNextInitialize` for tests |

No new Prisma migration (existing nullability migration unchanged; **not applied** in this task).

---

## 3. New state-transition rules

### After rider accept (atomic)
| State | Meaning |
| --- | --- |
| Booking `ACCEPTED` | Rider assigned; token debited; rider `BUSY` |
| Payment `BOOKING_FEE` `PENDING` | Connection fee owed (same txn as accept) |
| `paymentExpiresAt` set | Fee window (10 minutes from accept) |

Checkout init is **separate** and may fail; booking stays `ACCEPTED` until paid or window expires.

### Connection-fee phases (helper)
- `awaiting_checkout_init` / `checkout_pending` — ACCEPTED, unpaid, before deadline  
- `paid` — SUCCESS while ACCEPTED/IN_PROGRESS on-time  
- `unpaid_cancelled` — cancelled for unpaid timeout (or due for cancel)  
- `late_paid_refund` — SUCCESS after terminal cancel / past deadline → refund, **never revive**

### Explicit concurrency rules

| Scenario | Rule |
| --- | --- |
| Webhook before expiry | Lock booking→payment; PENDING/ABANDONED→SUCCESS; `confirm_paid`; booking stays ACCEPTED |
| Webhook during cancel | Same lock order; whichever holds booking lock first: if SUCCESS committed, cancel **aborts** (`fee_already_paid`); if cancel committed, late SUCCESS → `refund_late`, booking stays CANCELLED |
| Webhook after cancel | SUCCESS on ABANDONED allowed as late capture; finalize → refund; **no revive** |
| Payment init fails | PENDING + deadline retained; passenger + rider notified; retry uses **same** `providerReference` / `booking-fee:{bookingId}` |
| Delayed verification | On-time SUCCESS → confirm; past deadline on ACCEPTED → refund_late; terminal booking → refund_late |
| Duplicate webhook | `payment_webhook_events.processedAt` short-circuit; SUCCESS replay re-enters finalize idempotently |
| Cancel while PENDING | Only after deadline via unpaid worker; under lock; SUCCESS aborts cancel |
| Duplicate accept | Second accept fails `SEARCHING` conditional update; one fee key per booking |

---

## 4. Transaction / concurrency strategy

1. **Accept txn:** `FOR UPDATE` booking+offer → ACCEPTED → token debit → **upsert PENDING fee** (`idempotencyKey=booking-fee:{bookingId}`) → set `paymentExpiresAt` → rider `BUSY`.  
2. **Paystack init (after commit):** may fail; never writes SUCCESS; errors surfaced as `connectionFeeError` + in-app notices.  
3. **Webhook SUCCESS txn:** `FOR UPDATE` booking (if any) **then** payment → PENDING|ABANDONED→SUCCESS.  
4. **Unpaid cancel txn:** `FOR UPDATE` booking **then** fee payments → `decideUnpaidConnectionFeeCancel` → conditional ACCEPTED→CANCELLED → ABANDON PENDING only → **idempotent** token reverse (`token-refund:booking:{id}`) → `releaseRiderIfIdle`.  
5. **Reconciliation:** ACCEPTED with `paymentExpiresAt=null` and no SUCCESS fee get a deadline + ensured PENDING row (belt-and-suspenders for pre-fix orphans).

Lock order is consistently **booking → payment** for fee SUCCESS and unpaid cancel.

---

## 5. Tests and results

```text
npx vitest run \
  src/modules/bookings/connection-fee-lifecycle.test.ts \
  src/modules/bookings/destination-free.unit.test.ts \
  src/modules/bookings/module.test.ts
```

**30 passed** (including **15** new lifecycle tests).

| Requirement | How demonstrated |
| --- | --- |
| Payment init failure | `failNextInitialize` → throw; no SUCCESS; zero init records |
| Init retry | Same reference succeeds on second call |
| Duplicate fee / accept keys | Stable `booking-fee:{id}` / `token-refund:booking:{id}` |
| Concurrent accept semantics | Single idempotency key; existing matching DB test still authoritative for FOR UPDATE |
| SUCCESS vs unpaid cancel | `simulateCancelVsSuccessRace` + `decideUnpaidConnectionFeeCancel` abort on SUCCESS |
| Cancel then late SUCCESS | `decideFeeSuccessFinalize` → `refund_late` / `booking_terminal` (no revive) |
| Delayed SUCCESS | past_deadline → refund_late |
| Duplicate webhook | Covered by existing processedAt tests; finalize decisions idempotent |
| Token restore once | Reverse only on cancel path; second cancel aborts `not_accepted`; ledger key unique |
| Rider availability | Paid keeps ACCEPTED (BUSY); unpaid cancel → CANCELLED (release path) |
| Expiry / reconciliation | Decision `not_due` / `cancel`; orphan deadline backfill in `expireUnpaidBookings` |
| No live Paystack | Memory client; `fetch` spy unused |

`npx tsc --noEmit` clean after changes.

---

## 6. Remaining risks

1. **Postgres DB suites** for accept+fee+webhook under real isolation were not executed in this session (no deploy/DB migrate). Run matching/bookings DB tests on a disposable DB before staging accept QA.  
2. **Flutter post-accept checkout UI** still relies on notification / `initializeBookingFee` retry — not part of this P0 backend fix.  
3. **`startTrip` without SUCCESS fee** remains allowed (prior P1).  
4. Staging **live Paystack** risk and **0 ACTIVE zones** unchanged — do not smoke accept→fee on live keys.  
5. Migration `20261111200000_destination_free_connection_fee` still must be applied by Ops before deploying null-destination creates (not done here).

---

## 7. P0 resolution checklist

| Issue | Resolved? | Evidence |
| --- | --- | --- |
| P0.1 Init failure leaves indefinite ACCEPTED | **Yes** | Fee row + `paymentExpiresAt` in accept txn; init failure keeps PENDING; expiry/reconcile; errors surfaced |
| P0.2 Cancel races SUCCESS / reverses paid token | **Yes** | Booking→payment locks; SUCCESS aborts cancel; late SUCCESS refunds without revive; tests for both commit orders |

**Claim:** Both P0 defects are fixed with automated tests covering payment-init failure/retry and the cancel↔SUCCESS race outcomes. Full DB concurrency re-validation on Postgres remains a staging precondition, not a substitute for these unit proofs.
