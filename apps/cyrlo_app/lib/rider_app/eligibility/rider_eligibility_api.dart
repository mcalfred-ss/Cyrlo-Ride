import 'package:dio/dio.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';

import '../../core/constants/api_paths.dart';
import '../../core/errors/api_exception.dart';
import '../../core/network/api_client.dart';
import '../../shared/providers/core_providers.dart';

/// Exact `GET /riders/eligibility` payload (operational eligibility).
class RiderEligibility {
  const RiderEligibility({
    required this.riderId,
    required this.eligible,
    required this.reasons,
    required this.verificationEligible,
    required this.onActiveTrip,
    required this.gpsFresh,
  });

  final String riderId;
  final bool eligible;
  final List<String> reasons;
  final bool verificationEligible;
  final bool onActiveTrip;
  final bool gpsFresh;

  bool get hasApprovedActiveZone =>
      !reasons.contains('NO_APPROVED_ACTIVE_ZONE');

  bool get hasLocationIssue =>
      reasons.contains('NO_LOCATION') ||
      reasons.contains('GPS_NOT_SHARING') ||
      reasons.contains('GPS_NOT_FRESH');

  factory RiderEligibility.fromJson(Map<String, dynamic> json) {
    final rawReasons = json['reasons'];
    final reasons = <String>[];
    if (rawReasons is List) {
      for (final item in rawReasons) {
        reasons.add('$item');
      }
    }
    return RiderEligibility(
      riderId: json['riderId'] as String? ?? '',
      eligible: json['eligible'] as bool? ?? false,
      reasons: reasons,
      verificationEligible: json['verificationEligible'] as bool? ?? false,
      onActiveTrip: json['onActiveTrip'] as bool? ?? false,
      gpsFresh: json['gpsFresh'] as bool? ?? false,
    );
  }
}

abstract class RiderEligibilityApi {
  Future<RiderEligibility> fetch({required String accessToken});
}

class LiveRiderEligibilityApi implements RiderEligibilityApi {
  LiveRiderEligibilityApi(this._client);

  final ApiClient _client;

  @override
  Future<RiderEligibility> fetch({required String accessToken}) async {
    _client.setAccessToken(accessToken);
    try {
      final response = await _client.dio.get(ApiPaths.riderEligibility);
      return RiderEligibility.fromJson(_dataMap(response.data));
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

final riderEligibilityApiProvider = Provider<RiderEligibilityApi>((ref) {
  return LiveRiderEligibilityApi(ref.watch(apiClientProvider));
});
