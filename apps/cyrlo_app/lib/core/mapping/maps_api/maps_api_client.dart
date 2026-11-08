import 'package:dio/dio.dart';

import '../../config/app_config.dart';

/// Hosted Cyrlo Maps HTTP API client.
///
/// Auth uses the Ride-issued Maps API key (`X-API-Key`), never
/// [AppConfig.mapboxAccessToken].
class CyrloMapsApiClient {
  CyrloMapsApiClient({
    required String baseUrl,
    required String apiKey,
    Dio? dio,
  }) : _baseUrlRaw = baseUrl.trim(),
       _apiKey = apiKey.trim(),
       dio =
           dio ??
           Dio(
             BaseOptions(
               baseUrl: _normalizeBase(baseUrl),
               connectTimeout: const Duration(seconds: 10),
               receiveTimeout: const Duration(seconds: 20),
               headers: {
                 'Accept': 'application/json',
                 'Content-Type': 'application/json',
                 if (apiKey.trim().isNotEmpty) 'X-API-Key': apiKey.trim(),
               },
             ),
           );

  /// Convenience matching the Ride integration sketch.
  factory CyrloMapsApiClient.fromAppConfig({String? apiKey}) {
    return CyrloMapsApiClient(
      baseUrl: AppConfig.cyrloMapsApiBaseUrl,
      apiKey: apiKey ?? AppConfig.cyrloMapsApiKey,
    );
  }

  final String _baseUrlRaw;
  final String _apiKey;
  final Dio dio;

  Uri? get baseUrl {
    if (_baseUrlRaw.isEmpty) return null;
    return Uri.tryParse(_normalizeBase(_baseUrlRaw));
  }

  String get apiKey => _apiKey;

  /// Ready when both host and Ride maps key are present.
  bool get isConfigured =>
      baseUrl != null && _apiKey.isNotEmpty;

  /// Public health probe (no API key required on the Maps host).
  Future<bool> health() async {
    final root = baseUrl;
    if (root == null) return false;
    try {
      final response = await dio.getUri(root.replace(path: '/health'));
      return response.statusCode == 200;
    } on DioException {
      return false;
    }
  }

  Future<Response<dynamic>> get(
    String path, {
    Map<String, dynamic>? queryParameters,
  }) {
    _ensureConfigured();
    return dio.get(path, queryParameters: queryParameters);
  }

  Future<Response<dynamic>> post(String path, {Object? data}) {
    _ensureConfigured();
    return dio.post(path, data: data);
  }

  void _ensureConfigured() {
    if (isConfigured) return;
    throw const CyrloMapsApiUnavailableException(
      capability: 'request',
      reason:
          'Cyrlo Maps API is not configured. Set baseUrl to '
          'https://api.cyrlomap.eqostack.com and pass the Ride maps API key '
          '(from the Ride server secret), not MAPBOX_ACCESS_TOKEN.',
    );
  }

  static String _normalizeBase(String raw) {
    final trimmed = raw.trim();
    if (trimmed.isEmpty) return trimmed;
    return trimmed.endsWith('/')
        ? trimmed.substring(0, trimmed.length - 1)
        : trimmed;
  }
}

class CyrloMapsApiUnavailableException implements Exception {
  const CyrloMapsApiUnavailableException({
    required this.capability,
    required this.reason,
  });

  final String capability;
  final String reason;

  @override
  String toString() =>
      'CyrloMapsApiUnavailableException($capability): $reason';
}
