# Cyrlo Ride — Phase 12: Backend Production Readiness Audit

**Date:** 2026-11-07  
**Scope:** Read-only audit of the implemented backend after Phases 1–11C.  
**Database under review:** application target `cyrlo_ride_app` (legacy `cyrlo_ride` not touched).  
**Restriction honored:** no code, migration, secret, or database changes. This document is the only deliverable.

---

## 1. Executive summary

The modular monolith is **internally substantial and largely consistent** with the approved master specification. Automated verification is green (**33 files / 164 tests**, typecheck, build, Prisma validate, migrate status up to date). Core money paths (Paystack HMAC webhooks, SEARCHING only after fee SUCCESS, concurrent offer accept with row locks + one-debit indexes, refund claim/lock with SUCCESS only after provider confirmation) are implemented carefully.

It is **not ready for unrestricted production**, and a **controlled pilot is blocked** until a short list of external and policy defects is closed—chiefly **no SMS vendor adapter** (OTP login impossible), **refund worker auto-submitting Support-queued refunds** (Finance MFA/`ExecuteRefunds` bypass), and **missing-refund sweeper over-coverage** that can refund bookings the policy leaves non-refundable.

Architecture recommendation: **retain** Node/Express/Prisma/Postgres/Paystack/FCM HTTP v1/R2. Do not replace with Supabase or Firebase Auth/DB.

---

## 2. Overall production readiness assessment

| Gate | Verdict |
| --- | --- |
| Unrestricted production | **NOT READY** |
| Controlled pilot (limited riders/passengers, ops on call) | **NOT READY** until Critical/High pilot blockers below are fixed or explicitly waived with compensating controls |
| Internal dogfood / staging with known gaps | **ACCEPTABLE** for technical soak (memory SMS/push, test Paystack) |

**Area scores**

| Area | Score | Notes |
| --- | --- | --- |
| A Auth / sessions | **BLOCKED** | Logic strong; SMS adapter absent |
| B Admin RBAC / MFA | **FIX** | Grant reload sound; MFA throttle / invite reset gaps |
| C Rider onboarding | **FIX** | Encryption sound; upload/review hardening gaps |
| D Service zones | **FIX** | Pickup gate works; polygon topology + overlap gaps; no sourced pilot polygon |
| E Location / availability | **FIX** | Freshness rules present; socket auth thin; GPS under global IP limiter |
| F Booking / payments | **FIX** | Fee + webhook solid; no pending-charge poll |
| G Matching / offers | **FIX** | Accept race safe; ranking unresolved; dispatch not fully serialized |
| H Trip / disputes | **BLOCKED** | Transitions sound; refund auto-exec undercuts Finance gate |
| I Wallet / tokens | **GO** | Snapshots + exactly-once credit verified in DB tests |
| J Notifications / FCM | **FIX** | FCM v1 solid; outbox retry/channel bugs; SMS blocker |
| K Financial reconciliation | **BLOCKED** | Claim/SUCCESS logic good; worker policy + sweeper defects |
| L Security / ops | **FIX** | TRUST_PROXY parse good; deploy defaults risky |

---

## 3. Audit methodology and commands executed

**Method:** Static inspection of `backend/src`, `backend/prisma`, and architecture docs; cross-module workflow tracing; independent re-run of local verification.

**Commands (from `backend/`):**

| Command | Result |
| --- | --- |
| `npm run typecheck` | **Pass** (exit 0) |
| `npx prisma validate` | **Pass** — schema valid |
| `npx prisma migrate status` | **Pass** — 13 migrations, schema up to date on local `cyrlo_ride_app` |
| `npm test` (`vitest run`) | **Pass** — **33 files / 164 tests** |
| `npm run build` (`tsc`) | **Pass** (exit 0) |
| Lint | **Not configured** (no `lint` script) |

**Not run (by design):** live Paystack charges, live FCM sends, production DB access, penetration tests, dependency `npm audit --force` upgrades.

**Integration verification posture:** most external I/O covered by mocks/`Memory*` clients. Opt-in FCM script exists (`scripts/verify-fcm-http-v1.ts`) but was **not** executed (no service-account credentials in workspace). SMS live path **cannot** succeed until an adapter is wired.

---

## 4. Findings by module

Severity key: **CRITICAL** / **HIGH** / **MEDIUM** / **LOW** / **INFO**.  
Blocks: **P** = production, **Pilot** = controlled pilot, **Later** = post-pilot.

### A. Authentication and sessions

| ID | Sev | Finding | Evidence | Impact | Resolution | Blocks |
| --- | --- | --- | --- | --- | --- | --- |
| P12-A-001 | **CRITICAL** | No SMS vendor adapter registered | `infrastructure/sms/sms.provider.ts` — `SUPPORTED_SMS_PROVIDERS = []`; credentials → `UnsupportedSmsProvider` fail-closed | Passenger/rider/admin OTP login cannot deliver codes in real environments | Wire existing vendor contract; fail readiness when SMS required and `ready=false` | **P + Pilot** |
| P12-A-002 | INFO | OTP HMAC, attempts, expiry, replay, Serializable passenger verify | `auth/module.repository.ts`, `common/security/otp.ts` | Verified sound | — | — |
| P12-A-003 | INFO | Refresh rotation + family revoke on reuse; JWT HS256 + iss/aud | `auth/module.repository.ts`, `common/security/tokens.ts` | Verified sound | — | — |
| P12-A-004 | MEDIUM | OTP resend cooldown race; challenge committed before SMS send | `createOtpChallenge` read-then-write | Parallel resends / vendor failure burns cooldown | Serialize create; mark challenge failed if send fails | Later |
| P12-A-005 | LOW | `/auth/refresh` only under global IP limiter | `auth/module.routes.ts`, `rate-limit.ts` | Refresh abuse within global budget | Dedicated limiter | Later |
| P12-A-006 | INFO | Dev OTP expose hard-disabled in production | `canExposeDevelopmentOtp` | Verified | — | — |

### B. Admin RBAC and MFA

| ID | Sev | Finding | Evidence | Impact | Resolution | Blocks |
| --- | --- | --- | --- | --- | --- | --- |
| P12-B-001 | INFO | Legacy `ADMIN` alone grants nothing; live grant + MFA required | `authorize.ts` `createRequirePermission` reloads grant from DB | Verified | — | — |
| P12-B-002 | HIGH | MFA verify has no attempt lockout / failure audit | `POST /admin/auth/mfa/verify`, `AdminServiceImpl.verifyMfa` | After SMS OTP, TOTP can be guessed within MFA-pending TTL under IP limits | Per-user failure counter, audit, single-use `jti` | **P** |
| P12-B-003 | HIGH | Invitation accept can reset MFA without phone proof | `acceptInvitation` + `upsertMfaSecret` clears `enabledAt` | Leaked invite for existing admin phone → MFA takeover | Require OTP on accept; refuse reset if MFA already enabled without step-up | **P** |
| P12-B-004 | MEDIUM | Admin OTP attempt counting not concurrency-safe | `AdminRepository.consumeAdminOtp` | Parallel guesses can exceed max attempts | Match passenger Serializable + conditional update | **P** |
| P12-B-005 | MEDIUM | Bootstrap not single-transaction | `AdminServiceImpl.bootstrap` | Concurrent bootstrap can leave orphan Super Admin | One TX / advisory lock | **P** |
| P12-B-006 | MEDIUM | Suspend/reinstate/invite/revoke lack `requireRecentMfa` | `admin/module.routes.ts` | Long-lived stolen access token usable for sensitive ops (mitigated while access TTL ≈ recent MFA window) | Mount `requireRecentMfa` | Later |
| P12-B-007 | LOW | Staff refresh cannot restore MFA session | `issueStaffSession` vs `/auth/refresh` | Confusing but safe | Stop issuing staff refresh or require MFA step-up | Later |

### C. Rider onboarding / identity

| ID | Sev | Finding | Evidence | Impact | Resolution | Blocks |
| --- | --- | --- | --- | --- | --- | --- |
| P12-C-001 | INFO | Ghana Card encrypted under distinct IDENTITY key; plaintext column not written | `riders/module.service.ts`, schema `ghanaCardNumber` legacy | Verified | Drop legacy column after empty check | Later |
| P12-C-002 | HIGH | Example MFA/identity keys accepted in production boot | `.env.example` all-zero / `0x02` keys; `env.ts` placeholder refine omits them | Copying example → ciphertext under public keys | Reject known weak keys in production | **P** (if example copied) |
| P12-C-003 | MEDIUM | Upload trusts client MIME; no magic-byte/virus scan; orphan R2 objects | `upload.ts`, `object-storage.ts` | Malicious/oversized content, orphans | Sniff MIME; scan; transactional cleanup | Later |
| P12-C-004 | MEDIUM | Review application not fully transactional | `reviewApplication` multi-write | Concurrent reviews / partial state | Single TX + conditional status | Later |
| P12-C-005 | MEDIUM | Identity decrypt ignores stored `keyVersion` | `secret-box.ts` / reveal path | No rotation path | Key ring + AAD | Later |
| P12-C-006 | INFO | Reveal needs `AccessIdentityDocuments` + recent MFA + audit | `riders` ops routes | Verified | — | — |
| P12-C-007 | INFO | R2 fail-closed when unset; signed URL TTL default 60s | `object-storage.ts` | Verified | — | — |

### D. Service zones

| ID | Sev | Finding | Evidence | Impact | Resolution | Blocks |
| --- | --- | --- | --- | --- | --- | --- |
| P12-D-001 | INFO | Booking create requires active zone covering pickup | `BookingsServiceImpl.create` + `findActiveZoneCoveringPickup` | Inactive/missing zone cannot authorize booking | — | — |
| P12-D-002 | MEDIUM | Geometry validation lacks self-intersection / zero-area / Ghana extent | `zone-geometry.ts` | Bad ops polygons can go live | Topology checks | Later |
| P12-D-003 | MEDIUM | Overlapping active zones: arbitrary zone pick | `findActiveZoneCoveringPickup` unordered | Rider approvals can miss | Reject overlap or deterministic order | Pilot if overlapping |
| P12-D-004 | INFO | Sourced Ahenema Kokoben polygon not in repo | Master spec § unresolved | Cannot launch geo pilot without ops-loaded zones | Load verified polygons | **Pilot** |

### E. Location and availability

| ID | Sev | Finding | Evidence | Impact | Resolution | Blocks |
| --- | --- | --- | --- | --- | --- | --- |
| P12-E-001 | INFO | 30s freshness + 2s future skew + server `receivedAt` | `location-freshness.ts`, locations service | Verified | — | — |
| P12-E-002 | MEDIUM | Stale past `recordedAt` may be accepted if recently received | Freshness primarily on receive path | Old device clock can pollute trip trail | Also require `now - recordedAt ≤ 30s` for eligibility/evidence | Later |
| P12-E-003 | HIGH | Authenticated GPS under global IP rate limit | `app.ts` + `RATE_LIMIT_MAX=300` | Carrier NAT + frequent GPS → 429 → riders go stale | Per-user limiter for location; raise pilot limits | **P + Pilot** |
| P12-E-004 | MEDIUM | Socket JWT accepts any purpose; no suspend re-check | `realtime/socket.ts` | Suspended user may keep socket until token expires | Require `purpose=access`; status check | Later |
| P12-E-005 | INFO | `booking:subscribe` ownership-gated | `socket.ts` | Verified | — | — |

### F. Booking and payments

| ID | Sev | Finding | Evidence | Impact | Resolution | Blocks |
| --- | --- | --- | --- | --- | --- | --- |
| P12-F-001 | INFO | Fee fixed 100 pesewas; SEARCHING only after SUCCESS | constants + `markSearchingAfterFeeSuccess` + webhook finalize | Verified | — | — |
| P12-F-002 | INFO | Paystack HMAC-SHA512 + unique webhook events + crash replay | `payments/module.service.ts`, schema | Verified | — | — |
| P12-F-003 | HIGH | Paystack webhook behind global IP rate limiter | `app.ts` exempts only `/health` | Webhook 429 → delayed capture finalize | Exempt webhook path | **P + Pilot** |
| P12-F-004 | HIGH | No `fetchTransaction` poll for PENDING/ABANDONED | client method unused in workers | Missed webhook → money captured, booking abandoned | Poll + reconcile worker | **P** (runbook OK for pilot) |
| P12-F-005 | MEDIUM | FAILED→SUCCESS late charge rejected hard | `applyChargeSuccess` | Rare Paystack reorder can strand money | Treat like ABANDONED→SUCCESS + case | Later |
| P12-F-006 | INFO | 10-minute unpaid timeout worker | `expire-unpaid-bookings` | Verified | — | — |

### G. Matching and offers

| ID | Sev | Finding | Evidence | Impact | Resolution | Blocks |
| --- | --- | --- | --- | --- | --- | --- |
| P12-G-001 | INFO | 5 km radius, batch 3, eligibility, timeout fail-closed | matching modules + `offer-timeout.ts` + prod env refine | Verified | — | — |
| P12-G-002 | INFO | Concurrent accept: FOR UPDATE + conditional update + one-debit index | `acceptOfferAtomically` + SQL partial unique | Verified | — | — |
| P12-G-003 | MEDIUM | Dispatch not advisory-locked; overlapping ticks | matching workers / dispatch | Mitigated by unique constraints; wasted work / HOL blocking | Serialize per booking; tick re-entry guard | Later |
| P12-G-004 | MEDIUM | Passenger can also be rider candidate | no `passengerId !== riderId` filter | Self-match abuse for fee/token games | Exclude passenger from candidates/accept | **Pilot** (policy) |
| P12-G-005 | INFO | Ranking = stable rider id fallback | `candidate-ordering.ts` | Documented temporary; product ranking unresolved | Product decision | Later |
| P12-G-006 | LOW | Passenger cancel leaves PENDING offers until timeout | bookings cancel vs matching | Riders see stale offers briefly | Invalidate offers on cancel | Later |

### H. Trip execution and disputes

| ID | Sev | Finding | Evidence | Impact | Resolution | Blocks |
| --- | --- | --- | --- | --- | --- | --- |
| P12-H-001 | INFO | ACCEPTED→IN_PROGRESS→COMPLETED locked transitions; passenger ack non-status | bookings service + Phase 11B column | Verified | — | — |
| P12-H-002 | **CRITICAL** | Refund worker auto-submits all `REQUESTED` refunds | `refund-processor.processDueWork` + dispute `requestFeeRefund` | Support recommend + worker ≈ Finance execute without `ExecuteRefunds`/MFA | Separate discretionary statuses; worker only matrix-auto reasons | **P + Pilot** (live refunds) |
| P12-H-003 | INFO | Manual execute route still gated Finance + recent MFA | `payments/module.routes.ts` | Correct but bypassed by worker for REQUESTED rows | Align worker with route policy | — |
| P12-H-004 | INFO | 24h dispute window implemented | disputes module | Verified | — | — |

### I. Wallet and token purchases

| ID | Sev | Finding | Evidence | Impact | Resolution | Blocks |
| --- | --- | --- | --- | --- | --- | --- |
| P12-I-001 | INFO | Package snapshots; exactly-once credit; concurrent webhook test | wallet + payments DB tests | Verified **GO** | — | — |
| P12-I-002 | MEDIUM | Ledger immutability by convention only | no DB triggers | DBA/bug can rewrite history | BEFORE UPDATE/DELETE triggers or revoke privileges | Later |
| P12-I-003 | INFO | Automatic token-purchase refund policy unresolved | master spec / open decisions | Correctly not invented | Product decision | Later |

### J. Notifications (M10 + 11C)

| ID | Sev | Finding | Evidence | Impact | Resolution | Blocks |
| --- | --- | --- | --- | --- | --- | --- |
| P12-J-001 | INFO | FCM HTTP v1 OAuth cache, Android/iOS APNs-via-FCM, error classes | `fcm-auth.ts`, `fcm-http-v1.ts` | Verified for code path; live unproven | Live verify script | Later |
| P12-J-002 | HIGH | Permanent push `failed` completes outbox (no dead-letter) | `notification-outbox-worker.ts` | Auth/config failures look “completed” | Dead-letter or alert on NOT_CONFIGURED/UNAUTHENTICATED | **Pilot** if push required |
| P12-J-003 | HIGH | Retries re-send already SENT channels | same worker loop | Duplicate pushes/SMS on partial failure | Skip SENT/CANCELLED channels | **Pilot** if push on |
| P12-J-004 | MEDIUM | Most producers use fire-and-forget enqueue, not same-TX | `enqueueInAppNotification` | Crash can drop notification (business TX safe) | Prefer `scheduleNotificationInTx` for critical events | Later |
| P12-J-005 | INFO | Push/SMS failure cannot roll back booking/payment | worker outside TX | Verified requirement | — | — |
| P12-J-006 | CRITICAL | SMS adapter absent (shared with A-001) | sms.provider | Optional SMS + OTP blocked | Wire vendor | **P + Pilot** |

### K. Financial reconciliation (11A)

| ID | Sev | Finding | Evidence | Impact | Resolution | Blocks |
| --- | --- | --- | --- | --- | --- | --- |
| P12-K-001 | INFO | SUCCEEDED only from provider `processed` / webhook / reconcile | `refund-lifecycle.ts`, processor | Verified — not from mere submit | — | — |
| P12-K-002 | INFO | Paystack refund create has no client idempotency key | documented + processor claim | Known provider limitation; mitigated by claim + unique provider id | Lookup before retry | — |
| P12-K-003 | HIGH | Missing-fee sweeper refunds CANCELLED/EXPIRED/PAYMENT_FAILED broadly | `queueMissingBookingFeeRefunds` | Can refund admin/no-refund cancels after acceptance | Narrow to matrix-refundable reasons only | **P + Pilot** |
| P12-K-004 | MEDIUM | Reconcile may not advance `nextAttemptAt` on pending | processor | Poll hammering Paystack | Backoff on reconcile | Later |
| P12-K-005 | MEDIUM | No timeout on Paystack HTTP client | paystack client | Hung call + stale reclaim → duplicate create risk | AbortSignal + provider lookup before retry | Later |
| P12-K-006 | MEDIUM | MANUAL_RECONCILIATION is a dead end operationally | no requeue API | Ops stuck without dashboard workaround | Finance requeue / attach manual reference | Later |

### L. Security and operational hardening (11B)

| ID | Sev | Finding | Evidence | Impact | Resolution | Blocks |
| --- | --- | --- | --- | --- | --- | --- |
| P12-L-001 | INFO | TRUST_PROXY rejects bare `true`; hop/CIDR parse | `trust-proxy.ts` | Verified | Set hop count after topology verify | **Pilot** config |
| P12-L-002 | HIGH | TRUST_PROXY default `false` behind reverse proxy collapses client IP | env default + rate limit on `req.ip` | Shared OTP/API bucket; audit IPs wrong | Require explicit TRUST_PROXY in production | **P + Pilot** |
| P12-L-003 | INFO | Suspend does not kill active trip; force offline; revoke refresh | admin suspend + eligibility | Verified Phase 11B rule | — | — |
| P12-L-004 | MEDIUM | Production env refine omits CORS/SMS/R2/FCM/TRUST_PROXY required checks | `env.ts` | Boot succeeds with incomplete prod stack | Expand fail-closed checklist | Later |
| P12-L-005 | LOW | Public Swagger + readiness metadata | `app.ts`, health | Info disclosure (low) | Gate docs; trim ready payload | Later |
| P12-L-006 | LOW | In-memory rate limit / Socket.IO without adapter | ecosystem single instance | Multi-instance unsafe | Keep `instances:1` or add Redis | Later |
| P12-L-007 | INFO | Helmet, CORS allowlist, body 1mb, logger redaction paths | `app.ts`, `logger.ts` | Baseline OK; deepen redaction paths | — | — |

---

## 5. Cross-module workflow findings

| # | Workflow | Result | Gaps |
| --- | --- | --- | --- |
| 1 | Passenger OTP → session | **Broken in prod** until SMS adapter | P12-A-001 |
| 2 | Rider onboarding → online | **Code path complete**; needs R2 + ops review | Upload hardening; zone approval required for matching |
| 3 | Booking → pay → match → accept → debit | **Consistent** when Paystack + timeout configured | Webhook rate limit; missed-webhook poll; ranking fallback |
| 4 | Start → complete → ack | **Consistent** | Ack does not change status (correct) |
| 5 | Rider cancel → fee refund → token reverse | **Policy risk** | Auto worker + sweeper may over-refund / skip Finance |
| 6 | Search expiry → refund → Paystack | **Mechanically OK** | Same worker policy issues |
| 7 | Token purchase → webhook → credit | **GO** | Exactly-once covered |
| 8 | Dispute → Support recommend → Finance execute | **Broken vs docs** | Recommend queues REQUESTED → worker executes without Finance MFA |
| 9 | Admin login → MFA → privileged action → audit | **Mostly GO** | MFA throttle; some routes without recent MFA |
| 10 | Notify → outbox → worker → provider | **Partial** | Channel retry duplication; permanent push failures marked COMPLETED; SMS unwired |

---

## 6. Database and migration findings

| ID | Sev | Finding | Evidence | Resolution | Blocks |
| --- | --- | --- | --- | --- | --- |
| P12-DB-001 | INFO | 13 migrations; local `cyrlo_ride_app` up to date | `prisma migrate status` | Keep deploying only to app DB | — |
| P12-DB-002 | INFO | Partial unique indexes: one SUCCESS fee, one debit/refund per booking, one accepted offer, one active trip | init + later SQL | Verified | — |
| P12-DB-003 | MEDIUM | Financial CHECKs/partial uniques live only in SQL, not Prisma schema | `financial-constraints.sql` + docs | CI assert constraints exist; never `db push` blind | Later |
| P12-DB-004 | MEDIUM | Ledger `payment_id` lacks FK | schema | Add FK Restrict | Later |
| P12-DB-005 | HIGH | No immutability triggers on ledger/payments | convention only | Triggers or least-privilege role | Later |
| P12-DB-006 | INFO | Bookings/history/offers Restrict deletes protect financial trail | schema | Verified | — |
| P12-DB-007 | LOW | No retention jobs for outbox/webhooks | growth | Retention policy for non-financial tables | Later |

---

## 7. Security findings (rollup)

Highest security/financial integrity items:

1. **P12-A-001 / J-006** — SMS fail-closed means no real auth in production (availability), not a bypass.  
2. **P12-H-002 / K-003** — monetary control bypass / over-refund (integrity).  
3. **P12-C-002** — weak encryption keys if example `.env` copied.  
4. **P12-B-002 / B-003** — MFA operational weaknesses.  
5. **P12-F-003 / E-003 / L-002** — rate-limit / proxy IP resolution under reverse proxy.  
6. **P12-E-004 / B socket** — thin realtime auth.  
7. No evidence of OTP/Ghana Card/payment secrets returned on ordinary user APIs; device tokens masked; push data sanitized.

---

## 8. Configuration and deployment checklist

### Required for production boot (validated)

| Variable | Notes |
| --- | --- |
| `DATABASE_URL` | App DB only |
| `JWT_ACCESS_SECRET` / `JWT_REFRESH_SECRET` | ≥32, distinct; placeholders rejected |
| `OTP_HASH_SECRET` | Placeholder rejected |
| `ADMIN_MFA_ENCRYPTION_KEY` / `IDENTITY_ENCRYPTION_KEY` | 32-byte base64, must differ (**weak-key check missing**) |
| `PAYSTACK_SECRET_KEY` | Required when `NODE_ENV=production` |
| `RIDER_OFFER_RESPONSE_TIMEOUT_SECONDS` | Required in production; no default |

### Required for real users / pilot features (fail at use or incomplete)

| Variable / dependency | Behavior if missing |
| --- | --- |
| SMS vendor adapter + `SMS_PROVIDER`/`SMS_API_KEY` | Send 503; OTP impossible |
| `PUSH_PROVIDER=fcm` + `FCM_PROJECT_ID` + `FCM_SERVICE_ACCOUNT_FILE` | Push fail-closed; in-app continues |
| Firebase APNs config (console) | iOS push `THIRD_PARTY_AUTH_ERROR` |
| `R2_*` | Document upload/download fail-closed |
| `TRUST_PROXY` | Must set hop/CIDR behind reverse proxy |
| `CORS_ORIGINS` | Empty → browsers blocked (often OK for mobile) |
| Paystack webhook URL | HMAC route public |
| Continuous single API process | In-process workers (unpaid, matching, refunds, outbox) |

### Optional / defaults

Rate limits, notification outbox tuning, JWT TTLs, MFA windows, `SMS_SENDER_ID=Cyrlo`, `LOG_LEVEL`, `MAPS_*` (unused).

### Workers (started in `createApp` when not test)

| Worker | Interval |
| --- | --- |
| Unpaid booking expiry | ~30s |
| Matching expire + dispatch | ~5s |
| Refunds | ~10s |
| Notification outbox | `NOTIFICATION_OUTBOX_POLL_MS` (3s) |

**Do not scale to multiple Node instances** without Redis rate-limit store + Socket.IO adapter + worker leadership.

---

## 9. External integration verification status

| Integration | Code status | Live verified |
| --- | --- | --- |
| Paystack initialize / webhook / refunds | Implemented + mocked/DB tests | **No** (no live keys in audit) |
| FCM HTTP v1 | Implemented + contract tests | **No** (opt-in script not run) |
| Firebase → APNs | Message shape present | **No** (console credentials external) |
| SMS vendor | **Not wired** | **N/A** |
| Cloudflare R2 | Client + fail-closed | **No** |
| PostgreSQL | Local suite used `cyrlo_ride_app` | Local only |

---

## 10. Outstanding product / operational decisions

| # | Decision | Blocks |
| --- | --- | --- |
| 1 | Rider candidate ranking (beyond stable ID) | Later (pilot OK with documented fallback) |
| 2 | Passenger cancel-after-accept refund criteria | **Pilot** if Support paths live (interacts with H-002/K-003) |
| 3 | Completed-trip dispute override of no-auto-refund | Later / Pilot if disputes enabled |
| 4 | Finance/Super Admin monetary approval thresholds | **P** while worker auto-pays REQUESTED |
| 5 | Automatic token-purchase refund/reversal | Later (correctly unimplemented) |
| 6 | Production SMS vendor + adapter wiring | **P + Pilot** |
| 7 | Ahenema Kokoben (and subarea) polygons | **Pilot** geo launch |
| 8 | Production `RIDER_OFFER_RESPONSE_TIMEOUT_SECONDS` value | **Pilot** matching |

Do not invent values in code; ops/product must decide.

---

## 11. Prioritized remediation backlog

### Must fix before any real-user pilot

1. **Wire SMS adapter** (P12-A-001) and prove OTP send.  
2. **Stop auto-execution of discretionary refunds** (P12-H-002); Finance MFA gate must be meaningful.  
3. **Narrow missing-refund sweeper** (P12-K-003).  
4. **Exempt Paystack webhook from global IP limiter** (P12-F-003).  
5. **Configure TRUST_PROXY** for real topology; separate OTP/location limiting (P12-L-002, E-003).  
6. **Reject weak encryption keys** at production boot (P12-C-002).  
7. **Load verified non-overlapping service zones**; set offer timeout + Paystack live keys.  
8. If push is in pilot: fix outbox SENT re-delivery + permanent-failure dead-letter (P12-J-002/003); configure FCM + APNs.

### Before unrestricted production

- MFA attempt lockout + invite MFA reset hardening (B-002/003).  
- Pending payment poll / settlement reconciliation (F-004).  
- Ledger immutability triggers (I-002 / DB-005).  
- Same-TX notification scheduling for critical events (J-004).  
- Admin OTP concurrency + bootstrap atomicity (B-004/005).  
- Upload hardening; OpenAPI refresh; multi-instance plan.

---

## 12. Recommended next phase

**Phase 13 — Pilot Gate Hardening (implementation)**

Scoped engineering + ops only:

1. SMS vendor adapter + OTP live test.  
2. Refund policy alignment (worker vs Finance).  
3. Rate-limit / TRUST_PROXY / webhook exemptions.  
4. Weak-key production guards.  
5. Zone polygon load + offer timeout + Paystack/FCM/R2 secrets.  
6. Targeted regression tests for the above.  
7. Short controlled pilot runbook (max users, monitoring, kill switches).

Defer product ranking, token-purchase refund policy, and full OpenAPI rewrite until after pilot gate.

---

## Finding counts

| Severity | Count |
| --- | --- |
| **CRITICAL** | **2** (SMS adapter absent; refund worker auto-executes Support-queued refunds). `P12-J-006` is the same SMS defect as `P12-A-001`. |
| **HIGH** | **11** (MFA throttle/invite reset; weak example encryption keys; GPS + webhook under global IP limiter; TRUST_PROXY default; missed-webhook poll gap; push outbox permanent-failure + redelivery; missing-fee sweeper over-refund; ledger immutability-by-convention) |
| **MEDIUM** | **28** |
| **LOW** | **12** |
| **INFO** | **24** (verified sound behaviours and documented limitations) |

---

## Appendix — Top five issues to resolve first

1. SMS vendor adapter (OTP impossible).  
2. Refund worker auto-pays Support-queued REQUESTED refunds.  
3. Missing-fee sweeper over-refunds non-matrix cancels.  
4. Global IP rate limit on webhook + GPS behind NAT / wrong TRUST_PROXY.  
5. Production acceptance of example encryption keys.

---

*End of Phase 12 read-only audit.*
