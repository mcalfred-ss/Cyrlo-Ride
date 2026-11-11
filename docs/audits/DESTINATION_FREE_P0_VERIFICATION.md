# Destination-free P0 fix — independent verification

**Date:** 2026-11-11  
**Mode:** READ-ONLY (no code changes, deploy, migration apply, live Paystack, bookings, SMS)  
**Claim under review:** `docs/audits/DESTINATION_FREE_P0_FIX_REPORT.md`  
**Tests re-run:** `npx vitest run src/modules/bookings/connection-fee-lifecycle.test.ts` → **15 passed** (MemoryPaystack / pure helpers only)

---

## Verdict

### **VERIFIED WITH CONDITIONS**

The two P0 design defects are **fixed in the current source** as described: accept commits PENDING fee + `paymentExpiresAt` atomically; unpaid cancel and webhook SUCCESS share **booking → payment** locking; late SUCCESS queues a durable authorized refund and does not revive bookings.

**Conditions before treating accept→fee as staging-safe:**
1. Apply migration `20261111200000_destination_free_connection_fee` on staging (not done here).  
2. Run matching/bookings **Postgres** suites (or equivalent) proving accept+fee under real `FOR UPDATE` — the new 15 tests do **not** exercise the database.  
3. Confirm Paystack **test** credentials (or empty→Memory) before any accept smoke — historical live-key risk unchanged.  
4. Keep ACTIVE service zones at zero unless Ops explicitly activates for a controlled run.

---

## 1. Atomic acceptance

| Claim | Verification |
| --- | --- |
| Accept + PENDING payment same txn | **Confirmed.** `MatchingRepository.acceptOfferAtomically` creates `BOOKING_FEE` PENDING inside the same `$transaction` as `SEARCHING→ACCEPTED`, token debit, and `BUSY` (`module.repository.ts` ~392–420). |
| `paymentExpiresAt` committed atomically | **Confirmed.** Same txn `booking.update({ paymentExpiresAt })` before commit. |
| Rollback cannot leave ACCEPTED without fee | **Confirmed by construction.** Fee create and deadline update are before commit; any throw rolls back ACCEPTED + fee together. |
| Duplicate accept → multiple fees | **Confirmed prevented.** Second accept fails `updateMany … status=SEARCHING` (count ≠ 1). Fee uses unique `idempotencyKey = booking-fee:{bookingId}`; find-then-create under the accept lock. |

**Note:** Paystack `initializeTransaction` remains **after** commit (by design). That is recovery, not atomicity of the fee **row**.

---

## 2. Paystack initialization recovery

| Step | Behavior verified in code |
| --- | --- |
| Initial payment creation | On accept txn (PENDING + reference + idempotency key). |
| Init failure | `initiateConnectionFeeAfterAccept` catch: does **not** mark SUCCESS; notifies passenger + rider; rethrows `PAYMENT_VERIFICATION_FAILED` with `retryable: true`. Matching returns `connectionFeeError` (not silent swallow). |
| Retry | Reuses existing PENDING row / `providerReference` via `ensureConnectionFeePayment` + same reference. Memory client test proves fail-then-retry same ref. |
| Expiry | `expireUnpaidBookings` selects ACCEPTED past `paymentExpiresAt` with **no** SUCCESS fee → `cancelAcceptedForUnpaidConnectionFee`. |
| Reconciliation | ACCEPTED + `paymentExpiresAt=null` + no SUCCESS → set deadline + ensure PENDING row. |
| Passenger-visible errors | In-app “Connection fee checkout failed…” + accept API `connectionFeeError`. Flutter dedicated checkout UI still thin (condition, not a P0 reopen). |

**Every durable failure state has a path:** PENDING+deadline → retry init or unpaid cancel; ABANDONED after cancel → no further checkout; SUCCESS → confirm or late refund. No optimistic SUCCESS on init failure.

---

## 3. Payment / cancellation concurrency

| Check | Result |
| --- | --- |
| Lock order booking → payment | **Confirmed** on unpaid cancel (`FOR UPDATE` booking, then payments) and webhook SUCCESS (`FOR UPDATE` booking then payment). |
| SUCCESS prevents unpaid cancel | **Confirmed.** Under lock, `decideUnpaidConnectionFeeCancel` returns `abort/fee_already_paid` if any fee row is SUCCESS; cancel uses conditional `updateMany` ACCEPTED→CANCELLED. |
| Cancel cannot overwrite SUCCESS | **Confirmed.** Only abandons `status: PENDING`; SUCCESS rows untouched. |
| Late SUCCESS after cancel | **Confirmed.** ABANDONED→SUCCESS allowed; `finalizeBookingFeeAfterSuccess` re-loads booking; `refund_late` / `booking_terminal`; **no** status revive to ACCEPTED/SEARCHING. |
| Duplicate webhooks | **Confirmed (existing + finalize).** `processedAt` short-circuit; SUCCESS replay re-enters finalize; `requestFeeRefund` idempotent on `booking-fee-refund:{paymentId}` (P2002 → existing id). |
| Refunded/cancelled not revived | **Confirmed** in finalize decision helper + implementation. |
| Token restore exactly once | **Confirmed in design.** `reverseAcceptanceDebitInTx` unique `token-refund:booking:{id}`; second unpaid cancel aborts (`not_accepted`). |
| Rider availability | **Confirmed.** Accept → BUSY; unpaid cancel → `releaseRiderIfIdle` + AVAILABLE publish; paid path keeps ACCEPTED/BUSY. |

**Residual race nuance (acceptable):** Finalize runs *after* the SUCCESS payment txn. Cancel that starts later still sees SUCCESS under its locks and aborts. Cancel that finished earlier yields CANCELLED + late refund. No evidence of revive.

---

## 4. Refund verification

Late connection-fee SUCCESS path calls `bookings.requestFeeRefund({ authorizeForExecution: true })`.

| Layer | What happens |
| --- | --- |
| **DB (immediate)** | Creates `payment_refunds` row `REQUESTED` with unique `idempotencyKey`, sets `authorizedAt` when authorized. Duplicate queue returns existing id. |
| **Provider (async worker)** | `RefundProcessor.processDueWork` claims authorized REQUESTED/FAILED rows and calls `paystack.createRefund`. Refuses duplicate create when `providerRefundId` already set. |
| **Missed provider response** | Existing refund worker reconciles stale `PROCESSING` / FAILED retries (broader payments module — not re-proven by the 15 lifecycle tests). |

**Distinction:** Finalize does **not** call Paystack refund synchronously. It creates a **durable authorized refund record**; the **worker** performs the provider refund. That matches Cyrlo’s existing refund architecture and is appropriate — but “refund happened” ≠ “Paystack accepted createRefund in the webhook request.”

Duplicate webhook → duplicate refund **request** is collapsed by idempotency key; duplicate provider create is guarded in the processor.

---

## 5. Test review (the 15 lifecycle tests)

Re-ran safely: **15/15 passed** (`MemoryPaystackClient` / pure functions only).

### Genuinely exercised

| Scenario | How |
| --- | --- |
| Init failure without SUCCESS | Memory `failNextInitialize` throws; zero init records |
| Init retry same reference | Second initialize succeeds |
| Idempotency key stability | String equality for fee + token-refund keys |
| No live network | `fetch` spy not called |
| Unpaid-cancel vs SUCCESS **decisions** | `decideUnpaidConnectionFeeCancel` / `simulateCancelVsSuccessRace` |
| Late SUCCESS / terminal booking | `decideFeeSuccessFinalize` → `refund_late` |
| Token reverse “once” at decision layer | Second cancel decision `not_accepted` |
| Availability semantics (conceptual) | Race simulator outcomes |

### Not genuinely exercised by these 15

| Gap | Severity for “race proven” |
| --- | --- |
| Real Prisma `$transaction` / `FOR UPDATE` interleaving | **High** — decisions are unit-modeled, not DB-contended |
| `acceptOfferAtomically` creating fee row | **High** for accept atomicity proof (code review only here) |
| `cancelAcceptedForUnpaidConnectionFee` integration | **High** |
| Webhook `applyChargeSuccess` lock + finalize + `requestFeeRefund` | **Medium–High** |
| Refund worker `createRefund` after late SUCCESS | **Medium** (covered by older refund DB suites, not these 15) |
| Concurrent dual-rider accept under Postgres | **Medium** — exists in `matching/module.db.test.ts`, outside the 15 |
| Flutter display of `connectionFeeError` | **Low** for backend P0 |

`simulateCancelVsSuccessRace` is an **outcome model**, not a concurrent scheduler. It correctly encodes the intended winner rules but must not be mistaken for a locked-DB race proof.

---

## 6. Remaining blockers / staging readiness

| Item | Status |
| --- | --- |
| P0.1 orphan ACCEPTED without fee row | **Addressed in code** |
| P0.2 cancel vs SUCCESS | **Addressed in code** |
| Staging migration applied | **Blocker for deploy of null destinations** — verify Ops apply first |
| Postgres race/integration re-run | **Condition** before accept→fee QA |
| Live Paystack on staging | **Condition** — do not smoke accept fee on live keys |
| ACTIVE zones | Still **0** per prior audits — create still fail-closed (safe for limited QA) |

### Can staging migration/deployment proceed safely?

| Action | Safe? |
| --- | --- |
| Apply nullability migration (Ops) | **Yes** — additive; no data wipe (from prior migration audit) |
| Deploy API+app for pickup create / zone-reject QA | **Yes, with conditions** (migration first; no accept fee smoke on live Paystack) |
| Staging accept → GH₵1 → webhook E2E | **Not yet** until Postgres verification + test Paystack confirmation |

---

## 7. Summary

Independent review **agrees** with the P0 fix report on mechanism and intent. Atomic accept+fee and booking→payment locking are present in source; late SUCCESS refunds are durable and idempotent at the DB layer with async provider execution. The 15 new tests are valuable decision/MemoryPaystack proofs but **over-claim** if described as full concurrency verification under the database.

**Verdict: VERIFIED WITH CONDITIONS** — proceed with migration + limited non-payment staging QA; hold accept/payment E2E until DB race suites and Paystack test-key discipline are confirmed.
