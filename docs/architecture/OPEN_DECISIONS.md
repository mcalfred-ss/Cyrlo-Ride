# Open decisions

Approved rules live in `CYRLO_RIDE_MASTER_SPEC.md`. They are not open, and they are not implemented.

No longer open:

- Unpaid timeout is 10 minutes. Search is 5 minutes and starts only after the fee is confirmed.
- Matching radius is 5 km straight line. GPS freshness is 30 seconds. Batches hold at most 3 riders and continue until assignment or search expiry.
- A rider who rejected or timed out is not offered that booking again. The first valid accept wins in one locked transaction. One token is deducted only on that assignment.
- The refund matrix in the master spec, including a token refund when the rider cancels after acceptance, and no automatic refund when the passenger cancels after acceptance.
- Launch vehicles are tricycle and car. Motorcycle is excluded.
- Starting token packs are `STARTER`, `STANDARD`, and `PRO` at the stated prices. The prices may be reconfigured later. The server owns the catalog.
- Staff roles are Super Admin, Operations Admin, Finance Admin, and Support Admin. The code value `ADMIN` is not the final model.
- Trip flow includes `IN_PROGRESS`. Only the assigned rider starts and completes. Passenger confirmation is an acknowledgement.
- Disputes may be opened for 24 hours after completion or cancellation.
- Pilot area is Atwima Kwanwoma District, starting at Ahenema Kokoben and selected covered subareas, with a target of 20 verified tricycle riders and a closed passenger list.

## Still unresolved

| Decision | Blocks |
| --- | --- |
| How long one offer stays open before it times out and the next batch can start | The batch loop |
| Which eligible riders are chosen when more than three are inside 5 km | Who receives the first offers |
| Whether suspension aborts an assigned trip or only blocks new offers | Suspend behaviour during `ON_TRIP` |
| Whether the rider may go offline while an offer is pending | Offer lifetime when the rider toggles offline |
| What criteria allow a finance refund after a passenger cancels post-acceptance | Support and finance review |
| Whether a dispute after `COMPLETED` can override the no-refund row | Dispute outcomes |
| MFA method for staff | Privileged login |
| Key manager, identity retention period, object-storage vendor | Ghana Card and vehicle images |
| Vehicle document checklist beyond photographs, and capacity limits | Onboarding validation |
| Which notifications are critical SMS besides OTP. Push vendor | Notification rollout |
| Sourced polygons and the subarea list besides Ahenema Kokoben | First active zone |
| How long trip GPS points are kept after the 24-hour dispute window | Location log retention |

The unpaid timeout is specified to end as `PAYMENT_FAILED` in the master spec so it is not confused with search `EXPIRED`. That status mapping was not given its own name in the decision list. Confirm it if `CANCELLED` was intended instead.

## Still true of the repository

One Flutter app, one Node monolith, one Postgres database, no Supabase or Firebase as the system of record, no Cyrlo Maps HTTP API. Maps commit `d299ede80fb63ccaa3f8d8b2135f757897317dfd`. School transport stays out of local-ride tables.
