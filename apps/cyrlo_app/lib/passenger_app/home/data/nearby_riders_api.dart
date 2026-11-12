import 'package:dio/dio.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';

import '../../../core/constants/api_paths.dart';
import '../../../core/errors/api_exception.dart';
import '../../../core/network/api_client.dart';
import '../../../features/auth/application/signup_draft.dart';
import '../../../shared/models/geo_point.dart';
import '../../../shared/providers/core_providers.dart';
import '../domain/nearby_rider.dart';

class NearbyDiscoveryResult {
  const NearbyDiscoveryResult({
    required this.inServiceArea,
    required this.riders,
    this.serviceZoneId,
    this.radiusMeters = 5000,
    this.freshnessWindowSeconds = 30,
  });

  final bool inServiceArea;
  final String? serviceZoneId;
  final int radiusMeters;
  final int freshnessWindowSeconds;
  final List<NearbyRider> riders;

  factory NearbyDiscoveryResult.fromJson(Map<String, dynamic> json) {
    final raw = json['riders'];
    final riders = <NearbyRider>[];
    if (raw is List) {
      for (final item in raw) {
        if (item is! Map) continue;
        final map = Map<String, dynamic>.from(item);
        final approx = map['approximate'];
        if (approx is! Map) continue;
        final point = GeoPoint(
          latitude: (approx['latitude'] as num).toDouble(),
          longitude: (approx['longitude'] as num).toDouble(),
        );
        if (!point.isValid) continue;
        riders.add(
          NearbyRider(
            id: map['id'] as String,
            kind: _kind(map['vehicleCategory'] as String?),
            etaMinutes: (map['etaMinutes'] as num?)?.toInt() ?? 1,
            point: point,
            displayName: map['displayName'] as String? ?? 'Rider',
            rating: 0,
            reviewCount: 0,
            available: map['available'] as bool? ?? true,
            busy: false,
          ),
        );
      }
    }
    return NearbyDiscoveryResult(
      inServiceArea: json['inServiceArea'] as bool? ?? false,
      serviceZoneId: json['serviceZoneId'] as String?,
      radiusMeters: (json['radiusMeters'] as num?)?.toInt() ?? 5000,
      freshnessWindowSeconds:
          (json['freshnessWindowSeconds'] as num?)?.toInt() ?? 30,
      riders: riders,
    );
  }

  static DriverKind _kind(String? category) {
    return switch (category) {
      'OKADA' => DriverKind.okada,
      'ABOBOYAA' => DriverKind.aboboyaa,
      _ => DriverKind.pragya,
    };
  }
}

abstract class NearbyRidersApi {
  Future<NearbyDiscoveryResult> discover({
    required String accessToken,
    required GeoPoint pickup,
    String vehicleCategory = 'PRAGYA',
  });
}

class LiveNearbyRidersApi implements NearbyRidersApi {
  LiveNearbyRidersApi(this._client);

  final ApiClient _client;

  @override
  Future<NearbyDiscoveryResult> discover({
    required String accessToken,
    required GeoPoint pickup,
    String vehicleCategory = 'PRAGYA',
  }) async {
    _client.setAccessToken(accessToken);
    try {
      final response = await _client.dio.post(
        ApiPaths.matchingNearby,
        data: {
          'pickup': {
            'latitude': pickup.latitude,
            'longitude': pickup.longitude,
          },
          'vehicleCategory': vehicleCategory,
        },
      );
      return NearbyDiscoveryResult.fromJson(_dataMap(response.data));
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

final nearbyRidersApiProvider = Provider<NearbyRidersApi>((ref) {
  return LiveNearbyRidersApi(ref.watch(apiClientProvider));
});
