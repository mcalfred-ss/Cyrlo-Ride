import 'package:dio/dio.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';

import '../../core/constants/api_paths.dart';
import '../../core/errors/api_exception.dart';
import '../../core/network/api_client.dart';
import '../providers/core_providers.dart';

class RegisteredDevice {
  const RegisteredDevice({
    required this.id,
    required this.platform,
    required this.provider,
    required this.isActive,
    required this.tokenPreview,
  });

  final String id;
  final String platform;
  final String provider;
  final bool isActive;
  final String tokenPreview;

  factory RegisteredDevice.fromJson(Map<String, dynamic> json) {
    return RegisteredDevice(
      id: json['id'] as String,
      platform: json['platform'] as String? ?? 'ANDROID',
      provider: json['provider'] as String? ?? 'FCM',
      isActive: json['isActive'] as bool? ?? true,
      tokenPreview: json['tokenPreview'] as String? ?? '',
    );
  }
}

abstract class NotificationsApi {
  Future<RegisteredDevice> registerDevice({
    required String accessToken,
    required String token,
    required String platform,
    String provider = 'FCM',
  });

  Future<void> deactivateDevice({
    required String accessToken,
    required String deviceId,
  });

  Future<List<RegisteredDevice>> listDevices(String accessToken);
}

class LiveNotificationsApi implements NotificationsApi {
  LiveNotificationsApi(this._client);

  final ApiClient _client;

  @override
  Future<RegisteredDevice> registerDevice({
    required String accessToken,
    required String token,
    required String platform,
    String provider = 'FCM',
  }) async {
    try {
      _client.setAccessToken(accessToken);
      final response = await _client.dio.post(
        ApiPaths.notificationDevices,
        data: {
          'token': token,
          'platform': platform,
          'provider': provider,
        },
      );
      final data = _unwrap(response.data);
      return RegisteredDevice.fromJson(data);
    } on DioException catch (error) {
      throw _asApiException(error);
    }
  }

  @override
  Future<void> deactivateDevice({
    required String accessToken,
    required String deviceId,
  }) async {
    try {
      _client.setAccessToken(accessToken);
      await _client.dio.delete(ApiPaths.notificationDevice(deviceId));
    } on DioException catch (error) {
      throw _asApiException(error);
    }
  }

  @override
  Future<List<RegisteredDevice>> listDevices(String accessToken) async {
    try {
      _client.setAccessToken(accessToken);
      final response = await _client.dio.get(ApiPaths.notificationDevices);
      final raw = response.data;
      final list = raw is Map && raw['data'] is List
          ? raw['data'] as List
          : raw is List
              ? raw
              : const [];
      return [
        for (final item in list)
          if (item is Map)
            RegisteredDevice.fromJson(Map<String, dynamic>.from(item)),
      ];
    } on DioException catch (error) {
      throw _asApiException(error);
    }
  }

  Map<String, dynamic> _unwrap(dynamic body) {
    if (body is Map<String, dynamic>) {
      final data = body['data'];
      if (data is Map<String, dynamic>) return data;
      return body;
    }
    if (body is Map) return Map<String, dynamic>.from(body);
    throw const ApiException(
      code: 'BAD_RESPONSE',
      message: 'Unexpected notifications response',
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

final notificationsApiProvider = Provider<NotificationsApi>((ref) {
  return LiveNotificationsApi(ref.watch(apiClientProvider));
});
