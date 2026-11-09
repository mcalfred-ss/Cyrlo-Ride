# Business rules

The approved target is `docs/architecture/CYRLO_RIDE_MASTER_SPEC.md`. This file is the short product statement. Where it and `booking-rules.ts` disagree, the master spec is the target and the TypeScript file is current code.

## Money

The passenger pays Cyrlo GH₵1.00 (100 pesewas) to book. The passenger pays the rider the transport fare directly. Cyrlo does not collect that fare.

One token is deducted only when assignment succeeds, in that same database transaction. A rejected or timed-out offer deducts nothing. Original payments and ledger rows are never edited to represent a refund.

Provisional pack catalog, server-owned, client sends only the code: `STARTER` 20 tokens for GH₵10, `STANDARD` 50 for GH₵20, `PRO` 150 for GH₵50. The numbers may change.

## Booking

Target statuses: `AWAITING_PAYMENT`, `PAYMENT_FAILED`, `SEARCHING`, `ACCEPTED`, `IN_PROGRESS`, `COMPLETED`, `EXPIRED`, `CANCELLED`.

`REQUESTED` is the current database enum. It is not the target.

An unpaid booking lasts 10 minutes, then becomes `PAYMENT_FAILED`. No search is started. The 5-minute search clock starts only at `SEARCHING`, after the fee is confirmed. Search expiry stops outstanding offers and sets `EXPIRED`.

Only the assigned rider moves `ACCEPTED` to `IN_PROGRESS` and then to `COMPLETED`. A passenger completion tap is an acknowledgement, not a status change.

## Matching

Eligible riders are approved, active, approved for the pickup's active zone, online, with GPS no older than 30 seconds, at least one token, and within 5 km straight line of the pickup. Batches hold at most 3 riders. Further batches continue until assignment or search expiry. A rider who rejected or timed out on that booking is not offered it again. The first valid accept wins under a row lock.

Per-offer timeout is 20 seconds. The sort order inside the radius is still not specified. See the master spec.

## Refunds

| Situation | Booking fee | Rider token |
| --- | --- | --- |
| No rider accepts before expiry | Refund | No deduction |
| Passenger cancels during search | Refund | No deduction |
| Rider cancels after acceptance | Refund | Refund |
| Passenger cancels after acceptance | Support review; no automatic refund | No automatic refund |
| Rider cannot complete the trip | Refund | Refund |
| Trip completed | No refund | No refund |

Do not encode this table by adding flags to `shouldRefundBookingFee` or `shouldRefundToken`. Those booleans do not match the table. `shouldRefundToken` keeps the token when the rider cancels. The approved row refunds it.

## Riders

Manual Ghana Card review is required. The rider submits documents, waits in `PENDING_REVIEW`, and an Operations Admin or Super Admin approves or rejects. Only approved riders go online. The card number is encrypted. Images are not stored in PostgreSQL. Ordinary rider APIs do not return identity data.

Launch vehicles are tricycle (primary) and car. Motorcycle is excluded. The current okada, pragya, and aboboyaa UI is not the launch catalog.

Display availability is `OFFLINE`, `ONLINE`, `OFFER_PENDING`, `ON_TRIP`, or `SUSPENDED`. Only offline and online are rider intent. The others are derived. A rider cannot use the normal offline control during `ACCEPTED` or `IN_PROGRESS`. Suspension blocks offers and online availability, keeps the token balance, and requires a reason plus an audit row from Operations Admin or Super Admin.

## Zones and pilot

Administrative area: Atwima Kwanwoma District, Ashanti Region. Pilot operations: Ahenema Kokoben and selected covered subareas, about 20 verified tricycle riders, cars allowed, closed passenger list. Polygons must be sourced before activation. They are not in this repository. Each zone approval is separate. Deactivating a zone keeps historical bookings.

## Staff

`SUPER_ADMIN`, `OPERATIONS_ADMIN`, `FINANCE_ADMIN`, and `SUPPORT_ADMIN` are the dashboard roles. The single `ADMIN` token role is current code, not the final model. Refunds require an explicit finance permission. No one may grant themselves Super Admin. Staff MFA is required. The MFA method is not chosen.

## Disputes and notifications

Either party may open a dispute within 24 hours of completion or cancellation. Support reads history, trip GPS, and payments. Refunds still follow the matrix and are new records.

Push is primary. In-app notifications persist. SMS is for OTP and critical fallback. Notification failure must not roll back a booking or a payment.

## Current code that this replaces

`assertBookingTransition` starts at `REQUESTED` and has no `SEARCHING` or `IN_PROGRESS`. Wallet, payment, and booking services throw `NOT_IMPLEMENTED`. The local app OTP is `123456`.
