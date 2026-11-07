import 'package:cyrlo_maps/cyrlo_maps.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';

import '../config/app_config.dart';
import 'device_location_gateway.dart';
import 'maps_api/deferred_maps_api_client.dart';
import 'maps_api/maps_api_client.dart';
import 'place_lookup_gateway.dart';
import 'ride_map_projects.dart';
import 'route_preview_gateway.dart';

/// Public Mapbox token for the Cyrlo Maps SDK. Empty is allowed; tiles fall back.
final mapAccessTokenProvider = Provider<String>((ref) {
  return MapToken.resolve(
    environment: {
      if (AppConfig.mapboxAccessToken.isNotEmpty)
        MapToken.environmentKey: AppConfig.mapboxAccessToken,
    },
  );
});

final passengerMapProjectProvider = Provider<MapProject>((ref) {
  return RideMapProjects.passengerRequest();
});

final deviceLocationGatewayProvider = Provider<DeviceLocationGateway>((ref) {
  return CyrloDeviceLocationGateway();
});

final routePreviewGatewayProvider = Provider<RoutePreviewGateway>((ref) {
  final token = ref.watch(mapAccessTokenProvider);
  if (token.isEmpty) return const UnavailableRoutePreviewGateway();
  return CyrloRoutePreviewGateway(
    client: MapboxDirectionsClient(accessToken: token),
  );
});

final placeLookupGatewayProvider = Provider<PlaceLookupGateway>((ref) {
  // Stock Cyrlo Maps geocoder and place search throw `unavailable`.
  // Swap these for hosted Maps API adapters only after OpenAPI exists.
  return CyrloPlaceLookupGateway(
    geocoding: const UnavailableGeocodingClient(),
    places: const UnavailablePlaceSearchClient(),
  );
});

final cyrloMapsApiClientProvider = Provider<CyrloMapsApiClient>((ref) {
  return DeferredCyrloMapsApiClient();
});
