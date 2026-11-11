# Cyrlo Ride — Passenger Map Chrome QA Report

**Date:** 2026-11-11  
**Mode:** Chrome / Flutter web-server QA (no Android tooling install)  
**Safety:** No payments, no successful bookings, no SMS to non-allowlisted numbers, no production config changes, no deploy.

---

## 1. Executive verdict

| Question | Answer |
| --- | --- |
| Does the passenger app support browser execution? | **Yes** — web folder present; app serves and paints in Chrome via web-server |
| Was CanvasKit understood? | **Yes** — prior Flutter-launched Chrome fetch failure; web-server path loads CanvasKit from gstatic successfully in this session |
| Was passenger map QA completed in Chrome? | **No** — blocked after create-account phone entry (input automation / focus); map steps not reached |
| Ready to call map Chrome QA “done”? | **No** |

---

## 2. Web support inspection

### 2.1 Flutter / project

| Item | Finding |
| --- | --- |
| Flutter | **3.47.5** stable (Dart 3.13.4, engine `af7e796e16`) |
| App version | `1.0.1+2` (`pubspec.yaml`) |
| Web config | `apps/cyrlo_app/web/` — `index.html`, `manifest.json`, icons; bootstrap via `flutter_bootstrap.js` |
| Default API | Staging `https://cyrloride.eqostack.com/api/v1` via `AppConfig` (no secrets in launch command) |
| Maps proxy | `USE_RIDE_MAPS_PROXY` default **true** |

### 2.2 Browser-compatible dependencies

| Dependency | Web note |
| --- | --- |
| `cyrlo_maps` / flutter_map | Used for passenger map; web-capable tile/map stack |
| `geolocator` (via cyrlo_maps) | Browser geolocation API; HTTPS or localhost; permission UX differs from Android |
| `dio`, `go_router`, `riverpod` | Web OK |
| `firebase_messaging` | Gated with `kIsWeb` — push not used on web |
| `webview_flutter` / `webview_windows` | Paystack/legal: web path uses external launch (`kIsWeb` → not in-app webview) |
| `image_picker` / `dart:io` in rider documents | Rider upload path is IO-oriented; **not exercised** this session |

### 2.3 Location & map on web

- Pickup uses `DeviceLocationService` → `GeolocatorLocationClient` (browser permission prompt expected).
- Map: `CyrloMapView` + markers/polylines from trip plan state.
- Manual pin selection is pointer/tap based — should work in Chrome once Map tab is reached.
- GPS accuracy and background location are **browser-limited** vs Android.

### 2.4 Platform-specific risks

- In-app Paystack webview is not used on web (external URL) — acceptable for this QA (payments forbidden anyway).
- Flutter canvas pointer targeting is difficult under split IDE + agent UI (focus theft observed during automation).

---

## 3. CanvasKit failure diagnosis

### 3.1 Prior failure (Flutter `-d chrome`)

Logged previously:

- `Failed to fetch` Roboto from `fonts.gstatic.com`
- `Failed to fetch dynamically imported module` …/chromium/`canvaskit.js`
- Blank page

### 3.2 This session

| Probe | Result |
| --- | --- |
| Host HTTPS HEAD to same CanvasKit / Roboto URLs | **200** (not a permanent CDN outage) |
| Local engine assets | Present under `flutter/bin/cache/flutter_web_sdk/canvaskit/chromium/` |
| `flutter run -d web-server` + Cursor IDE browser | CanvasKit **200**; onboarding painted |
| Standalone Chrome → `http://127.0.0.1:7360/` | After load wait, UI painted (onboarding → welcome → create-account) |
| Performance resource entries (IDE browser) | `canvaskit.js` + `canvaskit.wasm` from gstatic **status 200** |

### 3.3 Classification

| Hypothesis | Verdict |
| --- | --- |
| Application Dart exception | **Not root cause** — engine bootstrap fetch |
| Missing app deployment asset | **No** — app JS served from localhost; engine from CDN |
| Browser incompatibility (Chrome 157) | **Unlikely** — same Chrome later rendered successfully |
| Rendering config bug in product code | **No change made**; default CanvasKit works via web-server |
| Flutter-launched Chrome session / early fetch race | **Best fit for original blank page** — use web-server + open Chrome manually |

**No renderer swap was applied.** Local CanvasKit bundling was not required for this successful web-server path.

---

## 4. Launch instructions (web-server)

Exact command (from `apps/cyrlo_app`):

```powershell
cd H:\stuff\Cyrlo-Ride\apps\cyrlo_app
flutter run -d web-server --web-hostname=127.0.0.1 --web-port=7360
```

| Item | Value |
| --- | --- |
| Local URL | `http://127.0.0.1:7360/` |
| Environment | Defaults to staging API; no API keys required in the client for Maps proxy |
| Open in Chrome | Navigate to the URL above (or `--app=http://127.0.0.1:7360/`) |
| Auth for QA | Allowlisted static OTP passenger only (`OTP_STATIC_LOGINS` on server); request code then enter fixed OTP — **no SMS** for allowlisted numbers |

Do not put Maps API keys or Paystack secrets in Flutter `--dart-define`.

**Build under test:** git HEAD `8261244` + **uncommitted** passenger map / live booking local changes.

---

## 5. Browser QA results

### 5.1 Actually executed

| ID | Test | Expected | Actual | Result |
| --- | --- | --- | --- | --- |
| W1 | Web-server serves app | App URL loads | Served at `127.0.0.1:7360` | **PASS** |
| W2 | CanvasKit loads (web-server) | Engine assets OK | gstatic CanvasKit 200; UI paints | **PASS** |
| T-ONB | Onboarding | Complete / skip to welcome | Stepped through 3 pages → `#/welcome` | **PASS** |
| T-WEL | Welcome → phone | Reach create-account | `#/create-account` “Your phone number” | **PASS** |
| T-AUTH-UI | Auth screen visible | Phone field + Continue | Rendered (`+233`, hint `24 412 3456`) | **PASS** (render only) |

### 5.2 Blocked / not completed

| ID | Test | Status | Reason |
| --- | --- | --- | --- |
| T-AUTH | Allowlisted staging passenger login (no SMS) | **BLOCKED** | Could not reliably enter `555010001` into Flutter web field (desktop focus stolen by IDE/agent; refused to tap Continue with empty/non-allowlisted input to avoid SMS) |
| T2 | GPS permission | **NOT EXECUTED** | Map not reached |
| T3 | Current pickup location | **NOT EXECUTED** | |
| T4 | Manual pickup selection | **NOT EXECUTED** | |
| T5 | Destination search | **NOT EXECUTED** | |
| T6 | Destination pin | **NOT EXECUTED** | |
| T7 | Route preview / polyline | **NOT EXECUTED** | |
| T8 | Distance & duration | **NOT EXECUTED** | |
| T9 | Continue → service-zone rejection | **NOT EXECUTED** | |
| T10 | Trip preserved after rejection | **NOT EXECUTED** | |

No map interaction was marked Pass. Screen rendering of onboarding/auth is not treated as map QA pass.

### 5.3 Browser-specific limitations

- Geolocation requires user gesture + browser permission; insecure contexts other than localhost fail.
- No native Android permission settings deep-link.
- Paystack uses external browser tab on web (not tested).
- Pointer automation against Flutter CanvasKit under a crowded multi-window desktop was unreliable.
- Initial cold open in Chrome can show a blank page for several seconds while DDC modules + CanvasKit load — wait before declaring failure.

### 5.4 Remaining Android-only tests

Even after a successful Chrome map pass, still recommend Android for:

- Real GPS chip / denial / permanent denial UX  
- Background/location services toggles  
- Performance of map gestures on device GPU  
- Store-like WebView payment chrome (if required)  
- Notification / FCM paths (`kIsWeb` disabled)

---

## 6. Recommended next steps

1. Manually finish auth in the already-running Chrome session: enter allowlisted passenger local number `555010001`, Continue, OTP `246810` (static allowlist — no SMS).  
2. Open **Map** tab; execute T2–T10; stop at service-unavailable; do not open Paystack.  
3. Optionally maximize Chrome alone (no IDE overlay) to reduce focus theft during automation.  
4. Keep using `web-server` + manual Chrome rather than `flutter run -d chrome` until the Flutter-launched Chrome fetch flake is reproduced with DevTools Network evidence.  
5. Commit the passenger map working tree before calling staging “QA’d on a known binary.”

---

## 7. Fact vs assumption

| Claim | Class |
| --- | --- |
| Web-server + Chrome paints onboarding/welcome/create-account | **Fact** (this session) |
| CanvasKit 200 via gstatic on web-server path | **Fact** |
| Allowlisted OTP skips SMS | **Fact** (code/docs; not re-verified with a live request this session) |
| Map planning works in Chrome | **Not evidenced** |
| Staging `OTP_STATIC_LOGINS` still set | **Assumption** (prior E2E) |

---

*End of report.*
