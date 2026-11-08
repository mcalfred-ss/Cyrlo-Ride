import 'package:dio/dio.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';

import '../../../core/constants/api_paths.dart';
import '../../../core/errors/api_exception.dart';
import '../../../core/network/api_client.dart';
import '../../../shared/providers/core_providers.dart';
import '../application/signup_draft.dart';
import 'auth_models.dart';

abstract class AuthApi {
  Future<RequestOtpResult> requestOtp(String phoneNumber);

  Future<AuthTokens> verifyOtp({
    required String phoneNumber,
    required String code,
    required RideRole role,
  });

  Future<AuthTokens> refresh(String refreshToken);

  Future<void> logout({
    required String accessToken,
    required String refreshToken,
  });

  Future<AuthUser> me(String accessToken);
}

class LiveAuthApi implements AuthApi {
  LiveAuthApi(this._client);

  final ApiClient _client;

  @override
  Future<RequestOtpResult> requestOtp(String phoneNumber) async {
    try {
      final response = await _client.dio.post(
        ApiPaths.requestOtp,
        data: {'phoneNumber': phoneNumber},
      );
      return RequestOtpResult.fromJson(_dataMap(response.data));
    } on DioException catch (error) {
      throw _asApiException(error);
    }
  }

  @override
  Future<AuthTokens> verifyOtp({
    required String phoneNumber,
    required String code,
    required RideRole role,
  }) async {
    try {
      final response = await _client.dio.post(
        ApiPaths.verifyOtp,
        data: {
          'phoneNumber': phoneNumber,
          'code': code,
          'role': role == RideRole.rider ? 'RIDER' : 'PASSENGER',
        },
      );
      return AuthTokens.fromJson(_dataMap(response.data));
    } on DioException catch (error) {
      throw _asApiException(error);
    }
  }

  @override
  Future<AuthTokens> refresh(String refreshToken) async {
    try {
      final response = await _client.dio.post(
        ApiPaths.refreshSession,
        data: {'refreshToken': refreshToken},
      );
      final data = _dataMap(response.data);
      // Refresh may omit user; caller merges with existing session user.
      if (data['user'] is! Map) {
        return AuthTokens(
          accessToken: data['accessToken'] as String,
          refreshToken: data['refreshToken'] as String,
          expiresIn: (data['expiresIn'] as num?)?.toInt() ?? 900,
          user: const AuthUser(
            id: '',
            phoneNumber: '',
            role: RideRole.passenger,
            status: 'ACTIVE',
          ),
        );
      }
      return AuthTokens.fromJson(data);
    } on DioException catch (error) {
      throw _asApiException(error);
    }
  }

  @override
  Future<void> logout({
    required String accessToken,
    required String refreshToken,
  }) async {
    _client.setAccessToken(accessToken);
    try {
      await _client.dio.post(
        ApiPaths.logout,
        data: {'refreshToken': refreshToken},
      );
    } on DioException catch (error) {
      throw _asApiException(error);
    } finally {
      _client.setAccessToken(null);
    }
  }

  @override
  Future<AuthUser> me(String accessToken) async {
    _client.setAccessToken(accessToken);
    try {
      final response = await _client.dio.get('/users/me');
      return AuthUser.fromJson(_dataMap(response.data));
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

/// In-memory auth for widget tests (no network).
class FakeAuthApi implements AuthApi {
  FakeAuthApi({this.acceptCode = '123456'});

  final String acceptCode;
  final Map<String, String> _codes = {};

  @override
  Future<RequestOtpResult> requestOtp(String phoneNumber) async {
    _codes[phoneNumber] = acceptCode;
    return const RequestOtpResult(expiresIn: 300, resendAfter: 60);
  }

  @override
  Future<AuthTokens> verifyOtp({
    required String phoneNumber,
    required String code,
    required RideRole role,
  }) async {
    if (code.trim() != (_codes[phoneNumber] ?? acceptCode)) {
      throw const ApiException(
        code: 'OTP_INVALID',
        message: 'Invalid or expired code.',
        statusCode: 401,
      );
    }
    return AuthTokens(
      accessToken: 'test-access',
      refreshToken: 'test-refresh-token-value',
      expiresIn: 900,
      user: AuthUser(
        id: 'user-$phoneNumber',
        phoneNumber: phoneNumber,
        role: role,
        status: 'ACTIVE',
      ),
    );
  }

  @override
  Future<AuthTokens> refresh(String refreshToken) async {
    return AuthTokens(
      accessToken: 'test-access-refreshed',
      refreshToken: '$refreshToken-rotated',
      expiresIn: 900,
      user: const AuthUser(
        id: 'user-refresh',
        phoneNumber: '+233244000000',
        role: RideRole.passenger,
        status: 'ACTIVE',
      ),
    );
  }

  @override
  Future<void> logout({
    required String accessToken,
    required String refreshToken,
  }) async {}

  @override
  Future<AuthUser> me(String accessToken) async {
    return const AuthUser(
      id: 'user-me',
      phoneNumber: '+233244000000',
      role: RideRole.passenger,
      status: 'ACTIVE',
    );
  }
}

final authApiProvider = Provider<AuthApi>((ref) {
  return LiveAuthApi(ref.watch(apiClientProvider));
});
