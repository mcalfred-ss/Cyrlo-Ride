# Open decisions

Approved rules live in `CYRLO_RIDE_MASTER_SPEC.md`. They are not open, and they are not implemented.

No longer open:

- Unpaid timeout is 10 minutes. Search is 5 minutes and starts only after the fee is confirmed.
- Matching radius is 5 km straight line. GPS freshness is 30 seconds. Batches hold at most 3 riders and continue until assignment or search expiry.
- Per-offer response timeout is **20 seconds** (`RIDER_OFFER_RESPONSE_TIMEOUT_SECONDS=20`). After timeout or full reject, the next batch may start.
- Object storage vendor is **Bunny.net** (`STORAGE_PROVIDER=bunny` + Edge Storage / CDN token env).
- A rider who rejected or timed out is not offered that booking again. The first valid accept wins in one locked transaction. One token is deducted only on that assignment.
- The refund matrix in the master spec, including a token refund when the rider cancels after acceptance, and no automatic refund when the passenger cancels after acceptance.
- Launch vehicles are tricycle and car. Motorcycle is excluded.
- Starting token packs are `STARTER`, `STANDARD`, and `PRO` at the stated prices. The prices may be reconfigured later. The server owns the catalog.
- Staff roles are Super Admin, Operations Admin, Finance Admin, and Support Admin. The code value `ADMIN` is not the final model.
- Trip flow includes `IN_PROGRESS`. Only the assigned rider starts and completes. Passenger confirmation is an acknowledgement.
- Disputes may be opened for 24 hours after completion or cancellation.
- Pilot area is Atwima Kwanwoma District, starting at Ahenema Kokoben and selected covered subareas, with a target of 20 verified tricycle riders and a closed passenger list.
- **First activation = 1 zone only: Kokobin** (sourced GeoJSON in `ops/zones/kokobin.geojson`). Earlier planning named Ahenema Kokoben; the verified map place for v1 is Kokobin. Additional subareas are added later, one zone at a time, after the first zone is operationally stable.
- Pilot refund/dispute review criteria are in `docs/legal/PILOT_REFUND_AND_DISPUTE_POLICY.md` (no automatic post-accept passenger refunds; no completed-trip dispute refund override).

## Still unresolved

| Decision | Blocks |
| --- | --- |
| Which eligible riders are chosen when more than three are inside 5 km | Who receives the first offers |
| Whether suspension aborts an assigned trip or only blocks new offers | Suspend behaviour during `ON_TRIP` |
| Whether the rider may go offline while an offer is pending | Offer lifetime when the rider toggles offline |
| MFA method for staff | Privileged login |
| Key manager, identity retention period | Ghana Card ciphertext lifecycle |
| Vehicle document checklist beyond photographs, and capacity limits | Onboarding validation |
| Which notifications are critical SMS besides OTP. Push vendor | Notification rollout |
| Neighboring subareas after Kokobin | Expansion order |
| How long trip GPS points are kept after the 24-hour dispute window | Location log retention |

The unpaid timeout is specified to end as `PAYMENT_FAILED` in the master spec so it is not confused with search `EXPIRED`. That status mapping was not given its own name in the decision list. Confirm it if `CANCELLED` was intended instead.

## Still true of the repository

One Flutter app, one Node monolith, one Postgres database, no Supabase or Firebase as the system of record, no Cyrlo Maps HTTP API. Maps commit `d299ede80fb63ccaa3f8d8b2135f757897317dfd`. School transport stays out of local-ride tables.
