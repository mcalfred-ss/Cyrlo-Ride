# Cyrlo Ride — Passenger Map Device QA Report

**Date:** 2026-11-11  
**Auditor:** Controlled device-QA attempt (Cursor agent)  
**Safety mode:** No service-zone activation, no Paystack, no OTP/SMS request, no successful booking create, no production config changes, no deploy.

---

## 1. Environment attempted

| Item | Result |
| --- | --- |
| Physical Android/iOS device | **Not available** — `flutter devices` listed only Windows, Chrome, Edge |
| Android SDK / emulator | **Not installed** — Flutter doctor: Unable to locate Android SDK; no emulators |
| Windows desktop build | **Not usable** — Visual Studio Build Tools incomplete |
| Chrome (`flutter run -d chrome --web-port=7357`) | Launched, then **failed** to load CanvasKit/fonts (`Failed to fetch` gstatic CanvasKit module); blank page |
| Web server + Cursor IDE browser (`flutter run -d web-server --web-port=7360`) | **Partial success** — app UI rendered at onboarding |
| Host OS | Microsoft Windows 10.0.19045 (observed via Flutter doctor / devices) |
| Browser used for partial run | Cursor IDE browser → `http://127.0.0.1:7360/#/onboarding` (Chrome engine) |

### Build / commit under test

| Field | Value |
| --- | --- |
| Git HEAD | `8261244` |
| Working tree | **Dirty** — passenger map / live booking changes present locally but **not committed** (`passenger_trip_plan.dart` untracked; map/home/live_booking files modified) |
| What the web-server process loaded | Local `apps/cyrlo_app` sources including the uncommitted map planning work |

**Important:** This report does **not** claim a clean tagged staging binary was QA’d on a phone.

---

## 2. What was actually executed

### Executed (environment / launch)

| # | Test | Expected | Actual | Pass/fail |
| --- | --- | --- | --- | --- |
| E1 | Detect physical device | Phone or tablet listed | None | **FAIL** (environment) |
| E2 | Launch Flutter for interactive QA | App runs on a usable surface | Chrome device blank/error; web-server + IDE browser showed onboarding | **PARTIAL** |
| E3 | Confirm app shell paints | Cyrlo Ride UI visible | Screenshot: onboarding “Request a Pragya” / Next / Skip | **PASS** (onboarding only) |
| E4 | Reach passenger map without SMS | Map planning UI available | Router requires completed auth/onboarding; OTP path would call SMS | **BLOCKED** (safety) |

Evidence:

- Flutter doctor / devices output (no Android toolchain, no phone).
- Chrome run log: CanvasKit fetch failure.
- IDE browser screenshot: onboarding screen at `#/onboarding` (title “Cyrlo Ride”).

### Not executed (scope tests)

Because the passenger Map tab is behind authenticated passenger shell routing, and obtaining a session requires `POST /auth/otp` (SMS), **none** of the following were run on a device UI. Per instructions, they are **not** marked Pass.

| ID | Test | Expected (for a full run) | Actual | Result |
| --- | --- | --- | --- | --- |
| T1 | Passenger map screen loading | Plan panel + map tiles/markers shell | Not reached | **NOT EXECUTED** |
| T2 | GPS permission + current location | Permission prompt; fix or honest denial; no invented coords | Not reached | **NOT EXECUTED** |
| T3 | Manual pickup selection | Tap sets P marker + pickup label | Not reached | **NOT EXECUTED** |
| T4 | Destination search + suggestions | Debounced suggestions / empty / error | Not reached | **NOT EXECUTED** |
| T5 | Manual destination pin | D marker + destination label | Not reached | **NOT EXECUTED** |
| T6 | Route preview polyline | Real proxy geometry drawn | Not reached | **NOT EXECUTED** |
| T7 | Distance + duration display | Values from route response; not fare | Not reached | **NOT EXECUTED** |
| T8 | Continue → service-zone rejection | Unavailable-service message; no Paystack | Not reached | **NOT EXECUTED** |
| T9 | Trip preserved after rejection | Pickup/destination/route still shown | Not reached | **NOT EXECUTED** |

No failure screenshots exist for T1–T9 because those flows were never entered.

---

## 3. Why Continue / zone-rejection QA could not run safely here

1. **Auth gate:** `GoRouter` redirects incomplete sessions away from `/passenger/map` until passenger onboarding completes.  
2. **SMS ban:** Login/create-account OTP would send a real Vynfy SMS on staging — explicitly forbidden.  
3. **No pre-authenticated physical device session** was available to the auditor.  
4. Even if authenticated, **Continue → vehicle sheet → `POST /bookings`** is the fail-closed path for zero ACTIVE zones; that path was never opened in this session (no accidental Paystack).

Unit coverage for zone rejection / trip preservation exists in prior mapping tests, but that is **not** device QA and is not counted as Pass here.

---

## 4. Confirmed defects (from this QA attempt only)

| Defect | Severity | Notes |
| --- | --- | --- |
| Flutter Chrome device failed to load CanvasKit/fonts in this environment | High for **web** device QA on this machine | Blank page; IDE web-server path worked better |
| No Android SDK / no physical device attached | High for **mobile** device QA | Blocks GPS permission matrix |
| Passenger map unreachable without OTP under current safety rules | Process / env | Not an app logic defect by itself |

No map-planning functional defects were **confirmed on device**, because map interactions were not reached.

---

## 5. Remaining blockers

1. Physical Android or iOS device (or working emulator) with a build containing the passenger map changes.  
2. Authenticated passenger session **without** sending a new SMS for this QA (pre-provisioned device session, or explicitly approved OTP exception outside this report’s safety mode).  
3. For T8 happy-message path: staging still expected to return service-unavailable until an ACTIVE zone exists (Ops; do not activate in this QA).  
4. Commit/package the dirty map work into a reproducible build before calling staging deployment “QA’d”.

---

## 6. Device QA verdict

**NOT COMPLETE — BLOCKED**

| Question | Answer |
| --- | --- |
| Was passenger map device QA fully executed? | **No** |
| Can we claim T1–T9 passed? | **No** |
| Is the passenger mapping experience ready for staging deployment based on *this* device QA? | **No — not evidenced by device execution** |

**Separate note (not device QA):** Prior read-only readiness audit rated the *implementation* **READY WITH CONDITIONS** for controlled staging/device QA. This report does not overturn that code review; it records that the required device execution did not complete.

---

## 7. Recommended next runbook (human, physical device)

1. Install a debug/release build of `apps/cyrlo_app` that includes the local map planning commits.  
2. Use an already-signed-in passenger on-device session (or approve one OTP outside “no SMS” mode).  
3. Open Map → exercise T1–T7.  
4. Tap Continue → confirm vehicle sheet → allow create to fail closed → confirm unavailable-service copy → confirm trip still on screen → **dismiss without Paystack**.  
5. Attach screenshots to an updated revision of this report and flip each T* row to Pass/Fail with evidence.

---

*End of report. No map planning test above is marked Pass unless it was actually executed on a device UI.*
