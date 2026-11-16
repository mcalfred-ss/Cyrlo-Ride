import 'package:cyrlo_maps/cyrlo_maps.dart';

import '../../shared/models/geo_point.dart';
import 'resolved_location.dart';

class PlaceLookupHit {
  const PlaceLookupHit({
    required this.label,
    required this.point,
    this.id,
    this.address,
  });

  final String? id;
  final String label;
  final GeoPoint point;
  final String? address;
}

class PlaceLookupException implements Exception {
  const PlaceLookupException({required this.code, required this.message});

  final String code;
  final String message;

  @override
  String toString() => 'PlaceLookupException($code): $message';
}

/// Forward/reverse geocode, place search, and structured location resolution.
/// Ride never invents addresses.
abstract class PlaceLookupGateway {
  Future<List<PlaceLookupHit>> search(String query, {GeoPoint? bias});
  Future<List<PlaceLookupHit>> forward(String query);
  Future<PlaceLookupHit?> reverse(GeoPoint point);

  /// Structured hierarchy + nearby landmarks. Coordinates are never moved.
  Future<ResolvedLocation?> resolve(GeoPoint point, {int landmarkLimit = 5});
}

class CyrloPlaceLookupGateway implements PlaceLookupGateway {
  CyrloPlaceLookupGateway({
    required this.geocoding,
    required this.places,
  });

  final GeocodingClient geocoding;
  final PlaceSearchClient places;

  @override
  Future<List<PlaceLookupHit>> search(String query, {GeoPoint? bias}) async {
    try {
      final hits = await places.search(
        PlaceQuery(
          text: query,
          bias: bias?.toMapCoordinate(),
        ),
      );
      return [
        for (final hit in hits)
          PlaceLookupHit(
            id: hit.id,
            label: hit.label,
            point: GeoPoint.fromMapCoordinate(hit.point),
            address: hit.address,
          ),
      ];
    } on PlaceSearchException catch (error) {
      throw PlaceLookupException(code: error.code, message: error.message);
    }
  }

  @override
  Future<List<PlaceLookupHit>> forward(String query) async {
    try {
      final hits = await geocoding.forward(query);
      return [
        for (final hit in hits)
          PlaceLookupHit(
            label: hit.label,
            point: GeoPoint.fromMapCoordinate(hit.point),
          ),
      ];
    } on GeocodingException catch (error) {
      throw PlaceLookupException(code: error.code, message: error.message);
    }
  }

  @override
  Future<PlaceLookupHit?> reverse(GeoPoint point) async {
    try {
      final hit = await geocoding.reverse(point.toMapCoordinate());
      if (hit == null) return null;
      return PlaceLookupHit(
        label: hit.label,
        point: GeoPoint.fromMapCoordinate(hit.point),
      );
    } on GeocodingException catch (error) {
      throw PlaceLookupException(code: error.code, message: error.message);
    }
  }

  @override
  Future<ResolvedLocation?> resolve(
    GeoPoint point, {
    int landmarkLimit = 5,
  }) async {
    // Direct SDK path has no Ashanti catalogue — fall back to reverse label only.
    final hit = await reverse(point);
    if (hit == null) return null;
    return ResolvedLocation(
      formattedAddress: hit.address?.trim().isNotEmpty == true
          ? hit.address!.trim()
          : hit.label,
      point: point,
      source: 'provider',
      confidence: 'approximate',
      approximate: true,
      providerLabel: hit.label,
    );
  }
}

/// Stock SDK geocoder and place search throw `unavailable`. This keeps that explicit.
class UnavailablePlaceLookupGateway implements PlaceLookupGateway {
  const UnavailablePlaceLookupGateway();

  @override
  Future<List<PlaceLookupHit>> search(String query, {GeoPoint? bias}) async {
    throw const PlaceLookupException(
      code: 'unavailable',
      message: 'Place search is not configured.',
    );
  }

  @override
  Future<List<PlaceLookupHit>> forward(String query) async {
    throw const PlaceLookupException(
      code: 'unavailable',
      message: 'Geocoding is not configured.',
    );
  }

  @override
  Future<PlaceLookupHit?> reverse(GeoPoint point) async {
    throw const PlaceLookupException(
      code: 'unavailable',
      message: 'Reverse geocoding is not configured.',
    );
  }

  @override
  Future<ResolvedLocation?> resolve(
    GeoPoint point, {
    int landmarkLimit = 5,
  }) async {
    throw const PlaceLookupException(
      code: 'unavailable',
      message: 'Location resolution is not configured.',
    );
  }
}
