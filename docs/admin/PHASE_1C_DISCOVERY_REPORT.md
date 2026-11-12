# Cyrlo Ride — Phase 1C Discovery Report  
## Rider Management

**Date:** 2026-11-12  
**Mode:** Discovery / planning only — no application source changes, no migrations, no deploy  
**Branch:** `feature/admin-phase-0`  
**HEAD:** `8f4184027c68f20c0011e777cb5c34abc74a8025` — `feat(admin): implement phase 1b overview dashboard`

---

## 1. Repository baseline

| Check | Result |
| --- | --- |
| Branch | `feature/admin-phase-0` |
| HEAD | `8f41840` (matches expected Phase 1B commit) |
| Working tree | Clean |
| Phase 1A | Present as ancestor: `93bfe77 feat(admin): complete phase 1a authentication shell` |
| Phase 1B | HEAD commit |
| Phase 0 | Ancestor `545f455` |
| Ghana/maps stash | Intact: `stash@{0}: wip-ghana-maps-preserve-phase0` |

### Frontend baseline (relevant to Riders)

| Item | Location / notes |
| --- | --- |
| App | `apps/cyrlo_admin` — Phase 1A auth + Phase 1B Overview |
| `/riders` today | Placeholder — “Rider review UI is not in Phase 1A.” |
| Nav gate | `ReviewRiders` only (`nav.ts`) |
| Patterns to reuse | Overview fetch/error states; passenger-style directory when backend exists |

**Baseline matches expectations.** Proceed with discovery.

---

## 2. Backend endpoint inventory

All paths below are under `/api/v1`. Envelope: `{ success: true, data }` / `{ success: false, error: { code, message, details? } }`. Privileged routes require staff MFA access JWT (`role: ADMIN`, `purpose: access`, `mfa: true`).

### 2.1 Missing: rider directory / operational profile (critical)

There is **no** `GET /admin/riders` list and **no** `GET /admin/riders/:riderId` operational profile analogous to passengers.

| Desired capability | Exists? |
| --- | --- |
| Paginated rider directory (all verification statuses) | **No** |
| Search riders by phone / name / id | **No** |
| Filter by account status / availability / verification | **No** |
| Unified rider profile for ops (status + availability + vehicles + tokens summary) | **No** |

Closest existing patterns:

- Passenger directory: `GET /admin/passengers`, `GET /admin/passengers/:passengerId`, … (`ViewBookingHistory`)
- Pending applications only: `GET /admin/riders/applications` (`ReviewRiders`)

### 2.2 Application review (implemented)

Mounted: `createRiderOpsRouter` → `app.use('/admin/riders', …)`.

| Method / URL | Permission | Request | Response `data` (exact fields from service) | Pagination | Errors | Usable? |
| --- | --- | --- | --- | --- | --- | --- |
| `GET /admin/riders/applications` | `ReviewRiders` | — | Array of `{ riderId, fullName, phoneNumber, status, verificationStatus, submittedAt, vehicleCount }` — **pending applications only** | None (full pending set) | 401/403 MFA/permission | **Yes** |
| `GET /admin/riders/applications/:riderId` | `ReviewRiders` | `riderId` UUID | Application detail (see §4) — **does not include availability / account status / GPS / tokens** | — | 404 application | **Yes** |
| `POST /admin/riders/applications/:riderId/review` | `ReviewRiders` | Body `{ decision: APPROVED\|REJECTED, reason? }` — reject requires reason ≥5 chars | Updated application detail | — | 400/409 not pending | **Yes** |
| `POST /admin/riders/vehicles/:vehicleId/review` | `ReviewRiders` | Same review body | Vehicle review result | — | 400/409 | **Yes** |

### 2.3 Identity documents (implemented; sensitive)

| Method / URL | Permission | Extra | Response | Usable? |
| --- | --- | --- | --- | --- |
| `GET /admin/riders/documents/:documentId/content` | `AccessIdentityDocuments` | **`requireRecentMfa()`** | `{ url, expiresIn }` signed download; audited `rider.document.viewed` | **Yes** (step-up UX) |
| `GET /admin/riders/applications/:riderId/ghana-card` | `AccessIdentityDocuments` | **`requireRecentMfa()`** | `{ ghanaCardNumber, keyVersion }`; audited `rider.identity.accessed` | **Yes** (step-up UX) |

### 2.4 Zone approvals for a rider (implemented)

Mounted: `createRiderZoneAdminRouter` under `/admin/riders`.

| Method / URL | Permission | Response highlights | Usable? |
| --- | --- | --- | --- |
| `GET /admin/riders/:riderId/zone-approvals` | `ManageServiceZones` | `{ approvalId, zoneId, zoneName, zoneActive, status, reason, decidedAt, updatedAt }[]` | **Yes** (Ops/Super) |
| `GET /admin/riders/:riderId/zone-approvals/history` | `ManageServiceZones` | Decision history rows | **Yes** |

### 2.5 Staff GPS read (implemented; privacy-sensitive)

| Method / URL | Permission | Response | Notes | Usable? |
| --- | --- | --- | --- | --- |
| `GET /admin/riders/:riderId/location` | `MonitorOperations` **or** `ViewTripGpsEvidence` | `{ riderId, sharingEnabled, recordedAt, receivedAt, fresh, latitude, longitude, accuracyMeters, heading }` | Audited **without** storing coords in audit metadata; 404 if no location row | **Yes** for Ops/Support GPS roles |

**Not a live WebSocket feed.** Value is the latest stored location row + freshness flag (`RIDER_LOCATION_MAX_AGE_MS` = 30s).

### 2.6 Account suspend / reinstate (implemented)

| Method / URL | Permission | Body | Response | Usable? |
| --- | --- | --- | --- | --- |
| `POST /admin/users/suspend` | `SuspendReinstateRiders` | `{ userId: uuid, reason: string min 2 max 200 }` **reason mandatory** | `{ userId, status: 'SUSPENDED', activeTripsPreserved, sessionsRevoked }` | **Yes** |
| `POST /admin/users/reinstate` | `SuspendReinstateRiders` | Same shape — **reason mandatory** | `{ userId, status: 'ACTIVE' }` | **Yes** |

Applies to passenger **or** rider users (not ADMIN). See §5.

### 2.7 Booking / cancellation history (partial reuse)

| Method / URL | Permission | Rider relevance | Usable for 1C? |
| --- | --- | --- | --- |
| `GET /admin/bookings` | `ViewBookingHistory` | Query supports `riderId`, `status`, `from`/`to`, pagination (`page`/`pageSize`, default 20, max 100) | **Yes** — rider booking history via filter |
| `GET /admin/bookings/:bookingId` | `ViewBookingHistory` | Detail without exact lat/lng | **Yes** |
| `GET /admin/passengers/:id/cancellations` | `ViewBookingHistory` | Passenger-only | **No** rider cancel queue |
| Rider-specific cancellations list | — | **Does not exist** | Use bookings `status=CANCELLED` + `riderId` |

Ordinary booking payloads set `exactCoordinatesIncluded: false`.

### 2.8 Tokens (implemented for Finance; limited for Ops)

| Method / URL | Permission | Query | Response | Usable for rider profile? |
| --- | --- | --- | --- | --- |
| `GET /admin/token-ledgers` | `ViewTokenLedgers` | `page`, `pageSize`, optional `riderId`, `type`, `from`, `to` | Paginated ledger rows with `tokenDelta`, `balanceAfter`, rider `{ fullName, phoneNumber, status }` | **Yes for Finance/Super** filtered by `riderId` |
| `GET /wallet/balance` (rider self) | Rider auth | — | `{ riderId, tokenBalance }` | **Not** an admin API |
| Admin current balance endpoint | — | — | **Missing** | Derive cautiously from latest `balanceAfter` for a rider, or add small backend field later |

Ops **does not** have `ViewTokenLedgers` in the role map.

### 2.9 Analytics-only rider snapshot (not a directory)

`GET /admin/analytics` exposes aggregate `snapshot.riders.{ registered, availableApprox, pendingApplications }` — useful for Overview, **not** for browsing individuals.

---

## 3. Exact rider status definitions

**Do not collapse these into one badge.**

| Concept | Source of truth | Values / meaning | Live? |
| --- | --- | --- | --- |
| **Account status** | `users.status` | `ACTIVE`, `SUSPENDED`, `DELETED` | Persistent account flag |
| **Verification status** | `rider_profiles.verification_status` | `DRAFT`, `PENDING_REVIEW`, `APPROVED`, `REJECTED` | Onboarding/compliance — not online |
| **Availability** | `rider_profiles.availability` | `OFFLINE`, `AVAILABLE`, `BUSY` | Rider intent / trip state; **DB snapshot**, not a push stream |
| **GPS sharing** | `rider_locations.sharing_enabled` | boolean | Last known sharing flag |
| **GPS freshness** | `receivedAt`/`recordedAt` vs `RIDER_LOCATION_MAX_AGE_MS` (30s) | `fresh: true/false` on staff location read | Snapshot at request time |
| **Token eligibility** | Wallet `tokenBalance` + matching `INSUFFICIENT_TOKENS` | Numeric balance; matching may require tokens | Balance is current DB value; admin lacks dedicated balance GET |
| **Operational / matching eligibility** | `evaluateOperationalEligibility` / matching filters | Composite reasons (`ACCOUNT_NOT_ACTIVE`, `RIDER_NOT_APPROVED`, `GPS_NOT_FRESH`, `NOT_ONLINE`, …) | Computed on demand; matching query requires `user.status = ACTIVE` |

### Suspension vs availability

- Suspend sets **account** `SUSPENDED` and forces rider availability **OFFLINE**.
- It does **not** invent a separate “suspended availability” enum value.
- Matching candidates require `user.status: ACTIVE`, so suspended riders are excluded from new offers.
- ACCEPTED / IN_PROGRESS trips are **preserved** (`activeTripsPreserved`); suspend does not cancel them.

### Reinstate

- Sets account back to `ACTIVE`.
- Does **not** automatically set availability to `AVAILABLE`.
- Does **not** auto-grant zones, tokens, or GPS sharing.
- Rider must go online again through the normal eligibility path after reinstate.

### `availableApprox` (Overview)

Analytics approximate count: approved + `AVAILABLE` + active user + location sharing + fresh GPS. **Snapshot aggregate**, not a live board.

---

## 4. Rider profile data availability

| Profile area | Available via existing admin API? | Source |
| --- | --- | --- |
| Phone / full name | Partial — applications list/detail; ledger rows; not full directory | Applications / ledgers |
| Account status | Applications list includes `status`; application **detail** omits user status | Gap on detail |
| Verification status | Applications APIs | Yes |
| Vehicles + vehicle verification | Application detail | Yes |
| Documents metadata | Application detail | Yes |
| Ghana Card plaintext | Reveal endpoint + recent MFA | Yes (sensitive) |
| Availability | **Not** on application detail | Gap for ops profile |
| GPS + freshness | Staff location endpoint | Yes (privileged) |
| Zone approvals | Zone admin endpoints | Yes (`ManageServiceZones`) |
| Token balance | No admin balance GET | Gap / Finance ledger workaround |
| Token ledger | `GET /admin/token-ledgers?riderId=` | Finance/Super |
| Booking history | `GET /admin/bookings?riderId=` | Support/Ops/Super (`ViewBookingHistory`) |
| Cancellation history | No dedicated rider endpoint | Approximate via bookings filter |

### Application detail shape (`GET /admin/riders/applications/:riderId`)

```ts
{
  riderId: string;
  fullName: string;
  verificationStatus: string;
  driversLicenceNumber: string | null;
  driversLicenceExpiry: string | null; // ISO
  submittedAt: string | null;
  hasEncryptedGhanaCard: boolean;
  ghanaCardNumber: null; // never inline; use reveal endpoint
  documents: Array<{ id, kind, vehicleId, contentType, sizeBytes, createdAt }>;
  vehicles: Array<{
    id, category, registrationNumber, make, model, colour, capacity,
    verificationStatus, rejectionReason
  }>;
  reviewHistory: Array<{ id, decision, reason, vehicleId, createdAt, actorId }>;
}
```

---

## 5. Suspension / reinstatement workflow

| Item | Behavior |
| --- | --- |
| Who | `SUPER_ADMIN`, `OPERATIONS_ADMIN` only (`SuspendReinstateRiders`) |
| Support / Finance | **Cannot** suspend/reinstate |
| Request fields | `userId` + **mandatory** `reason` (2–200 chars) for both actions |
| Audit | `admin.user.suspended` / `admin.user.reinstated` with reason, role, prior status / sessionsRevoked |
| Notifications | In-app (+ push channel enqueue) when Prisma present |
| Active bookings | Not cancelled; count returned as `activeTripsPreserved` |
| Sessions | All refresh sessions revoked on suspend |
| Offers / matching | Suspended users fail ACTIVE filter / `ACCOUNT_NOT_ACTIVE` — **no new offers** |
| Tokens | Not altered by suspend/reinstate |
| Self-suspend | Forbidden |
| ADMIN targets | Conflict — use grant revoke instead |
| Reinstate eligibility | Account ACTIVE only; online eligibility still requires approved rider/vehicle/zone/GPS/tokens as usual |

**Do not modify these workflows in Phase 1C FE** — only call them with confirmation + reason.

---

## 6. Role and permission matrix (rider-related)

Aligned with `ADMIN_ROLE_PERMISSION_MATRIX.md` + coded `rolePermissionMap`.

| Capability | Super | Ops | Finance | Support | FE nav today |
| --- | --- | --- | --- | --- | --- |
| Riders nav (`ReviewRiders`) | Y | Y | N | N | `/riders` gated on ReviewRiders |
| Application queue / approve | Y | Y | N | N | Placeholder |
| Identity docs / Ghana Card | Y | Y (+ recent MFA) | N | N | — |
| Suspend / reinstate | Y | Y | N | N | No UI yet |
| Staff GPS location | Y | Y (`MonitorOperations`) | N | Y (`ViewTripGpsEvidence`) | — |
| Zone approvals for rider | Y | Y | N | N | — |
| Booking history by riderId | Y | Y | N | Y | Bookings placeholder |
| Token ledgers by riderId | Y | N | Y | N | Finance placeholder |

**Frontend must not show suspend to Support** even if a rider id is known from bookings. Backend remains authoritative (403).

**Nav gap:** Support may need rider context from Bookings, not from Riders nav — acceptable; do not grant `ReviewRiders` to Support without product change.

---

## 7. Proposed frontend layout (only backend-backed)

### 7.A Practical Phase 1C scope (recommended)

Split UI into two surfaces under `/riders`:

1. **Applications** (shippable now)  
2. **Directory / ops profile** (blocked until small list/get API — see gaps)

#### Applications (`ReviewRiders`)

- Table from `GET /admin/riders/applications`.
- Detail from `GET /admin/riders/applications/:riderId`.
- Actions: approve/reject application; vehicle review; optional MFA-gated document/Ghana Card open.
- Loading / empty (“No pending applications”) / 403 / 401 states.
- **Do not** claim this is the full rider fleet directory.

#### Directory (after backend list/get)

- Search `q` (phone/name), filter account status + verification status (+ availability if API returns it).
- Pagination matching passenger console (`page`/`pageSize`/`hasNextPage`).
- Row → ops profile.

#### Ops profile panels (compose existing endpoints where permitted)

| Panel | API | Role gate |
| --- | --- | --- |
| Application / vehicles | applications detail | ReviewRiders |
| Account actions | suspend / reinstate | SuspendReinstateRiders |
| Zones | zone-approvals | ManageServiceZones |
| Location | `/:id/location` | MonitorOps / ViewTripGpsEvidence |
| Bookings | `/admin/bookings?riderId=` | ViewBookingHistory |
| Tokens | `/admin/token-ledgers?riderId=` | ViewTokenLedgers |

Show separate labeled chips: Account · Verification · Availability · GPS freshness — never one fused status.

#### Account actions UX

- Confirm dialogs for suspend/reinstate.
- Mandatory reason textarea (mirror API).
- Display `activeTripsPreserved` on suspend success.
- Clear error banners for 403/409/404.
- No optimistic “online after reinstate”.

### 7.B Out of Phase 1C UI (no API)

- Live rider map / polling board.
- Admin token balance badge without new field (unless Finance-only ledger derivation is explicitly accepted).
- Performance scorecards / ratings.
- Rider cancellation queue distinct from bookings.

---

## 8. API gaps

| Gap | Operational need | Smallest backend change | Blocks Phase 1C? |
| --- | --- | --- | --- |
| **Paginated rider directory** `GET /admin/riders` | Browse all riders (not only pending applications); search/filter by account & verification | Mirror `listPassengers`: query `q`, `status`, optional `verificationStatus` / `availability`; permission **`ReviewRiders`** (or product-chosen anyOf with ViewBookingHistory — decide explicitly) | **Yes** for full Rider Management directory |
| **Ops rider profile** `GET /admin/riders/:riderId` | Single payload: account status, verification, availability, vehicles summary, submittedAt, phone | Mirror `getPassenger` + rider profile fields; keep identity secrets out | **Yes** for a coherent profile page (else FE joins many endpoints awkwardly and still lacks availability) |
| Admin token **balance** field | Ops/Finance see current tokens without inferring from ledger | Add `tokenBalance` on profile **or** `GET /admin/riders/:id/wallet` gated `ViewTokenLedgers` | **No** for MVP if Finance uses ledgers; **soft gap** for Ops |
| Rider cancellation history endpoint | Support ops convenience | Optional thin alias over bookings filter | **No** |
| Applications detail missing `user.status` / availability | Reviewers see account state on same screen | Add fields to `getApplicationForOps` | Soft — helpful, not blocking applications queue |
| Availability filter without directory | Ops fleet filter | Requires directory API | Covered by directory gap |
| Live availability feed | Real-time ops board | New realtime API | **Out of scope**; do not invent |

**Do not invent FE-only directories.** Prefer the passenger-console pattern for the two new GETs.

---

## 9. Test plan (for implementation phase)

### Backend (if directory/profile added)

1. List riders pagination, `q`, status/verification filters.
2. Get rider 404 / permission 403.
3. Suspend/reinstate reason validation + audit metadata (existing tests remain green).
4. Matching still excludes suspended riders.

### Frontend

1. Applications list load / empty / error / 403.
2. Application detail + approve/reject validation.
3. Suspend/reinstate dialogs send mandatory reason; success shows preserved trips.
4. Role visibility: Support cannot see Riders nav / suspend; Finance cannot review applications.
5. Profile panels call only permitted endpoints; 403 panels fail closed.
6. Separate status labels rendered (account ≠ availability ≠ GPS).
7. Bookings panel uses `riderId` query; no fabricated coordinates.
8. No automatic polling.

### Manual smoke

- Ops MFA → applications → optional suspend test rider on local DB.
- Confirm reinstate leaves rider OFFLINE until they go online.

---

## 10. Ordered implementation phases

1. **Product confirm** permission for directory (`ReviewRiders` recommended) and whether Support ever sees a read-only rider card from bookings.  
2. **Backend (smallest):** `GET /admin/riders` + `GET /admin/riders/:riderId` (passenger-parity fields + availability + verification). Optional: add `user.status`/`availability` onto application detail.  
3. **Frontend 1C-A — Applications queue** against existing review APIs (can start in parallel once product accepts dual surfaces).  
4. **Frontend 1C-B — Directory + ops profile** once list/get land; wire suspend/reinstate, zones, location, bookings, Finance ledgers by permission.  
5. Tests + short `PHASE_1C_IMPLEMENTATION_REPORT.md`.  
6. Stop for review before commit.

---

## Recommendation

### READY WITH CONDITIONS

Phase 1C can proceed, but **full Rider Management (directory + ops profile)** is **blocked** on a small, well-scoped backend addition mirroring the passenger console.

**What is ready now (no new endpoints):**

- Pending applications list/detail/review/vehicle review.
- MFA-gated identity document / Ghana Card access.
- Suspend/reinstate with mandatory reason + audit.
- Booking history by `riderId`.
- Staff GPS snapshot + zone approvals (role-gated).
- Finance token ledgers by `riderId`.

**Conditions:**

1. Do not ship a fake “all riders” UI from applications-only data.  
2. Keep account / verification / availability / GPS / tokens as separate UI concepts.  
3. Do not treat availability or GPS as a live feed.  
4. Gate actions strictly by existing permissions; backend remains authority.  
5. Add directory + profile GETs before claiming Rider Management complete — or explicitly scope 1C to **Applications only** and defer directory to 1C.1.

---

**Stop.** Discovery only — awaiting review before Phase 1C implementation.
