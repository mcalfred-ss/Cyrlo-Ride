import '../../shared/models/geo_point.dart';
import 'location_label.dart';

/// Nearby landmark returned by Ride `POST /maps/location/resolve`.
class NearbyLandmarkRef {
  const NearbyLandmarkRef({
    required this.name,
    required this.category,
    required this.point,
    required this.distanceMeters,
    required this.source,
  });

  final String name;
  final String category;
  final GeoPoint point;
  final double distanceMeters;
  final String source;

  String get distanceLabel {
    if (distanceMeters < 1000) {
      return '${distanceMeters.round()} m';
    }
    final km = distanceMeters / 1000;
    return km < 10 ? '${km.toStringAsFixed(1)} km' : '${km.round()} km';
  }

  factory NearbyLandmarkRef.fromJson(Map<dynamic, dynamic> json) {
    return NearbyLandmarkRef(
      name: json['name'] as String? ?? '',
      category: json['category'] as String? ?? 'landmark',
      point: GeoPoint(
        latitude: (json['latitude'] as num).toDouble(),
        longitude: (json['longitude'] as num).toDouble(),
      ),
      distanceMeters: (json['distanceMeters'] as num).toDouble(),
      source: json['source'] as String? ?? '',
    );
  }
}

/// Structured location from Ride location resolution.
///
/// Pickup coordinates stay on [point] — never replaced by a town centroid.
class ResolvedLocation {
  const ResolvedLocation({
    required this.formattedAddress,
    required this.point,
    required this.source,
    required this.confidence,
    required this.approximate,
    this.locality,
    this.neighbourhood,
    this.city,
    this.district,
    this.region,
    this.country,
    this.providerLabel,
    this.catalogueTownId,
    this.catalogueTownDistanceMeters,
    this.nearbyLandmarks = const [],
  });

  final String formattedAddress;
  final String? locality;
  final String? neighbourhood;
  final String? city;
  final String? district;
  final String? region;
  final String? country;
  final GeoPoint point;
  final String source;
  final String confidence;
  final bool approximate;
  final String? providerLabel;
  final String? catalogueTownId;
  final double? catalogueTownDistanceMeters;
  final List<NearbyLandmarkRef> nearbyLandmarks;

  bool get hasAddress => formattedAddress.trim().isNotEmpty;

  factory ResolvedLocation.fromJson(Map<dynamic, dynamic> data) {
    final location = data['location'];
    if (location is! Map) {
      throw const FormatException('location resolve payload missing location');
    }
    final landmarksRaw = data['nearbyLandmarks'];
    return ResolvedLocation(
      formattedAddress: location['formattedAddress'] as String? ?? '',
      locality: location['locality'] as String?,
      neighbourhood: location['neighbourhood'] as String?,
      city: location['city'] as String?,
      district: location['district'] as String?,
      region: location['region'] as String?,
      country: location['country'] as String?,
      point: GeoPoint(
        latitude: (location['latitude'] as num).toDouble(),
        longitude: (location['longitude'] as num).toDouble(),
      ),
      source: location['source'] as String? ?? 'unavailable',
      confidence: location['confidence'] as String? ?? 'approximate',
      approximate: location['approximate'] as bool? ?? true,
      providerLabel: location['providerLabel'] as String?,
      catalogueTownId: location['catalogueTownId'] as String?,
      catalogueTownDistanceMeters:
          (location['catalogueTownDistanceMeters'] as num?)?.toDouble(),
      nearbyLandmarks: [
        if (landmarksRaw is List)
          for (final item in landmarksRaw)
            if (item is Map) NearbyLandmarkRef.fromJson(item),
      ],
    );
  }
}

/// Display label for a resolved location. Keeps approximate wording when needed.
String displayResolvedLocationLabel(
  ResolvedLocation? resolved, {
  String? fallback,
}) {
  if (resolved == null || !resolved.hasAddress) {
    final fb = fallback?.trim();
    return fb ?? '';
  }

  final shaped = shapeLocationLabel(
    resolved.formattedAddress,
    fallback: fallback,
  );
  if (shaped.isEmpty) return fallback?.trim() ?? '';

  if (resolved.approximate || isCoarseRegionLabel(shaped)) {
    if (shaped.toLowerCase().startsWith('approximate')) return shaped;
    return shaped;
  }
  return shaped;
}

/// One-line nearby landmark summary for the pickup card.
String formatNearbyLandmarksSummary(
  List<NearbyLandmarkRef> landmarks, {
  int limit = 3,
}) {
  if (landmarks.isEmpty) return '';
  final lines = landmarks.take(limit).map((hit) {
    return '${hit.name} — ${hit.distanceLabel}';
  });
  return 'Nearby: ${lines.join('; ')}';
}
