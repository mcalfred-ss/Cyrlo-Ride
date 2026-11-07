# Cyrlo Maps integration report

Date: 2026-11-06. Implementation is in the Flutter app only. Backend matching, payments, and booking rules were not changed.

## 1. Repository audit

| Area | Status |
| --- | --- |
| Flutter app | One `apps/cyrlo_app` with Riverpod and go_router |
| Passenger Map tab | Was `SectionPage(title: 'Map')` placeholder |
| Pickup / destination UI | Missing |
| Device GPS | Missing. No geolocator dependency before this change |
| Android / iOS location permission strings | Missing |
| Rider live location upload | Not implemented. Only a path constant and a socket event name |
| Backend locations / matching | Modules exist; services throw `NOT_IMPLEMENTED` |
| Backend maps provider | `UnconfiguredMapsProvider` throws 501. Left unwired |
| Prior map package | None |

## 2. Existing map-related functionality (before)

- `GeoPoint` model without maps conversion.
- API path `/locations/rider` and socket name `rider.location.updated`.
- Onboarding copy mentioning pickup and destination.
- No map widget, no permission prompts, no route preview.

## 3. SDK integration

```yaml
cyrlo_maps:
  git:
    url: https://github.com/mcalfred-ss/cyrlo-map.git
    ref: d299ede80fb63ccaa3f8d8b2135f757897317dfd
    path: packages/cyrlo_maps
```

Public import: `package:cyrlo_maps/cyrlo_maps.dart`.

Ride builds its own `MapProject` in `RideMapProjects` instead of depending on `projects/cyrlo_ride` (`cyrlo_ride_maps`), which still carries Cirlo user-agents and a school asset path that this repo does not ship.

Tiles and device Directions use a public Mapbox token from `--dart-define=MAPBOX_ACCESS_TOKEN`. An empty token uses the SDK CARTO fallback. Secret `sk.` tokens are dropped by `MapToken`.

## 4. Files created and modified

Created:

- `lib/core/mapping/ride_map_projects.dart`
- `lib/core/mapping/device_location_gateway.dart`
- `lib/core/mapping/route_preview_gateway.dart`
- `lib/core/mapping/place_lookup_gateway.dart`
- `lib/core/mapping/mapping_providers.dart`
- `lib/core/mapping/maps_api/maps_api_client.dart`
- `lib/core/mapping/maps_api/deferred_maps_api_client.dart`
- `lib/passenger_app/map/application/trip_pin_state.dart`
- `lib/passenger_app/map/application/trip_pin_controller.dart`
- `lib/passenger_app/map/presentation/passenger_map_screen.dart`
- `test/mapping/deferred_maps_api_client_test.dart`
- `test/mapping/trip_pin_controller_test.dart`
- `test/mapping/geo_point_and_place_lookup_test.dart`
- `docs/architecture/CYRLO_MAPS_INTEGRATION_REPORT.md`

Modified:

- `pubspec.yaml` (git dependency)
- `lib/core/config/app_config.dart`
- `lib/shared/models/geo_point.dart`
- `lib/core/routing/app_router.dart`
- `android/app/src/main/AndroidManifest.xml`
- `ios/Runner/Info.plist`
- `docs/architecture/CYRLO_MAPS_INTEGRATION.md`

## 5. Mapping abstraction

Ride screens talk to gateways, not to `flutter_map` or a hosted URL:

| Responsibility | Abstraction | Implementation today |
| --- | --- | --- |
| Map rendering / camera / taps | `CyrloMapView` + `CyrloMapController` behind `PassengerMapScreen` | Cyrlo Maps SDK |
| Pickup / destination selection | `TripPinController` | Local Riverpod state |
| Current location | `DeviceLocationGateway` | `CyrloDeviceLocationGateway` → SDK `DeviceLocationService` |
| Route display | `RoutePreviewGateway` | `MapboxDirectionsClient` when a public token exists; otherwise unavailable |
| Geocoding / place search | `PlaceLookupGateway` | Unavailable clients from the SDK |

`GeoPoint` is the Ride domain type. Conversion to `MapCoordinate` happens at the maps edge only.

Booking, matching, fees, tokens, and zone checks stay in the Ride backend. The map does not choose a rider.

## 6. API adapter design

Intended origin (not hardcoded as a live default):

`https://api.cyrlomap.eqostack.com/v1`

Configuration:

- `--dart-define=CYRLO_MAPS_API_BASE_URL=`
- `--dart-define=CYRLO_MAPS_API_TOKEN=`

`DeferredCyrloMapsApiClient` stores that configuration and refuses every capability with `CyrloMapsApiUnavailableException`. It does not invent paths or JSON fields and does not issue HTTP. When OpenAPI is published, replace this client with methods that match the contract only.

Device map rendering does not require the hosted API. Development remains usable with CARTO fallback tiles.

Backend: no Maps API adapter was added. Matching and zone geometry do not need geocoding. `UnconfiguredMapsProvider` stays unwired.

## 7. Tests

Executed from `apps/cyrlo_app`:

```bash
flutter test test/mapping test/contract_test.dart test/widget_test.dart
```

Result: **15 passed**, 0 failed.

Coverage:

- Deferred Maps API refuses configured and unconfigured calls without HTTP.
- Pickup then destination selection, location denial, disabled services, route preview failure, clear.
- GeoPoint conversion and unavailable place/route gateways.
- Existing signup widget flow and realtime contract names.

## 8. Remaining dependencies on Cyrlo Maps

- Flutter SDK package at the pinned commit for tiles, camera, markers, polylines, device location, and optional Mapbox Directions.
- Public Mapbox token for Mapbox tiles and Directions (optional; CARTO fallback works without it).
- Future hosted OpenAPI at `api.cyrlomap.eqostack.com` for geocoding and place search once documented.
- Rider live location still needs Ride backend routes and socket emits. The SDK only supplies the device fix.

## 9. Exact API contract requirements (for Maps)

Ride needs the OpenAPI document to include, before any live adapter is written:

1. Base path confirmation (`/v1` or otherwise).
2. Auth scheme for mobile and for any future backend caller.
3. Forward and reverse geocode request/response fields.
4. Place search request/response fields, including bias coordinates if supported.
5. Error envelope and codes.
6. Rate limits and whether a public Mapbox token remains required on device for tiles.
7. Explicit statement that matching, booking, and payments are out of scope for the Maps API.

Until that document exists, Ride must not call `https://api.cyrlomap.eqostack.com`.

## 10. Blockers

- Hosted Maps API OpenAPI contract not published.
- Maps API authentication not defined.
- No object/token for geocoding beyond the SDK's unavailable clients.
- Backend location upload and matching still unimplemented (out of scope for this map integration).
- Rider map / live tracking UI not built yet; passenger map is the first consumer.
- Exact polygon pilot data still an operations input, unrelated to the SDK.

Matching rules (5 km, 30 s GPS, batches of 3, 5-minute search) were not modified.
