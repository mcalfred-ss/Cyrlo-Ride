# Cyrlo Ride — Phase 13A: Financial Integrity Hardening

**Date:** 2026-11-07  
**Scope:** Refund authorization gate for Paystack execution + missing-fee sweeper alignment with `decideRefunds`.  
**Database:** application target `cyrlo_ride_app` only (legacy `cyrlo_ride` untouched).  
**Predecessor:** `PHASE_12_BACKEND_PRODUCTION_READINESS_AUDIT.md` (Critical findings on refund worker + sweeper).

---

## 1. Original findings

### Finding 1 — Refund worker bypasses Finance authorization

Phase 12 identified that the refund worker auto-submitted every due `REQUESTED` / `FAILED` row to Paystack. Support recommendations (`dispute_recommendation:*`, `passenger_cancel_review:*`) create `REQUESTED` rows without Finance MFA / `ExecuteRefunds`. Those rows were therefore executable by the background worker, bypassing the Finance authorization path that admin `POST /refunds/:id/execute` enforces via RBAC + `requireRecentMfa`.

### Finding 2 — Missing-fee sweeper violates refund policy

`queueMissingBookingFeeRefunds` selected any `BOOKING_FEE` + `SUCCESS` payment on `PAYMENT_FAILED` / `EXPIRED` / `CANCELLED` bookings with no refund row, then created a refund with reason `late_payment_after_deadline`. That independent eligibility logic disagreed with `decideRefunds` (e.g. `PAYMENT_FAILED` and passenger cancel after acceptance are `fee: NONE`).

---

## 2. Root causes

| Finding | Root cause |
| --- | --- |
| Worker bypass | Claim/select used only `status ∈ {REQUESTED, FAILED}` — no durable authorization distinction between “requested/recommended” and “authorized for monetary execution”. |
| Sweeper over-coverage | Sweeper invented eligibility (`late_payment_after_deadline` for all terminal statuses) instead of calling `decideRefunds`. |

---

## 3. Changes made

1. **Schema:** `payment_refunds.authorized_at`, `payment_refunds.authorized_by_id` + index `(status, authorized_at, next_attempt_at)`.
2. **Migration backfill:** already-submitted / terminal rows marked authorized; matrix-reason `REQUESTED` rows auto-authorized; Support-style reasons left unauthorized.
3. **`requestFeeRefund`:** optional `authorizeForExecution`. Matrix call sites pass `true` (passenger pre-accept cancel, search expiry, late payment, rider cancel / unable-to-complete). Support/dispute paths leave default `false`.
4. **`RefundProcessor.authorizeRefundExecution`:** concurrency-safe `UPDATE … WHERE authorized_at IS NULL` + audit `payment.refund.authorized`.
5. **`executeRefund`:** authorize then submit (Finance path).
6. **Claim boundary:** `submitRefund` `updateMany` requires `authorized_at IS NOT NULL`; worker `findMany` filters the same.
7. **Sweeper:** maps booking → `situationForMissingFeeRefund` → `decideRefunds`; creates fee refund only when `fee === 'REQUEST_REFUND'`, with matrix reason + `authorized_at` set; idempotent via existing idempotency key.

Preserved: Finance `ExecuteRefunds` + `requireRecentMfa` on execute route; immutable ledger; refund claim/lock/backoff; SUCCESS only after provider confirmation (webhook/reconcile); no live Paystack in tests.

---

## 4. Refund authorization lifecycle

### Before

```
Support recommend → REQUESTED
Matrix path → REQUESTED
                    ↓
         worker / Finance execute
                    ↓
              PROCESSING → provider → SUCCEEDED (webhook)
```

Worker treated Support `REQUESTED` as executable.

### After

| Stage | Meaning | Durable signal |
| --- | --- | --- |
| Requested / recommended | Row exists; no Paystack submit | `status=REQUESTED`, `authorized_at=NULL` |
| Matrix-authorized at create | Approved policy auto-execution | `authorized_at=created`, `authorized_by_id=NULL` |
| Finance-authorized | Staff MFA + ExecuteRefunds path | `authorized_at` + `authorized_by_id=actor` |
| Submitted | Claimed + Paystack createRefund accepted | `status=PROCESSING`, `provider_refund_id`, `submitted_at` |
| Confirmed | Provider processed (webhook/reconcile) | `status=SUCCEEDED`, `confirmed_at` |

Worker and claim **never** move an unauthorized row to processing. Stale-lock reclaim (`PROCESSING` → `FAILED` without provider id) does not set `authorized_at`. Webhook/reconcile do not set `authorized_at`.

---

## 5. Sweeper eligibility behaviour

Source of truth: `decideRefunds` in `booking-rules.ts`.

Helper `situationForMissingFeeRefund` maps terminal booking fields (`status`, `acceptedAt`, `cancellationActorType`, cancel history reason) onto a matrix situation (or `null` for Admin/Support cancels).

| Situation | Fee (when captured) | Sweeper creates fee refund? |
| --- | --- | --- |
| `PASSENGER_CANCEL_BEFORE_ACCEPT` | REQUEST_REFUND | Yes (authorized) |
| `SEARCH_EXPIRED` | REQUEST_REFUND | Yes (authorized) |
| `RIDER_CANCEL_AFTER_ACCEPT` | REQUEST_REFUND (+ token decision) | Yes fee only |
| `RIDER_UNABLE_TO_COMPLETE` | REQUEST_REFUND (+ token decision) | Yes fee only |
| `PASSENGER_CANCEL_AFTER_ACCEPT` | NONE | No |
| `COMPLETED` | NONE | No |
| `PAYMENT_FAILED` | NONE | No |
| Admin cancel (`null` situation) | — | No |

Token reversal remains on the live rider-cancel path; sweeper recovers **missing fee refunds only**, but still consults `decideRefunds` for both fee and token decisions in audit metadata.

Repeated sweeper runs: unique `idempotency_key` → `P2002` skip.

---

## 6. Database / migration

- **Migration:** `20261107150000_phase_13a_refund_authorization`
- **Target DB:** `cyrlo_ride_app`
- No mutation/deletion of ledger entries.
- Legacy Support `REQUESTED` rows remain unauthorized until Finance authorizes (no bypass for those legacy recommendations).
- Prior PROCESSING/SUCCEEDED/FAILED/MANUAL_RECONCILIATION and matrix-reason REQUESTED rows backfilled as authorized so in-flight work continues.

---

## 7. Tests added / updated

| Area | Coverage |
| --- | --- |
| `refund-auth.db.test.ts` (new) | Support not submitted; unauthorized claim blocked; Finance authorize+process; matrix worker path; RBAC+MFA route wiring; concurrent auth/claim; duplicate submit; stale-lock; webhook; reconcile; sweeper matrix cases; Support recoverable only after Finance |
| `refund.db.test.ts` | Sweeper uses `search_expired` for EXPIRED; PAYMENT_FAILED creates nothing |
| `bookings/module.test.ts` | `decideRefunds` COMPLETED/PAYMENT_FAILED; `situationForMissingFeeRefund` mapping |

PostgreSQL integration/concurrency tests used for claim races and authorization.

---

## 8. Verification results

| Command | Result |
| --- | --- |
| `npm test` | **Pass** — 34 files / 183 tests |
| `npm run typecheck` | **Pass** |
| `npm run prisma:validate` | **Pass** |
| `npx prisma migrate status` | **Pass** — 14 migrations, schema up to date on local `cyrlo_ride_app` |

No production credentials; no live Paystack refunds.

---

## 9. Remaining limitations

- SMS provider still absent (Phase 12 P12-A-001) — unrelated to 13A.
- Token-purchase automatic refunds remain Finance-review-only (unchanged policy).
- Passenger post-acceptance refund criteria unchanged (Support recommend → Finance authorize).
- Sweeper does not perform token reversals; missing token reversals still require the original cancel path or manual ops.
- Webhook confirmation can still update status for a row that somehow already has `provider_refund_id` even if `authorized_at` is null (defense-in-depth status sync); it **cannot** set `authorized_at` or create a new Paystack refund. Claim still blocks unauthorized submit.
- No new refund approval thresholds introduced.

---

## 10. Completion criteria

Both Phase 12 refund-integrity findings are resolved in code and demonstrated by tests:

1. Support/unauthorized `REQUESTED` cannot be claimed or worker-submitted.
2. Finance-authorized and matrix-authorized refunds remain automatically processable.
3. Sweeper eligibility is derived only from `decideRefunds`.
