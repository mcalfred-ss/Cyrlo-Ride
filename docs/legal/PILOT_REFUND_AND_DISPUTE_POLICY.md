# Cyrlo Ride — Pilot refund & dispute policy

**Status:** Product-approved for Kokobin pilot (2026-11-09).  
**Authority:** Extends `CYRLO_RIDE_MASTER_SPEC.md` §10–11. Does not invent automatic refunds.  
**Money rule:** Original payments and ledger rows stay immutable. Any refund is a new compensating record, executed only with Finance refund permission.

---

## 1. Automatic matrix (unchanged)

| Situation | Booking fee | Rider token |
| --- | --- | --- |
| No rider accepts before search expiry | Refund | No deduction |
| Passenger cancels during search | Refund | No deduction |
| Rider cancels after acceptance | Refund | Refund |
| Passenger cancels after acceptance | **No automatic refund** | **No automatic refund** |
| Rider cannot complete the trip | Refund | Refund |
| Trip completed | No refund | No refund |

Unpaid timeout / provider failure: nothing captured → no fee refund, no token debit.

---

## 2. Passenger cancel after acceptance — review criteria

Support opens a case. Support **cannot** execute money movement. Finance may approve a **fee** refund only.

### Fee refund **may be granted** when evidence shows:

1. **Rider no-show / no-start** — assigned rider did not start the trip within a reasonable wait after accept, and GPS/history supports passenger waiting at the pickup; or  
2. **Rider fault after accept** — rider cancelled, went offline improperly, or clearly failed to proceed without passenger fault; or  
3. **Duplicate / failed capture edge** — payment anomaly confirmed by Finance (not a normal cancel).

### Fee refund is **refused** when:

1. Passenger changed mind after a rider accepted; or  
2. Passenger entered a wrong pickup / destination and wants out; or  
3. Passenger was unreachable / left the pickup; or  
4. Evidence is inconclusive.

### Token after passenger cancel (post-accept)

- **Default:** no token refund to the rider wallet reverse for passenger-initiated cancel (token already paid the assignment).  
- **Exception:** if the matrix row for **rider cancel / rider cannot complete** applies instead, follow that row (token refund).  
- Do not invent passenger goodwill token reverses in pilot.

---

## 3. Disputes after `COMPLETED`

- Either party may open a dispute within **24 hours** of `COMPLETED` or `CANCELLED`.  
- Support reviews status history, trip GPS log, and payment records.  
- **Hard rule for pilot:** a dispute after **`COMPLETED` does not authorize a refund.** The matrix “Trip completed → No refund” stands.  
- Outcomes allowed without money movement: notes, warnings, suspension review, rider quality flags.  
- The **only** money exceptions after completion are **not** “trip quality” disputes: proven **duplicate charge** or **clear payment fraud**, handled as Finance payment correction (still a new refund/ledger row, never rewriting `SUCCESS` payments).

---

## 4. Roles

| Role | May do |
| --- | --- |
| Support | Open/review cases and disputes; recommend grant/refuse |
| Finance | Execute fee/token refunds with MFA + audit |
| Operations | Rider suspension / zone actions from dispute findings |
| Super Admin | Break-glass only; still audited |

---

## 5. Terms alignment

User-facing Terms must summarize this matrix in plain language. See `docs/legal/TERMS_OF_SERVICE_DRAFT.md`.
