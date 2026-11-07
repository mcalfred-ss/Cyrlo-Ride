# Cyrlo Maps integration

Inspected repository: `https://github.com/mcalfred-ss/cyrlo-map`

Published commit: `d299ede80fb63ccaa3f8d8b2135f757897317dfd`

Commit subject: `Extract reusable mapping into Cyrlo Maps.` (2026-11-06).

Cyrlo Maps is a Flutter library. It renders tiles with `flutter_map`. It can call Mapbox Directions from the device. The separate hosted HTTP API is planned at `https://api.cyrlomap.eqostack.com/v1`. That OpenAPI contract is not published. Ride must not invent endpoints or call the host until the contract exists.

Ride consumes the SDK as a git dependency in `apps/cyrlo_app`. Source is not copied. Implementation status is in `CYRLO_MAPS_INTEGRATION_REPORT.md`.

## How to consume it

Pin the git dependency. Do not vendor `packages/cyrlo_maps` into this repository.

```yaml
dependencies:
  cyrlo_maps:
    git:
      url: https://github.com/mcalfred-ss/cyrlo-map.git
      ref: d299ede80fb63ccaa3f8d8b2135f757897317dfd
      path: packages/cyrlo_maps
```

`packages/cyrlo_maps` is the platform. Public import: `package:cyrlo_maps/cyrlo_maps.dart`. Version `0.1.0`, `publish_to: none`, Dart SDK `^3.12.2`. Cyrlo Ride's SDK constraint is `^3.13.2`, which satisfies that range.

Direct dependencies of the package:

| Package | Constraint | Use |
| --- | --- | --- |
| `flutter_map` | `^8.3.1` | Raster map |
| `latlong2` | `^0.10.1` | Used inside the package. Not re-exported |
| `dio` | `^5.8.0+1` | Mapbox Directions HTTP. Ride already depends on `dio` `^5.11.1` |
| `geolocator` | `^14.0.2` | Device location implementation |

`flutter_map`, `latlong2`, and `geolocator` are not part of the public export. Ride code should pass `MapCoordinate`, markers, and polylines, and should not import the tile library.

The same git repo also contains `projects/cyrlo_ride`, package name `cyrlo_ride_maps`. It builds three `MapProject` presets (`findDriver`, `liveTrip`, `driverHome`) and a `MapProviders` bundle. It is configuration, not the map engine. Ride may depend on it the same way, with `path: projects/cyrlo_ride`, or it may construct `MapProject` itself from the public types. Do not copy the engine to avoid that choice.

Two facts about `cyrlo_ride_maps` matter before adopting it:

- `kumasiSchools.assetPath` is `assets/data/schools/kumasi_schools.json`. The package does not contain those bytes. Cyrlo Ride does not contain them either.
- User-agent strings are `com.eqostack.cirlo_ride` and `com.eqostack.cirlo_driver`. They record the extracted app, not an application id that exists in this repository.

School JSON and those identifiers are product data. They are not required to draw a local-ride map.

## Capability matrix

Status is what commit `d299ede` actually implements.

| Capability | Current status | How Cyrlo Ride will consume it |
| --- | --- | --- |
| Package install | Git package at `packages/cyrlo_maps`. Not on pub.dev (`publish_to: none`). | Pin `ref` to `d299ede80fb63ccaa3f8d8b2135f757897317dfd`. Do not copy source. |
| Map rendering | `CyrloMapView` draws `flutter_map` raster tiles, markers, polylines, overlays, and a tap callback. | Passenger map, pickup/destination selection, and the passenger's view of an accepted rider. The Ride app decides what a tap means. |
| Camera | `MapCamera` plus `CyrloMapController.move`. Initial camera comes from `MapProject`. | Ride sets the camera. Recenter uses the controller. |
| Map style | `MapStyleSet` style ids. Ride presets use Mapbox `dark-v11` and `streets-v12`. | Pass `isDark` into `CyrloMapView`. Cyrlo Ride currently forces light theme; that does not have to match the map style. |
| Tile provider | `TileSourceChain`: public `pk.` token uses Mapbox raster tiles. Empty or `sk.` token uses CARTO when policy is `cartoFallback`, or a blank surface when policy is `offlineCanvas`. | Ride supplies a public token. CARTO is the keyless fallback already in the package. No Cyrlo tile server. |
| Attribution | `MapAttributionBadge` is drawn by the view from the active source. | Leave the badge in place. Extra credit, if a dataset is shown, goes in a `MapOverlay`. |
| Mapbox Directions | `MapboxDirectionsClient` calls `https://api.mapbox.com/directions/v5/mapbox/driving/...` with the public token. Returns polyline, meters, and seconds. | Call it from the device for a route preview between pickup and destination. Show `DirectionsException` to the user. Do not treat distance or duration as a fare. The backend must not price a trip from this response. |
| Directions errors | `DirectionsException.code`: `missing_token`, `http_error`, `empty_routes`, `invalid_geometry`, `network`. | Surface an unavailable route. Do not invent a line or a duration. |
| Device location | `DeviceLocationService.current` returns `LocationRead`. `whileInUse` and `always` can yield a `LocationFix`. Denial sets `denied`. A disabled service also sets `serviceDisabled`. `GeolocatorLocationClient` is the device implementation. `LocationClient` is injectable. | Use a fix as a suggested pickup only after the passenger confirms it. Send rider GPS to the Cyrlo Ride API. The package does not upload location. |
| Marker motion | `MarkerMotion.lerp`. `shouldStart` is false until 400 ms after `lastMove`. Default duration 700 ms. | Animate the assigned rider from `rider.location.updated`. The socket payload stays a Ride concern. |
| Coordinates | `MapCoordinate.isValid` checks WGS84. `coordinate_math` exposes haversine. | Convert at the edge to Ride's `GeoPoint` and the API `{ latitude, longitude }` objects. |
| Token configuration | `MapToken.resolve` reads `--dart-define=MAPBOX_ACCESS_TOKEN`, then an environment map, then empty. `MapToken.acceptPublic` drops a leading `sk.`. | Pass a public `pk.` token with `--dart-define`. Never ship an `sk.` token in the app. |
| Geocoding | `GeocodingClient` is an interface. `UnavailableGeocodingClient.forward` and `reverse` throw `GeocodingException` code `unavailable`. | Do not call it expecting addresses. Labels are optional strings the user typed, already allowed by `createBookingSchema`. A real geocoder is a later provider behind this interface, not a Cyrlo Maps API. |
| Place search | `PlaceSearchClient.search` is an interface. `UnavailablePlaceSearchClient` throws `PlaceSearchException` code `unavailable`. | Same as geocoding. Saved places are not implemented in either repository. |
| School data | `SchoolCatalog.fromJson` parses an extract envelope (`version`, `extractedAt`, `schools`, `attribution`, `coverage`). Invalid rows and duplicate ids are skipped. Missing names become `Unnamed school`. `GeoDataset` stores an id and an asset path and does not load bytes. The package does not call Overpass. | Not used for local rides. A future school feature can bundle JSON in the Ride app and parse it with `SchoolCatalog`. Do not add a maps backend for schools in this phase. |
| Ride presets | `CyrloRideMaps.findDriver`, `liveTrip`, `driverHome`, and `providers`. `providers` wires Mapbox directions plus the unavailable geocoder and place search. | Optional git dependency. Presets are a convenience. Booking state does not live in them. |
| Offline map | `MissingTokenPolicy.offlineCanvas` draws no tiles. Markers are not drawn in that mode. | `liveTrip` uses this when the token is missing. Ride should explain that the map is unavailable instead of pretending the rider marker is on a basemap. |
| Tests in the package | `school_place`, `tile_source`, `coordinate_math`, `cyrlo_map_view`, `device_location_service`, `map_token`, `mapbox_directions_client`, `marker_motion`, plus `projects/cyrlo_ride/test/cyrlo_ride_maps_test.dart`. | Run `flutter test` in the pinned checkout when changing the pin. This audit did not run them. |
| Dedicated Cyrlo Maps HTTP API | Not in this commit. | Do not invent one. Do not deploy this repository. Do not point `MAPS_PROVIDER` / `MAPS_API_KEY` at it. |

## What Ride keeps

The package documentation is explicit, and the code matches it:

- Which tap is pickup or destination.
- Whether a route preview is requested.
- Booking, matching, tokens, and the GH₵1 fee.
- What a socket location means, and who may see it.
- The bytes of any school extract.

`backend/src/infrastructure/maps/maps.provider.ts` is an unwired distance function that throws `NOT_IMPLEMENTED`. Leave it unwired. Local rides do not need the server to compute a route. Transportation fare is not calculated by Cyrlo.

## Integration sketch

When implementation is approved, the map screen should:

1. Resolve `MapToken` from `MAPBOX_ACCESS_TOKEN`.
2. Build a `MapProject` for the passenger request screen (`cartoFallback`, location enabled, navigation enabled).
3. Build `MapProviders` with `MapboxDirectionsClient` and a `DeviceLocationService`.
4. Render `CyrloMapView` with Ride-owned markers.
5. On direction failure, show the exception message and still allow a booking from the two coordinates.
6. After accept, subscribe to `rider.location.updated` and move a marker with `MarkerMotion`. Send those points to the Ride API, not to Cyrlo Maps.

No school dataset is loaded in that flow.
