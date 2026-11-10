import 'package:dio/dio.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';

import '../../core/constants/api_paths.dart';
import '../../core/errors/api_exception.dart';
import '../../core/network/api_client.dart';
import '../../features/bookings/data/booking_models.dart';
import '../../shared/models/geo_point.dart';
import '../../shared/providers/core_providers.dart';

class RiderLocationSnapshot {
  const RiderLocationSnapshot({
    required this.sharingEnabled,
    required this.recordedAt,
    required this.fresh,
    required this.latitude,
    required this.longitude,
    this.accuracyMeters,
    this.heading,
  });

  final bool sharingEnabled;
  final DateTime recordedAt;
  final bool fresh;
  final double latitude;
  final double longitude;
  final double? accuracyMeters;
  final double? heading;

  factory RiderLocationSnapshot.fromJson(Map<String, dynamic> json) {
    return RiderLocationSnapshot(
      sharingEnabled: json['sharingEnabled'] as bool? ?? false,
      recordedAt: DateTime.tryParse(json['recordedAt'] as String? ?? '') ??
          DateTime.now().toUtc(),
      fresh: json['fresh'] as bool? ?? false,
      latitude: (json['latitude'] as num?)?.toDouble() ?? 0,
      longitude: (json['longitude'] as num?)?.toDouble() ?? 0,
      accuracyMeters: (json['accuracyMeters'] as num?)?.toDouble(),
      heading: (json['heading'] as num?)?.toDouble(),
    );
  }
}

class RiderAvailabilityResult {
  const RiderAvailabilityResult({
    required this.availability,
    required this.updatedAt,
    this.unchanged = false,
  });

  final String availability;
  final DateTime updatedAt;
  final bool unchanged;

  factory RiderAvailabilityResult.fromJson(Map<String, dynamic> json) {
    return RiderAvailabilityResult(
      availability: json['availability'] as String? ?? 'OFFLINE',
      updatedAt: DateTime.tryParse(json['updatedAt'] as String? ?? '') ??
          DateTime.now().toUtc(),
      unchanged: json['unchanged'] as bool? ?? false,
    );
  }
}

abstract class RiderOpsApi {
  Future<RiderAvailabilityResult> setAvailability({
    required String accessToken,
    required bool online,
  });

  Future<RiderLocationSnapshot> publishLocation({
    required String accessToken,
    required GeoPoint point,
    double? accuracyMeters,
    double? heading,
    DateTime? recordedAt,
  });

  Future<void> stopSharingLocation(String accessToken);

  Future<List<MatchingOffer>> listOffers(String accessToken);

  Future<Booking> acceptOffer({
    required String accessToken,
    required String offerId,
  });

  Future<void> rejectOffer({
    required String accessToken,
    required String offerId,
  });
}

class LiveRiderOpsApi implements RiderOpsApi {
  LiveRiderOpsApi(this._client);

  final ApiClient _client;

  @override
  Future<RiderAvailabilityResult> setAvailability({
    required String accessToken,
    required bool online,
  }) async {
    _client.setAccessToken(accessToken);
    try {
      final response = await _client.dio.post(
        ApiPaths.riderAvailability,
        data: {'availability': online ? 'AVAILABLE' : 'OFFLINE'},
      );
      return RiderAvailabilityResult.fromJson(_dataMap(response.data));
    } on DioException catch (error) {
      throw _asApiException(error);
    }
  }

  @override
  Future<RiderLocationSnapshot> publishLocation({
    required String accessToken,
    required GeoPoint point,
    double? accuracyMeters,
    double? heading,
    DateTime? recordedAt,
  }) async {
    _client.setAccessToken(accessToken);
    try {
      final response = await _client.dio.post(
        ApiPaths.riderLocation,
        data: {
          'latitude': point.latitude,
          'longitude': point.longitude,
          if (accuracyMeters != null) 'accuracyMeters': accuracyMeters,
          if (heading != null) 'heading': heading,
          'recordedAt':
              (recordedAt ?? DateTime.now().toUtc()).toIso8601String(),
        },
      );
      return RiderLocationSnapshot.fromJson(_dataMap(response.data));
    } on DioException catch (error) {
      throw _asApiException(error);
    }
  }

  @override
  Future<void> stopSharingLocation(String accessToken) async {
    _client.setAccessToken(accessToken);
    try {
      await _client.dio.post(ApiPaths.riderLocationStop);
    } on DioException catch (error) {
      throw _asApiException(error);
    }
  }

  @override
  Future<List<MatchingOffer>> listOffers(String accessToken) async {
    _client.setAccessToken(accessToken);
    try {
      final response = await _client.dio.get(ApiPaths.matchingOffers);
      final body = response.data;
      final raw = body is Map && body['data'] is List
          ? body['data'] as List
          : body is List
              ? body
              : const [];
      return [
        for (final item in raw)
          if (item is Map)
            MatchingOffer.fromJson(Map<String, dynamic>.from(item)),
      ];
    } on DioException catch (error) {
      throw _asApiException(error);
    }
  }

  @override
  Future<Booking> acceptOffer({
    required String accessToken,
    required String offerId,
  }) async {
    _client.setAccessToken(accessToken);
    try {
      final response =
          await _client.dio.post(ApiPaths.matchingOfferAccept(offerId));
      return Booking.fromJson(_dataMap(response.data));
    } on DioException catch (error) {
      throw _asApiException(error);
    }
  }

  @override
  Future<void> rejectOffer({
    required String accessToken,
    required String offerId,
  }) async {
    _client.setAccessToken(accessToken);
    try {
      await _client.dio.post(ApiPaths.matchingOfferReject(offerId));
    } on DioException catch (error) {
      throw _asApiException(error);
    }
  }

  Map<String, dynamic> _dataMap(Object? body) {
    if (body is Map && body['data'] is Map) {
      return Map<String, dynamic>.from(body['data'] as Map);
    }
    if (body is Map<String, dynamic>) return body;
    if (body is Map) return Map<String, dynamic>.from(body);
    throw const ApiException(
      code: 'BAD_RESPONSE',
      message: 'Unexpected server response.',
    );
  }

  ApiException _asApiException(DioException error) {
    if (error.error is ApiException) return error.error! as ApiException;
    return ApiException.fromJson(
      error.response?.data,
      statusCode: error.response?.statusCode,
    );
  }
}

final riderOpsApiProvider = Provider<RiderOpsApi>((ref) {
  return LiveRiderOpsApi(ref.watch(apiClientProvider));
});
