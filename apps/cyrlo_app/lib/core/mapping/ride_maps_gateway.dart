import 'package:dio/dio.dart';

import '../../shared/models/geo_point.dart';
import '../errors/api_exception.dart';
import '../network/api_client.dart';
import 'place_lookup_gateway.dart';
import 'route_preview_gateway.dart';

/// Privileged Maps operations via Cyrlo Ride (server holds the Maps API key).
class RideMapsPlaceLookupGateway implements PlaceLookupGateway {
  RideMapsPlaceLookupGateway({required this.api});

  final ApiClient api;

  @override
  Future<List<PlaceLookupHit>> search(String query, {GeoPoint? bias}) async {
    try {
      final response = await api.dio.post<Map<String, dynamic>>(
        '/maps/places/search',
        data: {
          'text': query,
          if (bias != null)
            'bias': {
              'latitude': bias.latitude,
              'longitude': bias.longitude,
            },
        },
      );
      return _hitsFromResults(response.data?['data']?['results']);
    } on DioException catch (error) {
      throw _lookupError(error);
    }
  }

  @override
  Future<List<PlaceLookupHit>> forward(String query) async {
    try {
      final response = await api.dio.post<Map<String, dynamic>>(
        '/maps/geocode',
        data: {'query': query},
      );
      return _hitsFromResults(response.data?['data']?['results']);
    } on DioException catch (error) {
      throw _lookupError(error);
    }
  }

  @override
  Future<PlaceLookupHit?> reverse(GeoPoint point) async {
    try {
      final response = await api.dio.post<Map<String, dynamic>>(
        '/maps/geocode/reverse',
        data: {
          'latitude': point.latitude,
          'longitude': point.longitude,
        },
      );
      final result = response.data?['data']?['result'];
      if (result is! Map) return null;
      return PlaceLookupHit(
        label: result['label'] as String? ?? '',
        point: GeoPoint(
          latitude: (result['latitude'] as num).toDouble(),
          longitude: (result['longitude'] as num).toDouble(),
        ),
      );
    } on DioException catch (error) {
      throw _lookupError(error);
    }
  }

  List<PlaceLookupHit> _hitsFromResults(Object? results) {
    if (results is! List) return const [];
    return [
      for (final item in results)
        if (item is Map)
          PlaceLookupHit(
            id: item['id'] as String?,
            label: item['label'] as String? ?? '',
            address: item['address'] as String?,
            point: GeoPoint(
              latitude: (item['latitude'] as num).toDouble(),
              longitude: (item['longitude'] as num).toDouble(),
            ),
          ),
    ];
  }

  PlaceLookupException _lookupError(DioException error) {
    final apiError = error.error;
    if (apiError is ApiException) {
      return PlaceLookupException(code: apiError.code, message: apiError.message);
    }
    return const PlaceLookupException(
      code: 'unavailable',
      message: 'Place lookup failed',
    );
  }
}

class RideMapsRoutePreviewGateway implements RoutePreviewGateway {
  RideMapsRoutePreviewGateway({required this.api});

  final ApiClient api;

  @override
  Future<RoutePreview> preview({
    required GeoPoint from,
    required GeoPoint to,
  }) async {
    try {
      final response = await api.dio.post<Map<String, dynamic>>(
        '/maps/routes',
        data: {
          'from': {'latitude': from.latitude, 'longitude': from.longitude},
          'to': {'latitude': to.latitude, 'longitude': to.longitude},
        },
      );
      final data = response.data?['data'];
      if (data is! Map) {
        throw const RoutePreviewException(
          code: 'unavailable',
          message: 'Route preview response was incomplete',
        );
      }
      final geometry = data['geometry'];
      return RoutePreview(
        distanceMeters: (data['distanceMeters'] as num).toDouble(),
        durationSeconds: (data['durationSeconds'] as num).toDouble(),
        points: [
          if (geometry is List)
            for (final point in geometry)
              if (point is Map)
                GeoPoint(
                  latitude: (point['latitude'] as num).toDouble(),
                  longitude: (point['longitude'] as num).toDouble(),
                ),
        ],
      );
    } on DioException catch (error) {
      final apiError = error.error;
      if (apiError is ApiException) {
        throw RoutePreviewException(code: apiError.code, message: apiError.message);
      }
      throw const RoutePreviewException(
        code: 'unavailable',
        message: 'Route preview failed',
      );
    }
  }
}
