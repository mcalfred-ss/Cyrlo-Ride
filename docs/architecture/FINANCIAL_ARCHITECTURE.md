# Financial architecture

Cyrlo collects a passenger booking fee and sells rider tokens. Cyrlo does not collect the transport fare. That fare has no column and no Paystack charge. The approved matrix is in `CYRLO_RIDE_MASTER_SPEC.md`. This file keeps the money mechanics.

Amounts are integer pesewas. GH₵1.00 is `100`. The Flutter app must not send the fee, the pack price, or the token quantity.

`verifyPaystackSignature` is the only Paystack code that runs. Wallet and payment services throw `NOT_IMPLEMENTED`. The rules below marked **Confirmed** are the target. They are not a second implementation.

Refund cases are in `MATCHING_AND_CANCELLATION_POLICY.md`.

## Two movements

| Flow | Who pays Cyrlo | Record | Effect |
| --- | --- | --- | --- |
| Booking fee | Passenger | `payments` purpose `BOOKING_FEE`, amount 100, currency `GHS` | `SUCCESS` is what starts `SEARCHING` |
| Token pack | Rider | `payments` purpose `TOKEN_PURCHASE`, then a `PURCHASE` ledger row | Increases `token_balance` |
| Acceptance | Rider balance | `DEDUCTION` of 1 | Same transaction as the winning accept |
| Token return | — | New `REFUND` ledger row pointing at the debit | Does not edit the debit |
| Fee return | — | New Paystack refund row pointing at the `SUCCESS` payment | Does not edit that payment |

## Payment status

**Confirmed.** A payment moves only:

| From | To |
| --- | --- |
| `PENDING` | `SUCCESS` |
| `PENDING` | `FAILED` |
| `PENDING` | `ABANDONED` |

`SUCCESS` is immutable. A refund is not a status on this row. `Current code` has the four statuses and no transition function, so a later `UPDATE` could move `SUCCESS` backward. The target forbids that. The partial unique index on one successful booking fee depends on this. Moving a row off `SUCCESS` would free the booking for a second capture.

The app cannot mark a payment successful. Only a signature-checked webhook, whose amount and currency match the stored row, may do that. `express.json` keeps `req.rawBody`.

**Confirmed.** Each provider event is stored in its own row, keyed by the provider event id, before the effect runs. A replay of that id is a no-op. `payments.provider_event_id` cannot do this: it holds one id, and a second event for the same payment has nowhere to go. The target table is `payment_webhook_events`. It is not in the schema.

## Fee refunds

**Confirmed.** Refund state is separate from payment state:

| Refund status | Meaning |
| --- | --- |
| `REQUESTED` | The matrix says money should return. Paystack has not been called, or the call has not been accepted |
| `PROCESSING` | Paystack accepted the refund and has not settled it |
| `SUCCEEDED` | Paystack reported the refund settled |
| `FAILED` | Paystack or the call failed. The attempt row stays. A later attempt is a new row or a new transition from `FAILED` back to `REQUESTED` on that same attempt only if no provider refund id was issued |

The original payment remains `SUCCESS` with its original amount. Do not delete it. Do not set it to `FAILED` to mean "refunded."

Amount is the stored booking-fee amount. Idempotency key for the first attempt: `booking-fee-refund:{paymentId}`. A retry after `FAILED` uses a new key that includes the attempt number so the failed attempt remains.

`shouldRefundBookingFee` and `shouldRefundToken` are **current code**. They are booleans. They do not implement the approved matrix. In particular, `shouldRefundToken` keeps the token when the rider cancels, and the approved rule refunds it. Do not add parameters to these helpers to represent responsibility. Replace them with a policy that returns a fee decision and a token decision independently. Until that replacement exists, these functions are not the target.

## Tokens

**Confirmed.**

- One token is debited on the winning accept. Delta is `-1`.
- The debit and the booking update commit together. The wallet row is locked `FOR UPDATE` first. Balance is computed from the locked value. A balance below 1 aborts the accept.
- Idempotency key `token-debit:booking:{bookingId}`.
- A repeated accept returns the existing debit and does not insert another.
- Rejecting an offer debits nothing.
- A refund is a new row: type `REFUND`, `reverses_entry_id` set to that debit, delta equal to the negation of the stored debit, key `token-refund:booking:{bookingId}`.
- No `UPDATE` and no `DELETE` of a ledger row is used to refund, reverse, or correct it. An admin correction is a new `ADJUSTMENT` row.
- `token_balance` and `balance_after` stay non-negative. Those checks already exist in the migration. They do not, by themselves, stop two concurrent debits from losing an update. The row lock does.

**Current code.** `acceptanceTokenDelta` is `-1`. `IdempotencyKey.tokenDebit` and `tokenRefund` differ. `debitForAcceptance` and `refundForBooking` throw. The ledger has no `reverses_entry_id`.

The debit runs only in the winning assignment transaction. It does not run when the offer is sent and it does not wait for `IN_PROGRESS`.

Pack purchases use key `token-purchase:{paymentId}`. One `PURCHASE` row per payment is the target guard.

**Provisional catalog.** The server owns it. The client sends only the code. Values may change.

| Code | Tokens | Price |
| --- | --- | --- |
| `STARTER` | 20 | 1000 pesewas |
| `STANDARD` | 50 | 2000 pesewas |
| `PRO` | 150 | 5000 pesewas |

## Idempotency

| Event | Identity | Guard |
| --- | --- | --- |
| Create fee payment | `booking-fee:{bookingId}` | Unique key. One `SUCCESS` booking fee per booking. **Proposed:** also one `PENDING` fee per booking |
| Webhook delivery | Provider event id | **Confirmed** unique row in `payment_webhook_events`. Same id does nothing |
| Token credit | `token-purchase:{paymentId}` | Unique ledger key |
| Token debit | `token-debit:booking:{bookingId}` | Unique key and one `DEDUCTION` per booking |
| Token refund | `token-refund:booking:{bookingId}` | Unique key, one `REFUND` per booking, and `reverses_entry_id` |
| Fee refund attempt | `booking-fee-refund:{paymentId}` then a new key per retry | Unique key on the refund table. Original payment unchanged |

Webhook order: verify signature, insert the event row, apply the effect, mark the event processed. A crash after the charge and before the effect is recovered by replaying the same event id.

## Atomic wallet

**Confirmed** shape of every balance change:

1. Lock `rider_wallets` for this rider.
2. If the idempotency key already exists, return that ledger row and do not change the balance.
3. Insert the ledger row with `balance_after` equal to the locked balance plus `token_delta`.
4. Update `token_balance` to that same `balance_after`.
5. Commit.

Debit refuses when the locked balance is below 1. Refund refuses when the debit row is missing or already reversed.

## School fees later

A school product must not reuse `BOOKING_FEE_PESEWAS` or the one-token accept rule by adding columns to local bookings. Local rows stay `BOOKING_FEE` and `TOKEN_PURCHASE`.
