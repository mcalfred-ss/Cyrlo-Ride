# Documentation reconciliation report

Date: 2026-11-06. Documentation only. No application code, Prisma schema, migration, dependency, environment file, database, or deployment was changed.

The approved target is `docs/architecture/CYRLO_RIDE_MASTER_SPEC.md`.

## Files inspected

All of `docs/architecture/`, plus `docs/BUSINESS_RULES.md`, `docs/ARCHITECTURE.md`, `docs/API_DOCUMENTATION.md`, and `docs/DATABASE_DESIGN.md`.

Source was checked only to keep "current implementation" labels honest: booking enum and `booking-rules.ts`, `shouldRefundBookingFee`, `shouldRefundToken`, `UserRole`, rider availability enum, onboarding Zod fields, Flutter `DriverKind`, and the empty maps provider.

## Files updated

| File | What changed |
| --- | --- |
| `docs/architecture/CYRLO_RIDE_MASTER_SPEC.md` | Created. Canonical target |
| `docs/architecture/DOCUMENTATION_RECONCILIATION_REPORT.md` | This report |
| `docs/BUSINESS_RULES.md` | Replaced the earlier proposed matrix, single-batch rule, and open unpaid timeout |
| `docs/architecture/MATCHING_AND_CANCELLATION_POLICY.md` | Successive batches, 10-minute unpaid timeout, approved refund table |
| `docs/architecture/BOOKING_LIFECYCLE.md` | Target includes `IN_PROGRESS`. `REQUESTED` is labeled current code |
| `docs/architecture/FINANCIAL_ARCHITECTURE.md` | Provisional pack catalog. Boolean refund helpers must be replaced, not extended |
| `docs/architecture/OPEN_DECISIONS.md` | Removed decisions that are now confirmed |
| `docs/architecture/DATABASE_DESIGN.md` | Target objects for vehicles, zones, staff, packs, trip GPS, disputes, `IN_PROGRESS` |
| `docs/architecture/SECURITY_AND_OPERATIONS.md` | Four staff roles, explicit refund permission, MFA, no self-promotion |
| `docs/architecture/API_CONTRACT.md` | Banner and corrections so `REQUESTED`, `BUSY`, and an empty pack catalog are not the target |
| `docs/architecture/BACKEND_ARCHITECTURE.md` | Maps stay a Flutter git pin. Refund helpers are not the policy engine |
| `docs/architecture/IMPLEMENTATION_ROADMAP.md` | Stopped treating price, radius, and expiry as open. `booking-rules.ts` is scheduled for replacement |
| `docs/architecture/DATABASE_AND_FINANCIAL_REVIEW.md` | Banner: inspection record, not the target |
| `docs/architecture/REPOSITORY_AUDIT.md` | Banner: okada/pragya/aboboyaa are the current UI only |
| `docs/ARCHITECTURE.md` | Pointer to the master spec. Single `ADMIN` is current code |
| `docs/API_DOCUMENTATION.md` | Same pointer |
| `docs/DATABASE_DESIGN.md` | Pointer. `REQUESTED` in that file is the migrated enum |

Not rewritten line by line: `CYRLO_MAPS_INTEGRATION.md` (already pins `d299ede` and forbids a hosted maps API), and the body of `API_CONTRACT.md` after the banner. Those Zod examples still show `REQUESTED` and `BUSY` as the shape of today's schemas. The banner and master spec section 14 say they are not the target.

## Contradictions that were in the docs

| Earlier text | Approved decision |
| --- | --- |
| No second offer batch. Expire as soon as the first three reject | Successive batches until assignment or the 5-minute search expiry |
| Unpaid lifetime unresolved | 10 minutes |
| Rider cancel after accept keeps the token | Fee refund and token refund |
| Passenger cancel after accept keeps the fee and refunds the token | No automatic refund of either. Support reviews |
| Rider cannot complete: token stays spent | Fee refund and token refund |
| `IN_PROGRESS` was unresolved and omitted | `ACCEPTED → IN_PROGRESS → COMPLETED` |
| Passenger might complete the trip | Only the assigned rider starts and completes. Passenger confirmation is an acknowledgement |
| Okada, pragya, aboboyaa | Okada, Pragya, Aboboyaa (`OKADA` \| `PRAGYA` \| `ABOBOYAA`) |
| Token catalog unresolved | `STARTER`, `STANDARD`, `PRO` as provisional server config |
| One `ADMIN` role as the staff model | Four dashboard roles, explicit refund permission, MFA, no self-promotion |
| `shouldRefundBookingFee` / `shouldRefundToken` as the policy | Replace them. Do not add flags |
| `BUSY` as a stored availability | Display states are derived. Do not store all five |
| Dispute window and who may open one were open | 24 hours after completion or cancellation, passenger or rider |

`DATABASE_AND_FINANCIAL_REVIEW.md` still describes `REQUESTED` and the boolean helpers because that is the code. The new banner says not to implement its refund correction on top of those booleans.

## Confirmed decisions incorporated

Booking fee 100 pesewas. Transport fare off-platform. Unpaid timeout 10 minutes. Search 5 minutes, starting at `SEARCHING` only. Radius 5 km straight line. GPS 30 seconds. Batches of at most 3, then further batches. Rejected and timed-out riders are not re-offered the same booking. First valid accept wins in one transaction. One token only after assignment. Search expiry stops outstanding offers. Status list including `IN_PROGRESS`. Refund matrix in the master spec. Immutable originals and separate refund records. Manual Ghana Card review. Encrypted identity, private object storage, no identity fields on ordinary rider APIs. Okada, Pragya, Aboboyaa. Derived availability. Zone model for Atwima Kwanwoma and a closed Ahenema Kokoben pilot, without invented polygons. 24-hour disputes. Push, in-app, and SMS for OTP. Notifications outside the money transaction. HS256, active-user checks, ownership checks, webhook event rows, status history, wallet row locks.

## Remaining unresolved decisions

- Per-offer timeout before the next batch.
- Which three riders are chosen when more than three are in range.
- Whether suspension aborts an active trip.
- Whether offline is allowed while an offer is pending.
- Criteria for a reviewed refund after the passenger cancels post-acceptance.
- Whether a completed-trip dispute can override "no refund".
- MFA method.
- Key manager, identity retention, object-storage vendor.
- Vehicle document checklist beyond photographs, and capacity limits.
- Which SMS messages are critical besides OTP. Push vendor.
- Sourced polygons and which subareas besides Ahenema Kokoben are activated.
- How long trip GPS points are kept after 24 hours.
- Confirm that the 10-minute unpaid timeout should end as `PAYMENT_FAILED` rather than `CANCELLED`. The duration is confirmed. The status name is the reading that keeps `EXPIRED` for search only.

## Required Prisma changes (not created)

Listed in master spec section 13. The important additions beyond the earlier review are: `IN_PROGRESS`, `payment_expires_at`, vehicle category constrained to tricycle and car, `rider_zone_approvals`, `admin_role_grants`, `token_packs`, `trip_location_points`, `disputes`, and a passenger acknowledgement that is not a status. Financial foreign keys should `RESTRICT` deletes so a deactivated zone does not erase booking history. Do not store all five availability labels as an enum. Do not keep using plaintext `ghana_card_number`.

## Required API changes (not implemented)

Create-booking responses use `AWAITING_PAYMENT`, not `REQUESTED`. Accept requires `SEARCHING`. New rider actions: start trip and complete trip. Passenger acknowledge does not change status. Dispute create for 24 hours. Availability input is `OFFLINE` or `ONLINE`, response includes the derived display state. Onboarding accepts tricycle or car and the vehicle facts. Pack codes are the three provisional codes. Staff routes check a grant, not only `role === ADMIN`. Zone writes are Super Admin or Operations Admin. Refund routes require the finance permission. Socket needs an event for `IN_PROGRESS`. The current event list does not have it.

## Implementation dependencies

- Per-offer timeout and in-radius ordering before the matcher can be finished.
- A sourced polygon before any zone is activated.
- Object storage and an encryption key process before Ghana Card or vehicle images are accepted.
- SMS vendor before real OTP. Push vendor before primary notifications.
- MFA choice before staff dashboards.
- `cyrlo_maps` git pin `d299ede80fb63ccaa3f8d8b2135f757897317dfd` when the map screen is built. No maps HTTP service.

## Assumptions that need product-owner approval

1. Unpaid timeout uses `PAYMENT_FAILED`, not `EXPIRED` or `CANCELLED`.
2. "Successful assignment" means the winning accept, so the token is deducted then, not at `IN_PROGRESS`.
3. An active trip that blocks the offline control is `ACCEPTED` or `IN_PROGRESS`, not a mere pending offer.
4. Suspension blocks new offers and online display and does not, by itself, cancel the current trip. The decision did not say to abort the trip.
5. Support Admin cannot execute refunds. Finance Admin can, with an explicit permission. The examples separate support from finance.
6. A dispute after `COMPLETED` does not override the no-refund row, because refunds must follow the matrix.
7. Straight-line 5 km is haversine, not driving distance.
8. Staff authority is a grant table checked on each request, not four new values dropped into the mobile `UserRole` enum without a server re-read.
9. The district record may exist inactive while only verified subareas are active. No coordinates were invented.
10. Notification delivery is after commit. A failed push does not roll back Paystack capture or the token debit.
