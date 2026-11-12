import 'package:dio/dio.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:image_picker/image_picker.dart';

import '../../../core/constants/api_paths.dart';
import '../../../core/errors/api_exception.dart';
import '../../../core/network/api_client.dart';
import '../../../shared/providers/core_providers.dart';
import 'rider_onboarding_models.dart';

abstract class RiderOnboardingApi {
  Future<RiderApplicationView> startOnboarding({
    required String accessToken,
    required String fullName,
    String? driversLicenceNumber,
    DateTime? driversLicenceExpiry,
    String? ghanaCardNumber,
  });

  Future<RiderApplicationView> updateOnboarding({
    required String accessToken,
    String? fullName,
    String? driversLicenceNumber,
    DateTime? driversLicenceExpiry,
    String? ghanaCardNumber,
  });

  Future<RiderApplicationView> getMyApplication(String accessToken);

  Future<RiderVehicleView> createVehicle({
    required String accessToken,
    required CreateVehicleInput input,
  });

  Future<RiderDocumentView> uploadDocument({
    required String accessToken,
    required RiderDocumentKind kind,
    required String filePath,
    String? vehicleId,
  });

  Future<RiderApplicationView> submitApplication(String accessToken);
}

class LiveRiderOnboardingApi implements RiderOnboardingApi {
  LiveRiderOnboardingApi(this._client);

  final ApiClient _client;

  @override
  Future<RiderApplicationView> startOnboarding({
    required String accessToken,
    required String fullName,
    String? driversLicenceNumber,
    DateTime? driversLicenceExpiry,
    String? ghanaCardNumber,
  }) async {
    _client.setAccessToken(accessToken);
    try {
      final response = await _client.dio.post(
        ApiPaths.riderOnboarding,
        data: {
          'fullName': fullName,
          if (driversLicenceNumber != null)
            'driversLicenceNumber': driversLicenceNumber,
          if (driversLicenceExpiry != null)
            'driversLicenceExpiry':
                driversLicenceExpiry.toUtc().toIso8601String(),
          if (ghanaCardNumber != null) 'ghanaCardNumber': ghanaCardNumber,
        },
      );
      return RiderApplicationView.fromJson(_dataMap(response.data));
    } on DioException catch (error) {
      throw _asApiException(error);
    }
  }

  @override
  Future<RiderApplicationView> updateOnboarding({
    required String accessToken,
    String? fullName,
    String? driversLicenceNumber,
    DateTime? driversLicenceExpiry,
    String? ghanaCardNumber,
  }) async {
    _client.setAccessToken(accessToken);
    try {
      final response = await _client.dio.patch(
        ApiPaths.riderOnboarding,
        data: {
          if (fullName != null) 'fullName': fullName,
          if (driversLicenceNumber != null)
            'driversLicenceNumber': driversLicenceNumber,
          if (driversLicenceExpiry != null)
            'driversLicenceExpiry':
                driversLicenceExpiry.toUtc().toIso8601String(),
          if (ghanaCardNumber != null) 'ghanaCardNumber': ghanaCardNumber,
        },
      );
      return RiderApplicationView.fromJson(_dataMap(response.data));
    } on DioException catch (error) {
      throw _asApiException(error);
    }
  }

  @override
  Future<RiderApplicationView> getMyApplication(String accessToken) async {
    _client.setAccessToken(accessToken);
    try {
      final response = await _client.dio.get(ApiPaths.riderOnboarding);
      return RiderApplicationView.fromJson(_dataMap(response.data));
    } on DioException catch (error) {
      throw _asApiException(error);
    }
  }

  @override
  Future<RiderVehicleView> createVehicle({
    required String accessToken,
    required CreateVehicleInput input,
  }) async {
    _client.setAccessToken(accessToken);
    try {
      final response = await _client.dio.post(
        ApiPaths.riderVehicles,
        data: input.toJson(),
      );
      return RiderVehicleView.fromJson(_dataMap(response.data));
    } on DioException catch (error) {
      throw _asApiException(error);
    }
  }

  @override
  Future<RiderDocumentView> uploadDocument({
    required String accessToken,
    required RiderDocumentKind kind,
    required String filePath,
    String? vehicleId,
  }) async {
    _client.setAccessToken(accessToken);
    try {
      // Web image_picker returns blob: URLs — fromFile fails there. Bytes work
      // on mobile, desktop, and web.
      final xfile = XFile(filePath);
      final bytes = await xfile.readAsBytes();
      if (bytes.isEmpty) {
        throw const ApiException(
          code: 'EMPTY_FILE',
          message: 'Selected file is empty. Pick the photo again.',
        );
      }
      var name = xfile.name.trim();
      if (name.isEmpty || name == 'blob' || !name.contains('.')) {
        final leaf = filePath.replaceAll('\\', '/').split('/').last;
        name = leaf.contains('.') ? leaf : 'upload.jpg';
      }
      final form = FormData.fromMap({
        'kind': kind.apiValue,
        if (vehicleId != null) 'vehicleId': vehicleId,
        'file': MultipartFile.fromBytes(bytes, filename: name),
      });
      final response = await _client.dio.post(
        ApiPaths.riderDocuments,
        data: form,
        options: Options(contentType: 'multipart/form-data'),
      );
      return RiderDocumentView.fromJson(_dataMap(response.data));
    } on ApiException {
      rethrow;
    } on DioException catch (error) {
      throw _asApiException(error);
    } catch (error) {
      throw ApiException(
        code: 'UPLOAD_FAILED',
        message: 'Could not read the selected photo. Pick it again.',
        details: {'cause': error.toString()},
      );
    }
  }

  @override
  Future<RiderApplicationView> submitApplication(String accessToken) async {
    _client.setAccessToken(accessToken);
    try {
      final response = await _client.dio.post(ApiPaths.riderOnboardingSubmit);
      return RiderApplicationView.fromJson(_dataMap(response.data));
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

final riderOnboardingApiProvider = Provider<RiderOnboardingApi>((ref) {
  return LiveRiderOnboardingApi(ref.watch(apiClientProvider));
});
