# Cyrlo Ride — Phase 0 Final Pre-Commit Review

**Date:** 2026-11-12  
**Mode:** READ-ONLY (no code changes, no stage/commit/push/deploy, no stash mutation)  
**Branch:** `feature/admin-phase-0` @ `44e024a` (matches `origin/main`; Phase 0 work uncommitted)  
**Verdict:** **READY WITH NON-BLOCKING LIMITATIONS**

S1/S2/A1 product fixes and Phase 0 console APIs are coherent enough to commit on the feature branch. Remaining items are documentation gaps, pre-existing trip-gps edge cases, and known Phase 1 auth constraints — not commit blockers for this backend foundation.

---

## 1. Complete diff inspection

### Working tree

| Category | Paths | Assessment |
| --- | --- | --- |
| Modified | `backend/prisma/schema.prisma` (3 indexes); `admin/index.ts`, `admin/module.routes.ts`; `audit/module.routes.ts` (comment); wallet admin ledger surface | Phase 0–scoped; no Ghana/maps files |
| Untracked code | `admin/console.*`, migration `20261112120000_admin_phase0_console_indexes` | Expected Phase 0 deliverables |
| Untracked docs | `docs/admin/*` (audit + Phase 0 + review reports) | Expected; commit with Phase 0 |
| Staged | **Empty** | Safe |
| Commits ahead of `origin/main` | **0** | No premature commit |

**No accidental unrelated application changes** detected in the diff. Ghana/maps remains only in `stash@{0}: wip-ghana-maps-preserve-phase0`.

### Permission / contract spot-checks (post-fix)

| Check | Result | Evidence |
| --- | --- | --- |
| S1 passenger directory | `ViewBookingHistory` only | `module.routes.ts` 146–166 |
| Suspend still separate | `SuspendReinstateRiders` on suspend/reinstate only | `module.routes.ts` 88–112 |
| S2 ordinary booking coords | Not selected / not serialized | `console.repository.ts` list/find selects; `console.service.ts` list/get (no lat/lng fields) |
| A1 snapshot vs period | Explicit `snapshot` / `period` + `dateRange` | `console.service.ts` 96–157 |
| Sensitive leakage on ordinary bookings | No latitude/longitude in console serialization | Grep of `console.service.ts` / `console.repository.ts` booking selects |

### Incomplete documentation (non-blocking)

| ID | Severity | Finding |
| --- | --- | --- |
| D1 | Low | `ADMIN_DASHBOARD_REQUIREMENTS.md` documents snapshot/period windows but **does not** mention ABANDONED fee exclusion (API response does). |
| D2 | Low | `ADMIN_API_INVENTORY.md` analytics row does not call out ABANDONED or gross-vs-net SUCCESS explicitly (inventory §10 covers snapshot/period). |
| D3 | Low | OpenAPI/Swagger still not updated for Phase 0 paths (known Phase 0 acceptance debt). |

---

## 2. Precise-location access (`trip-gps`)

### Route registration

| Item | Detail |
| --- | --- |
| Path | `GET /api/v1/admin/bookings/:bookingId/trip-gps` |
| Mount | `app.ts` 109: `api.use('/admin', modules.disputes.adminRouter)` |
| Definition | `disputes/module.routes.ts` 53–60 |

### Controls verified

| Requirement | Status | Evidence |
| --- | --- | --- |
| Staff authentication | **Pass** | `authenticate` + `requireActiveAccount` |
| Recent MFA | **Pass** | `requireRecentMfa()` (`authorize.ts` 228–255) |
| Permission | **Pass** | `requirePermission(Permission.ViewTripGpsEvidence)` |
| Unauthorized roles | **Pass** | Finance/Ops lack `ViewTripGpsEvidence` in `permissions.ts` 42–71 (Support + Super only among non-super catalog roles for Support; Super has all) |
| Audit logging | **Pass** | `getTripGpsEvidence` records `dispute.trip_gps.viewed` (`module.service.ts` 227–236) |
| Ordinary booking leak | **Pass** | Phase 0 console booking list/detail omit coords; dispute default evidence omits lat/lng (`module.repository.ts` 131–138) |

### Findings (pre-existing; not introduced by Phase 0)

| ID | Severity | File / lines | Problem | Recommended correction (later) |
| --- | --- | --- | --- | --- |
| T1 | Low | `disputes/module.service.ts` 227–248; `module.repository.ts` 148–162 | No booking existence check: unknown `bookingId` returns `{ points: [] }` and still writes an audit row | Return 404 when booking missing before audit |
| T2 | Low | `permissions.ts` 42–52 vs trip-gps | Operations Admin has `MonitorOperations` (staff live location) but **not** `ViewTripGpsEvidence`, so Ops cannot use trip-gps | Product: grant Ops trip-gps or document Ops must use rider location + Support for trails |
| T3 | Low | `module.repository.ts` 148–152 | Hard cap `take: 500` — fine; long trips may truncate without paging | Document or paginate |

**Conclusion:** The MFA-protected trip-gps path **exists and is enforced** as described. Ordinary Phase 0 booking endpoints do not re-expose the same coordinates. T1–T3 are non-blocking for Phase 0 commit.

---

## 3. ABANDONED payment reporting

| Check | Result |
| --- | --- |
| Excluded from fee buckets | **Yes** — only SUCCESS / PENDING / FAILED aggregated (`console.service.ts` 87–89) |
| Response identifies exclusion | **Yes** — `exclusions.abandonedBookingFeePayments` (`console.service.ts` 152–156) |
| Requirements doc explains limitation | **Partial** — not in `ADMIN_DASHBOARD_REQUIREMENTS.md` (finding D1) |
| Misrepresented as full reconciliation? | **No**, if UI treats `collected` as **gross SUCCESS** and shows refunds separately (`period.refunds.byStatus` includes amounts). Not a closed Paystack ledger. |

**Acceptable for initial dashboard?** **Yes**, with UI copy that fee buckets exclude ABANDONED and that SUCCESS is gross (refunds listed separately). Prefer adding one requirements/inventory sentence on commit or immediately after (D1/D2).

---

## 4. Analytics contracts

Frontend-visible contract (`console.service.ts` 96–157 + `ANALYTICS_DATE_RANGE_SEMANTICS` 17–23):

| Need | Field / shape |
| --- | --- |
| Requested period | `dateRange.from`, `dateRange.to` (ISO or null) |
| Timezone / bounds | `dateRange.timezone: 'UTC'`, `boundInclusivity: 'inclusive'`, `field: 'createdAt'`, `interpretation` |
| Snapshots | `snapshot.passengers.*`, `snapshot.riders.*` (ignore window) |
| Period metrics | `period.bookings`, `period.connectionFees`, `period.refunds`, `period.tokens` |
| Exclusions / limits | `exclusions.transportationFareRevenue`, `exclusions.note`, `exclusions.abandonedBookingFeePayments` |
| Validation | Invalid datetime / `from > to` → `VALIDATION_ERROR` (`parseOptionalDate` / `assertRange`) |

**Financial report** reuses `dateRange` + `period` + `exclusions`; snapshot is a note stub (`getFinancialReport` 161–176).

No blocking contract gaps for Overview/Finance UI integration after commit.

---

## 5. Final Git safety check

| Check | Result |
| --- | --- |
| Branch | `feature/admin-phase-0` |
| HEAD | `44e024aede3118b42f295107dc14b1c8d1e75090` |
| Staged changes | None |
| Untracked | Phase 0 backend + `docs/admin/*` only (expected) |
| Ghana/maps stash | Intact — `stash@{0}: wip-ghana-maps-preserve-phase0` |
| Commit created this session | **No** (`origin/main..HEAD` empty) |
| Push / deploy | **None observed** |

---

## 6. Verdict

### **READY WITH NON-BLOCKING LIMITATIONS**

Phase 0 may be **committed on `feature/admin-phase-0`** (when authorized). Do not push to main or deploy as part of commit hygiene unless separately requested.

### Non-blocking limitations (carry forward)

1. **D1/D2** — Document ABANDONED exclusion (+ gross SUCCESS) in requirements/inventory when convenient.  
2. **T1–T3** — Pre-existing trip-gps 404/Ops grant/500-cap polish.  
3. **Admin refresh MFA** — Still blocks durable SPA sessions; Phase 1 must force re-MFA or fix refresh.  
4. **D3** — OpenAPI not updated.  
5. **Net revenue** — Dashboard must not treat `period.connectionFees.collected` as net of refunds.

### Critical / commit-blocking issues

**None found** for S1/S2/A1 or Phase 0 console authz/coord privacy.

---

## 7. Reviewer summary

**Inspected:** Full dirty/untracked tree; admin console routes/service/repository; wallet ledger route; prisma index diff; disputes trip-gps route/service/repository; permissions map; app mount; analytics exclusions; admin docs for ABANDONED/snapshot/period; Git branch/stash/staged/ahead state.

**Did not:** Modify code, stage, commit, push, deploy, pop stash, or run Paystack.

**Safe to commit Phase 0 on the feature branch:** **Yes**, with the non-blocking limitations above tracked for follow-up.
