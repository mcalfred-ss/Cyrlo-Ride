# Cyrlo Ride — Milestone 9: Rider wallet, token packages and purchases

## What was implemented

- Server-managed `token_packages` catalog with seeded STARTER / STANDARD / PRO.
- Finance Admin CRUD (create/update/enable-disable/reorder) under `ManageTokenPackages` + recent MFA for mutations.
- Rider package purchase via Paystack using DB price/quantity snapshots (client cannot set price/tokens).
- Verified webhook reconciliation credits tokens once with immutable `PURCHASE` ledger rows.
- Rider wallet balance, ledger history, purchase history/status endpoints.
- Finance listing of packages and purchases / payment reconciliation status.

## Files created and modified

### Created

| Path | Role |
| --- | --- |
| `backend/prisma/migrations/20261107110000_token_packages_purchases/` | Packages + purchases + seed |
| `backend/src/modules/wallet/module.db.test.ts` | Postgres purchase/webhook tests |
| `docs/architecture/RIDER_WALLET_TOKEN_PURCHASES_MILESTONE_9.md` | This report |

### Modified

Wallet module (service/repository/controller/routes/schema/index/tests), payments webhook fulfillment for `TOKEN_PURCHASE`, composition/app mounts, Prisma schema, idempotency helpers, Paystack rider email helper.

## Database

Migration: `20261107110000_token_packages_purchases` on **`cyrlo_ride_app`**.

- `token_packages` — code, name, token_quantity, price_pesewas, is_active, display_order
- `token_purchases` — immutable snapshots + status PENDING/PAID/FAILED/ABANDONED; unique `payment_id`
- Seed: STARTER 20/1000, STANDARD 50/2000, PRO 150/5000
- Partial unique index: one ledger `PURCHASE` per `payment_id`
- No cascade-delete of financial rows (`ON DELETE RESTRICT`)

## Purchase lifecycle

1. Rider `POST /wallet/purchases` with `packageCode` (+ optional `clientRequestId`).
2. Load **active** package from DB; snapshot name/price/tokens onto purchase + `payments` (`TOKEN_PURCHASE`, PENDING).
3. Initialize Paystack with server amount; return checkout fields only.
4. Webhook `charge.success` (signature + amount + currency + ownership) → payment SUCCESS → atomic token credit + purchase PAID.
5. `charge.failed` → payment FAILED, purchase FAILED, **no credit**.

Idempotency:

- Init: `token-purchase-init:{riderId}:{clientRequestId}` (optional client key).
- Ledger credit: `token-purchase:{paymentId}`.
- Webhook events: unique `provider_event_id`.

## Permissions

| Action | Who |
| --- | --- |
| Buy packages / read own wallet | Authenticated RIDER (own rows only) |
| Manage packages | `ManageTokenPackages` (Finance + Super); MFA on mutate |
| List purchases (finance) | `ViewPayments` |
| Execute refunds | Existing `ExecuteRefunds` + MFA — **not** used for automatic token-purchase refunds |

Operations and Support do **not** receive package-management or refund-execution permissions.

## APIs

| Method | Path | Auth |
| --- | --- | --- |
| GET | `/api/v1/wallet/packages` | Rider |
| GET | `/api/v1/wallet/balance` | Rider |
| GET | `/api/v1/wallet/ledger` | Rider |
| GET | `/api/v1/wallet/purchases` | Rider |
| GET | `/api/v1/wallet/purchases/:id` | Rider |
| POST | `/api/v1/wallet/purchases` | Rider |
| GET/POST/PATCH | `/api/v1/admin/token-packages` | Finance ManageTokenPackages |
| GET | `/api/v1/admin/token-purchases` | Finance ViewPayments |

## Refund limitations (unresolved policy)

**No automatic token-purchase refund policy is approved.** This milestone:

- Preserves payment + purchase + ledger records.
- Exposes purchases to Finance for review.
- Does **not** auto-refund Paystack or reverse purchase credits.
- Does not invent compensating debits for purchases.

Booking-fee refunds and matching debit/reversal paths are unchanged.

## Notifications

Initialized / successful / failed purchase; tokens credited. Refund submitted/confirmed/failed remain on the existing fee-refund payment workflow only (no purchase auto-refund events invented).

## Test / typecheck / migration status

| Check | Result |
| --- | --- |
| `npx prisma migrate deploy` | Applied `20261107110000_token_packages_purchases` to **`cyrlo_ride_app`** |
| `npm run typecheck` | Passed |
| `npm test` | **23 files / 115 tests passed** |

Postgres coverage includes seeded packages, purchase snapshot immutability after price change, webhook amount/signature rejection, failed charge without credit, duplicate/concurrent webhook single credit.

## Known risks / unresolved

- Token-purchase refund/reversal policy not approved.
- Monetary approval thresholds still unresolved (M8).
- Package price changes after purchase do not affect snapshots (by design).
- Flutter checkout UI out of scope.
