import 'package:cyrlo_maps/cyrlo_maps.dart';

/// Ride-domain coordinates. Convert to [MapCoordinate] only at the maps edge.
class GeoPoint {
  const GeoPoint({required this.latitude, required this.longitude});

  final double latitude;
  final double longitude;

  bool get isValid =>
      latitude >= -90 &&
      latitude <= 90 &&
      longitude >= -180 &&
      longitude <= 180;

  MapCoordinate toMapCoordinate() =>
      MapCoordinate(latitude: latitude, longitude: longitude);

  factory GeoPoint.fromMapCoordinate(MapCoordinate point) =>
      GeoPoint(latitude: point.latitude, longitude: point.longitude);

  factory GeoPoint.fromFix(LocationFix fix) =>
      GeoPoint(latitude: fix.latitude, longitude: fix.longitude);

  Map<String, double> toJson() => {
    'latitude': latitude,
    'longitude': longitude,
  };

  @override
  bool operator ==(Object other) =>
      other is GeoPoint &&
      other.latitude == latitude &&
      other.longitude == longitude;

  @override
  int get hashCode => Object.hash(latitude, longitude);
}
