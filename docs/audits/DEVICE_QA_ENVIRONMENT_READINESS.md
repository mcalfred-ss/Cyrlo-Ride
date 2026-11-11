# Cyrlo Ride — Device QA Environment Readiness

**Date:** 2026-11-11  
**Mode:** Read-only investigation (no installs, no env changes, no OTP/SMS/payment/booking/deploy)

---

## 1. Executive summary

| Area | Status |
| --- | --- |
| Android SDK / ADB / emulator / physical device | **Not ready** |
| Passenger test auth (no SMS) | **Mechanism already exists** (`OTP_STATIC_LOGINS`) |
| Flutter Chrome CanvasKit failure | **Diagnosed** — engine asset fetch in Flutter-launched Chrome; not an app logic crash |
| Can passenger map device QA proceed now? | **No** until Android tooling + a device/emulator exist; auth is not the primary blocker |

---

## 2. Android SDK / device status

### 2.1 Diagnostics run (this session)

| Check | Result |
| --- | --- |
| `flutter doctor -v` | Android toolchain **X Unable to locate Android SDK** |
| `ANDROID_HOME` / `ANDROID_SDK_ROOT` | Unset |
| Default SDK path `%LOCALAPPDATA%\Android\Sdk` | **Missing** |
| `C:\Android\Sdk` | **Missing** |
| `adb` on PATH | **Not found** |
| `adb devices` | Not runnable |
| `flutter emulators` | No emulator sources / no AVD images |
| `flutter devices` | Windows, Chrome, Edge only — **no Android device** |
| `flutter config --list` | No custom `android-sdk` / `android-studio-dir` |
| Android Studio under `C:\Program Files\Android*` | Not found |
| Visual Studio (Windows desktop) | Build Tools present but **incomplete** (Windows desktop also blocked) |

### 2.2 Flutter Android toolchain configuration

- Flutter **stable 3.47.5**, Android feature flag enabled by default.
- No SDK path configured → Flutter cannot build or deploy Android APKs from this machine.
- No platform-tools → no USB debugging / wireless ADB without installing the SDK.

### 2.3 Connected physical Android devices

**None detected.** Until SDK + ADB exist, even a plugged-in phone would not be visible to Flutter.

### 2.4 Available testing options (ranked)

| Option | Feasibility now | Notes |
| --- | --- | --- |
| Physical Android + SDK/ADB | **Blocked** | Needs install + device |
| Android emulator | **Blocked** | Needs SDK + system image + AVD |
| Flutter Windows desktop | **Blocked** | Incomplete VS Build Tools |
| Flutter Chrome / Edge | **Degraded** | Chrome device hit CanvasKit fetch failure; IDE web-server later painted UI |
| Cursor IDE browser → `web-server` | **Partial** | Reached onboarding only in prior QA; GPS/permissions not real device |
| Unit / controller tests | **Available** | Not a substitute for device map/GPS QA |

---

## 3. Authentication readiness

### 3.1 Existing mechanism (verified in code + docs)

A **static OTP allowlist** already exists. It is the intended store-review / internal QA path.

| Aspect | Detail |
| --- | --- |
| Env var | `OTP_STATIC_LOGINS` |
| Default | Empty string → **disabled** (all phones use real SMS OTP) |
| Format | Comma-separated `phone:code` pairs, e.g. `+233555010001:246810` |
| Phone validation | Exact E.164 matching `^\+233\d{9}$` only |
| Code validation | Exact 6 digits |
| Behavior | Allowlisted number → fixed code hashed into OTP challenge; **SMS send skipped** |
| Non-allowlisted | Normal random OTP + SMS provider |
| Source of truth | Server env (e.g. `/etc/cyrlo-ride/ride.env`); **not hardcoded in application source** |
| Docs | `docs/deployment/REVIEW_TEST_ACCOUNTS.md` |
| Parser | `backend/src/common/security/static-otp.ts` |
| Usage | `AuthService.requestOtp` in `backend/src/modules/auth/module.service.ts` |

Documented QA / review phones (ops docs; codes live in env, not compiled into the Flutter app):

| Use | Phone | Role path |
| --- | --- | --- |
| Internal QA passenger | `+233555010001` | Passenger |
| Internal QA rider | `+233555010002` | Rider |
| Store review passenger | `+233555010011` | Passenger |
| Store review rider | `+233555010012` | Rider |

Fixed OTP documented for those allowlisted numbers: `246810` (only after `OTP_STATIC_LOGINS` is set on the API host).

**Staging evidence (prior audit, not re-authenticated this session):** maps E2E used review passenger `+233555010001` / fixed OTP with **no SMS**.

### 3.2 Environment support / production risk

| Question | Answer |
| --- | --- |
| Staging only? | **No — by design.** Env comment and production checklist allow `OTP_STATIC_LOGINS` in production for App Store / Play review |
| Disabled by default? | **Yes** (empty default) |
| Arbitrary phone auth? | **No** — only exact allowlisted E.164 entries |
| Bypasses OTP verification? | **No** — still creates a challenge and requires the fixed code on verify |
| Bypasses production OTP for everyone? | **No** — only allowlisted numbers skip SMS |
| Hardcoded secrets in source? | **No** allowlist in compiled backend/app code; pairs come from env. Review phones/OTP **are** documented in repo markdown for ops/store notes |
| `OTP_DEV_EXPOSE_CODE` | Separate flag; returns `developmentCode` only when `NODE_ENV !== 'production'` — not the store-review path |

### 3.3 Audit logging gap

`requestOtp` skips SMS for static codes but **does not emit a dedicated audit event** (e.g. `auth.static_otp_issued`) in the reviewed service code. Challenge creation still hits the DB; there is no explicit “static allowlist used” audit trail beyond that.

### 3.4 Fit vs “proposed staging-only” requirements

| Requirement | Existing `OTP_STATIC_LOGINS` |
| --- | --- |
| Staging only | **Does not meet** (also allowed in production for review) |
| Disabled by default | Meets |
| Explicit approved accounts only | Meets |
| No arbitrary phones | Meets |
| No production OTP bypass for public | Meets |
| No hardcoded secrets in source | Meets for runtime; docs publish review pairs |
| Proper audit logging | **Partial / gap** |

**Conclusion:** Do **not** invent a second auth bypass. For device QA, use the existing allowlist on staging (request OTP for an allowlisted passenger — **no SMS**). If policy later requires true staging-only, propose a gated enhancement (below) — **not implemented in this investigation**.

### 3.5 Proposed enhancement (not implemented)

Only if product/security wants stricter than today’s store-review design:

1. Keep `OTP_STATIC_LOGINS` as the allowlist source (still env-only).  
2. Add `OTP_STATIC_LOGINS_ENVS=staging,development` (or require `NODE_ENV!==production` unless `OTP_STATIC_ALLOW_IN_PRODUCTION=true` for store submission windows).  
3. On static-code issuance, write an audit row: actor=system, action=`auth.static_otp_challenge`, phone hash/redacted, ip.  
4. Never embed codes in Flutter `--dart-define` or source.

Until then, **existing mechanism is sufficient** for SMS-free passenger QA on staging when env is configured.

### 3.6 Correction to prior device QA assumption

The earlier device QA report treated “any OTP” as forbidden SMS. That was **over-restrictive** for allowlisted review numbers: `requestOtp` on those numbers **does not send SMS**. Future map QA may authenticate with `+233555010001` + fixed OTP under the existing staging allowlist, without violating the “no SMS” safety rule — provided operators confirm `OTP_STATIC_LOGINS` is set on staging (do not print live env values).

---

## 4. CanvasKit failure diagnosis

### 4.1 Observed failure (Flutter Chrome device)

From the prior QA terminal log (`flutter run -d chrome --web-port=7357`):

1. Debug service connected successfully.  
2. `Failed to load font Roboto` from `fonts.gstatic.com` → `TypeError: Failed to fetch`.  
3. `Failed to fetch dynamically imported module`  
   `https://www.gstatic.com/flutter-canvaskit/<engine>/chromium/canvaskit.js`.  
4. Result: blank page in that Chrome session.

### 4.2 What it is / is not

| Hypothesis | Assessment |
| --- | --- |
| Application Dart/business exception | **Unlikely as root cause** — failure is in Flutter Web engine bootstrap (CanvasKit + default Roboto), before meaningful app UI |
| Missing app asset / bad deploy of `cyrlo_app` | **Unlikely** — failure is engine CDN modules, not `main.dart.js` missing; same tree later rendered via web-server + IDE browser |
| Permanent CDN / network outage | **Unlikely** — this machine’s PowerShell `HEAD` to the same CanvasKit and Roboto URLs returned **HTTP 200** during investigation |
| Browser compatibility (Chrome 157 vs Flutter 3.47.5) | **Low confidence** — Chrome is current stable; no version-specific error text |
| Rendering configuration (CanvasKit vs alternative) | **Surface area** — Flutter Web defaults to CanvasKit; local `flutter_web_sdk/canvaskit/chromium/` exists, but the Chrome device session still requested gstatic |
| Flutter-launched Chrome context / fetch isolation | **Most likely class** — `TypeError: Failed to fetch` on dynamic import while general HTTPS from the host succeeds; IDE-hosted browser later painted onboarding successfully against `web-server` |

### 4.3 Classification

**Rendering stack / browser-runtime fetch failure** in the Flutter-managed Chrome session (CanvasKit dynamic import + font fetch), **not** a Cyrlo Ride application exception and **not** evidence of a broken passenger-map codebase.

Changing renderer “just to make the test pass” is **not** recommended until a reproducible Chrome-device fetch failure is captured (DevTools Network for the canvaskit.js request: blocked, CORS, extension, offline, etc.). Prefer fixing Android device QA as the primary path; treat web as secondary.

### 4.4 Related evidence

| Probe | Result |
| --- | --- |
| CanvasKit CDN HEAD (host) | 200 |
| Roboto WOFF2 HEAD (host) | 200 |
| Local CanvasKit under Flutter SDK | Present (`canvaskit.js`, `.wasm`) |
| IDE browser + `web-server :7360` (prior QA) | Onboarding UI visible — engine path workable in that browser |

---

## 5. Recommended next steps (priority)

1. **Install Android Studio (or command-line SDK)** with platform-tools, at least one platform, and one system image; set `ANDROID_SDK_ROOT` / `flutter config --android-sdk`. *(Install = future change; not done here.)*  
2. **Attach a physical Android device** (USB debugging) or create an AVD; confirm `adb devices` + `flutter devices`.  
3. **Confirm staging `OTP_STATIC_LOGINS`** is configured (ops check; do not dump secrets). Use internal QA passenger `+233555010001` — request code + fixed OTP (**no SMS**).  
4. **Build/run the dirty passenger-map working tree** on that device and execute the map QA checklist.  
5. **Optional web follow-up:** re-run `flutter run -d chrome` with DevTools Network open to classify the CanvasKit `Failed to fetch`; only then consider local CanvasKit URL or renderer changes.  
6. **Optional auth hardening:** audit event on static OTP challenge; optional production gate for allowlist outside store-review windows.  
7. **Do not** activate service zones or run Paystack as part of environment setup.

---

## 6. Fact vs assumption

| Claim | Class |
| --- | --- |
| No Android SDK / ADB / emulators / phones on this machine | **Fact** (this session) |
| `OTP_STATIC_LOGINS` design and SMS skip | **Fact** (code + docs) |
| Staging currently has allowlist set | **Assumption** (prior E2E used it; env not re-read) |
| CanvasKit CDN reachable from host PowerShell | **Fact** (HTTP 200) |
| Flutter Chrome session failed dynamic import | **Fact** (prior QA log) |
| Cause = Chrome profile / fetch isolation | **Best-fit diagnosis**, not packet-proven |

---

*End of read-only report.*
