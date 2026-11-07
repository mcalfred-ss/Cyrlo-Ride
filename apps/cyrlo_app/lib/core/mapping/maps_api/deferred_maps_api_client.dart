import '../../config/app_config.dart';
import 'maps_api_client.dart';

/// Development stand-in for the hosted Maps API.
///
/// Accepts a base URL from configuration but never issues HTTP calls. Once the
/// official OpenAPI contract is published, replace this class with a generated
/// or hand-written client that implements only the documented operations.
class DeferredCyrloMapsApiClient implements CyrloMapsApiClient {
  DeferredCyrloMapsApiClient({
    String? baseUrl,
    String? accessToken,
  }) : _baseUrlRaw = baseUrl ?? AppConfig.cyrloMapsApiBaseUrl,
       _accessToken = accessToken ?? AppConfig.cyrloMapsApiToken;

  final String _baseUrlRaw;
  final String _accessToken;

  @override
  Uri? get baseUrl {
    final trimmed = _baseUrlRaw.trim();
    if (trimmed.isEmpty) return null;
    return Uri.tryParse(trimmed);
  }

  @override
  bool get isConfigured => baseUrl != null;

  @override
  String get accessToken => _accessToken.trim();

  @override
  Future<Never> requireContract(String capability) async {
    final configured = isConfigured;
    throw CyrloMapsApiUnavailableException(
      capability: capability,
      reason: configured
          ? 'Cyrlo Maps API base URL is set, but the OpenAPI contract is not wired yet. No HTTP call was made.'
          : 'Cyrlo Maps API base URL is not configured. Pass CYRLO_MAPS_API_BASE_URL only after the contract is published.',
    );
  }
}
