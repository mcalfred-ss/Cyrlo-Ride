import 'package:cyrlo_maps/cyrlo_maps.dart';

import '../../shared/models/geo_point.dart';

/// Map exploration extent for Greater Kumasi (not a service-zone boundary).
///
/// Accra and other cities are intentionally outside this camera guide.
/// Service availability still comes only from backend zone checks.
abstract final class GreaterKumasiExtent {
  /// Approximate southwest corner of the Greater Kumasi urban area.
  static const GeoPoint southWest = GeoPoint(
    latitude: 6.52,
    longitude: -1.78,
  );

  /// Approximate northeast corner of the Greater Kumasi urban area.
  static const GeoPoint northEast = GeoPoint(
    latitude: 6.86,
    longitude: -1.45,
  );

  /// Wider cold-start view so Ahenema Kokoben and central Kumasi are visible.
  static const double explorationZoom = 11.6;

  /// Closer zoom once the user has a pickup or GPS fix.
  static const double focusedZoom = 14.5;

  static bool contains(GeoPoint point) {
    if (!point.isValid) return false;
    return point.latitude >= southWest.latitude &&
        point.latitude <= northEast.latitude &&
        point.longitude >= southWest.longitude &&
        point.longitude <= northEast.longitude;
  }

  /// Soft-clamp a camera target into the Greater Kumasi exploration extent.
  static MapCoordinate clampCamera(MapCoordinate target) {
    final lat = target.latitude.clamp(
      southWest.latitude,
      northEast.latitude,
    );
    final lng = target.longitude.clamp(
      southWest.longitude,
      northEast.longitude,
    );
    return MapCoordinate(latitude: lat, longitude: lng);
  }

  static GeoPoint clampPoint(GeoPoint point) {
    final clamped = clampCamera(point.toMapCoordinate());
    return GeoPoint(
      latitude: clamped.latitude,
      longitude: clamped.longitude,
    );
  }
}
