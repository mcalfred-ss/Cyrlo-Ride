# Matching and cancellation policy

Approved rules are in `CYRLO_RIDE_MASTER_SPEC.md`. This file is the operational detail. Current code does not implement it. `assertBookingTransition` still starts from `REQUESTED`. `shouldRefundBookingFee` and `shouldRefundToken` must not be extended to fake this policy.

## Clocks

| Clock | Starts | Length | Result |
| --- | --- | --- | --- |
| Unpaid | Booking creation, fee not confirmed | 10 minutes | `PAYMENT_FAILED`. No offers. No refund |
| Search | Transition to `SEARCHING` after fee `SUCCESS` | 5 minutes | `EXPIRED`. Every still-pending offer expires. Fee refund. No token was deducted |

Provider failure or abandonment also ends in `PAYMENT_FAILED` and does not start the search clock.

## Batches

While the booking is `SEARCHING` and the search clock has not ended:

1. Build the eligible set. Exclude anyone who already rejected this booking or whose earlier offer on this booking timed out.
2. Offer at most 3 of them.
3. Wait until that batch is accepted, rejected, or timed out.
4. If nobody won, send the next batch.
5. Stop when an accept commits or the search clock ends.

**Unresolved.** The wait in step 3, and which three riders are chosen when more than three qualify. Do not invent a timeout or a sort in code until those are decided. Successive batches themselves are decided.

Eligibility: approved identity, Ghana Card verified, approved for the active zone that contains the pickup, account active, online intent, GPS age at most 30 seconds, sharing on, at least one token, within 5 km straight line, not assigned to another `ACCEPTED` or `IN_PROGRESS` booking.

Accept re-checks eligibility under `SELECT ... FOR UPDATE` on the booking and on the wallet. The status update is `WHERE status = 'SEARCHING'`. Zero rows means another transaction won. The winner's offer becomes `ACCEPTED`. Other pending offers become `EXPIRED`. The token debit is inserted in that transaction. A losing attempt does not debit.

## Refund matrix

Fee records and token records are independent. Original rows stay immutable.

| Situation | Booking fee | Rider token |
| --- | --- | --- |
| No rider accepts before expiry | Refund | No deduction |
| Passenger cancels during search | Refund | No deduction |
| Rider cancels after acceptance | Refund | Refund |
| Passenger cancels after acceptance | No automatic refund. Support reviews | No automatic refund |
| Rider cannot complete the trip | Refund | Refund |
| Trip completed | No refund | No refund |

A token refund row sets `reverses_entry_id` to the assignment debit. A fee refund is a `payment_refunds` row (`REQUESTED`, `PROCESSING`, `SUCCEEDED`, `FAILED`) and leaves the payment at `SUCCESS`.

The current `shouldRefundToken` function does the opposite of the rider-cancel row: it keeps the token when the rider cancels. Replace the function. Do not add a boolean argument to it.

Passenger cancel after acceptance creates a support case. It does not call Paystack and it does not insert a token refund. A later finance refund, if a reviewer authorizes one, is still a new record. The criteria for that authorization are not specified.
