# Cyrlo Ride — Phase 11A: Financial Reconciliation and Refund Reliability

**Date:** 2026-11-07  
**Scope:** Durable refund processing, Paystack refund webhooks, reconciliation visibility, late abandoned-charge handling.  
**Policy:** No new automatic refund criteria. `decideRefunds` and the master-spec matrix remain authoritative.

---

## Refund lifecycle

| Status | Meaning |
| --- | --- |
| `REQUESTED` | Matrix/decision queued a compensating fee refund; Paystack not yet called |
| `PROCESSING` | Claimed for submit, or provider accepted with pending confirmation |
| `SUCCEEDED` | **Only** after trusted provider confirmation (`processed` on create response, refund webhook, or reconcile lookup) |
| `FAILED` | Retryable submit/provider failure (no provider refund id, or provider `failed`) |
| `MANUAL_RECONCILIATION` | Unsafe to auto-retry (e.g. max attempts, provider id already issued on FAILED row) |

Original `payments` rows stay `SUCCESS`. Ledger rows stay immutable.

### Provider limitation

Paystack **Create Refund** does not accept a client idempotency key. Exactly-once behaviour is local:

1. Conditional claim (`REQUESTED`/`FAILED` + `provider_refund_id IS NULL`)
2. Unique `provider_refund_id`
3. Webhook + `fetchRefund` reconciliation for pending states
4. Refuse a second `createRefund` when a provider id already exists

---

## Components

| Piece | Location |
| --- | --- |
| Refund processor | `backend/src/modules/payments/refund-processor.ts` |
| Lifecycle helpers | `backend/src/modules/payments/refund-lifecycle.ts` |
| Refund webhook parser | `backend/src/infrastructure/payments/paystack-refunds.ts` |
| Paystack client | `createRefund`, `fetchRefund`, `fetchTransaction` |
| Worker | `backend/src/jobs/refund-workers.ts` (started from `app.ts`) |
| Migration | `20261107130000_financial_reconciliation` |

### Worker behaviour

Each tick:

1. Reclaim stale `PROCESSING` locks **without** `provider_refund_id` → `FAILED` for retry  
2. Submit due `REQUESTED` / retryable `FAILED` rows (network **outside** the claim TX)  
3. Reconcile stale `PROCESSING` rows that have a provider id via `fetchRefund`  
4. Queue missing booking-fee refunds for `SUCCESS` fees on terminal bookings (`PAYMENT_FAILED` / `EXPIRED` / `CANCELLED`) with no refund row  

Backoff: exponential from attempt number (`refund-lifecycle.ts`).

---

## Webhooks

Existing `POST /api/v1/payments/paystack/webhook` now routes:

- `charge.success` / `charge.failed` — unchanged booking-fee / token-purchase paths  
- `refund.*` — signature verified, event stored in `payment_webhook_events`, applied via `applyRefundWebhook`

Refund payloads are parsed separately from charge payloads. Amount/reference mismatches open a Finance discrepancy case; they do not mutate unrelated rows.

**Ops:** Enable refund events on the same Paystack webhook URL already configured for charges.

---

## Abandoned → SUCCESS

### Booking fee

Late capture still does **not** revive the booking to `SEARCHING`. Charge is recorded as `SUCCESS`; compensating refund is queued (`late_payment_after_deadline`). Duplicate webhooks stay idempotent.

`ABANDONED → SUCCESS` remains the documented late-capture exception so the captured charge has an immutable SUCCESS row for refund execution (approved happy-path transitions remain `PENDING → SUCCESS|FAILED|ABANDONED`).

### Token purchase

If an abandoned/failed purchase later succeeds:

- Payment becomes `SUCCESS`  
- **No** automatic token credit  
- **No** automatic token-purchase refund policy  
- Open `ABANDONED_TOKEN_PURCHASE_SUCCESS` Finance case  
- Notify rider that Finance will review  

Pending purchases still fulfill normally via `fulfillPaidPurchase`.

---

## Finance APIs (RBAC)

Mounted under `/api/v1/admin/payments` (existing admin payments router):

| Method | Path | Permission |
| --- | --- | --- |
| GET | `/refunds?status=` | `ViewPayments` (includes `MANUAL_RECONCILIATION`) |
| GET | `/refunds/:id/reconciliation-attempts` | `ViewPayments` |
| POST | `/refunds/:id/execute` | `ExecuteRefunds` + recent MFA |
| POST | `/refunds/:id/reconcile` | `ReconcilePaystack` + recent MFA |
| GET | `/reconciliation/cases?status=` | `ViewPayments` |
| POST | `/reconciliation/cases/:id/resolve` | `ReconcilePaystack` + recent MFA |

Support may still recommend refunds via disputes; Support cannot execute. Operations Admin does not gain refund permissions.

---

## Audit actions added

- `payment.refund.queued`  
- `payment.refund.submission_attempted`  
- `payment.refund.submitted`  
- `payment.refund.processing`  
- `payment.refund.confirmed_successful`  
- `payment.refund.failed`  
- `payment.refund.manual_review_required`  
- `payment.refund.reconciliation_attempted`  
- `payment.refund.discrepancy_detected`  
- `payment.reconciliation.case_opened`  
- `payment.reconciliation.finance_review_completed`  
- `payment.abandoned_token_purchase.reconciled`  
- `payment.late_success.refund_queued` (existing)

Metadata uses internal IDs and provider references only — never secrets, OTP, Ghana Card, or GPS.

---

## Tests

- `src/infrastructure/payments/paystack-refunds.test.ts`  
- `src/modules/payments/refund.db.test.ts` — concurrent claim, webhook confirm, reconcile, abandoned token case, missing-refund sweeper  

Vitest `fileParallelism: false` avoids shared-Postgres races between refund/outbox claim loops.
