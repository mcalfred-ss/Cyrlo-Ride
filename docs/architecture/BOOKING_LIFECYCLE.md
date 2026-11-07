# Booking lifecycle

**Target:** `CYRLO_RIDE_MASTER_SPEC.md` sections 6, 7, and 11. **Current code:** `booking-rules.ts`, which is tested and not mounted on HTTP.

## Current code

Statuses: `REQUESTED`, `ACCEPTED`, `CANCELLED`, `COMPLETED`, `EXPIRED`. There is no search clock, no `IN_PROGRESS`, and no unpaid timeout. Accept is an edge from `REQUESTED` with no row lock. Create, cancel, and complete throw `NOT_IMPLEMENTED`.

Do not describe `REQUESTED` as the approved lifecycle.

## Target

`AWAITING_PAYMENT` → (`PAYMENT_FAILED` or `CANCELLED` or `SEARCHING`) → `ACCEPTED` → `IN_PROGRESS` → `COMPLETED`.

Search can also end as `EXPIRED` or `CANCELLED`. After acceptance, cancel is allowed as in the master spec. Only the assigned rider writes `IN_PROGRESS` and `COMPLETED`.

Unpaid timeout: 10 minutes, then `PAYMENT_FAILED`. Search timeout: 5 minutes from `SEARCHING`, then `EXPIRED` and outstanding offers stop.

Passenger completion is stored as an acknowledgement. It is not a transition.

Each committed transition appends `booking_status_history`. That table does not exist yet.

Matching batches, the single-winner transaction, and refunds are specified in `MATCHING_AND_CANCELLATION_POLICY.md`.

## Replacement

When implementation is approved, replace `assertBookingTransition`. Do not keep a second machine that still begins at `REQUESTED`.
