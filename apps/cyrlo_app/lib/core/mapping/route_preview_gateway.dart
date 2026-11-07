import 'package:cyrlo_maps/cyrlo_maps.dart';

import '../../shared/models/geo_point.dart';

/// Preview polyline between two pins. Not a fare and not a matching input.
class RoutePreview {
  const RoutePreview({
    required this.points,
    required this.distanceMeters,
    required this.durationSeconds,
  });

  final List<GeoPoint> points;
  final double distanceMeters;
  final double durationSeconds;
}

class RoutePreviewException implements Exception {
  const RoutePreviewException({required this.code, required this.message});

  final String code;
  final String message;

  @override
  String toString() => 'RoutePreviewException($code): $message';
}

abstract class RoutePreviewGateway {
  Future<RoutePreview> preview({
    required GeoPoint from,
    required GeoPoint to,
  });
}

class CyrloRoutePreviewGateway implements RoutePreviewGateway {
  CyrloRoutePreviewGateway({required this.client});

  final DirectionsClient client;

  @override
  Future<RoutePreview> preview({
    required GeoPoint from,
    required GeoPoint to,
  }) async {
    try {
      final route = await client.route(
        from: from.toMapCoordinate(),
        to: to.toMapCoordinate(),
      );
      return RoutePreview(
        points: [
          for (final point in route.points) GeoPoint.fromMapCoordinate(point),
        ],
        distanceMeters: route.distanceMeters,
        durationSeconds: route.durationSeconds,
      );
    } on DirectionsException catch (error) {
      throw RoutePreviewException(code: error.code, message: error.message);
    }
  }
}

/// Used when Directions is unavailable (empty token or tests).
class UnavailableRoutePreviewGateway implements RoutePreviewGateway {
  const UnavailableRoutePreviewGateway();

  @override
  Future<RoutePreview> preview({
    required GeoPoint from,
    required GeoPoint to,
  }) async {
    throw const RoutePreviewException(
      code: 'unavailable',
      message: 'Route preview is not configured.',
    );
  }
}
