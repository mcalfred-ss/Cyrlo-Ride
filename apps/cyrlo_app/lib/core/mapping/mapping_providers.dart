import 'package:cyrlo_maps/cyrlo_maps.dart';
import 'package:dio/dio.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';

import '../config/app_config.dart';
import '../constants/api_paths.dart';
import '../../features/auth/application/auth_session.dart';
import '../../shared/providers/core_providers.dart';
import 'device_location_gateway.dart';
import 'maps_api/maps_api_client.dart';
import 'place_lookup_gateway.dart';
import 'ride_map_projects.dart';
import 'ride_maps_gateway.dart';
import 'route_preview_gateway.dart';

/// Public Mapbox token for Cyrlo Maps SDK tiles.
///
/// Precedence: `--dart-define=MAPBOX_ACCESS_TOKEN`, then authenticated
/// `GET /maps/config` (`mapboxPublicToken` from the Ride server).
final mapAccessTokenProvider = FutureProvider<String>((ref) async {
  final fromDefine = MapToken.acceptPublic(AppConfig.mapboxAccessToken);
  if (fromDefine.isNotEmpty) return fromDefine;

  // Re-run after login — /maps/config requires a bearer token.
  final session = ref.watch(authSessionProvider);
  if (session == null) return '';

  try {
    final api = ref.watch(apiClientProvider);
    final response = await api.dio.get<Map<String, dynamic>>(
      ApiPaths.mapsConfig,
    );
    final data = response.data?['data'];
    if (data is Map) {
      final token = data['mapboxPublicToken'];
      if (token is String) {
        return MapToken.acceptPublic(token);
      }
    }
  } on DioException {
    // Fall through to empty — SDK uses OSM / keyed CARTO fallback.
  }
  return '';
});

final passengerMapProjectProvider = Provider<MapProject>((ref) {
  return RideMapProjects.passengerRequest();
});

final deviceLocationGatewayProvider = Provider<DeviceLocationGateway>((ref) {
  return CyrloDeviceLocationGateway();
});

final routePreviewGatewayProvider = Provider<RoutePreviewGateway>((ref) {
  if (AppConfig.useRideMapsProxy) {
    return RideMapsRoutePreviewGateway(api: ref.watch(apiClientProvider));
  }
  final token = ref.watch(mapAccessTokenProvider).value ?? '';
  if (token.isEmpty) return const UnavailableRoutePreviewGateway();
  return CyrloRoutePreviewGateway(
    client: MapboxDirectionsClient(accessToken: token),
  );
});

final placeLookupGatewayProvider = Provider<PlaceLookupGateway>((ref) {
  if (AppConfig.useRideMapsProxy) {
    return RideMapsPlaceLookupGateway(api: ref.watch(apiClientProvider));
  }
  return CyrloPlaceLookupGateway(
    geocoding: const UnavailableGeocodingClient(),
    places: const UnavailablePlaceSearchClient(),
  );
});

/// Direct Maps HTTP client for diagnostics only — no Maps API key in the app.
/// Privileged calls go through Ride `/maps/*` when [AppConfig.useRideMapsProxy].
final cyrloMapsApiClientProvider = Provider<CyrloMapsApiClient>((ref) {
  return CyrloMapsApiClient(
    baseUrl: AppConfig.cyrloMapsApiBaseUrl,
    apiKey: '',
  );
});
