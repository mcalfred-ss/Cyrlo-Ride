/// Runtime configuration supplied with --dart-define.
/// Defaults point at the hosted staging API. Override for a local backend.
abstract final class AppConfig {
  static const appName = 'Cyrlo Ride';
  static const apiBaseUrl = String.fromEnvironment(
    'API_BASE_URL',
    defaultValue: 'https://cyrloride.eqostack.com/api/v1',
  );
  static const socketUrl = String.fromEnvironment(
    'SOCKET_URL',
    defaultValue: 'https://cyrloride.eqostack.com',
  );

  /// Public Mapbox token for Cyrlo Maps *tiles* / device Directions only.
  /// Never use this as the Cyrlo Maps HTTP API key.
  static const mapboxAccessToken = String.fromEnvironment(
    'MAPBOX_ACCESS_TOKEN',
    defaultValue: '',
  );

  /// Direct hosted Cyrlo Maps HTTP API base (optional diagnostics only).
  /// Privileged geocode/search/routes go through Ride (`API_BASE_URL`) so the
  /// Maps API key never ships in the app.
  static const cyrloMapsApiBaseUrl = String.fromEnvironment(
    'CYRLO_MAPS_API_BASE_URL',
    defaultValue: 'https://api.cyrlomap.eqostack.com',
  );

  /// Must remain empty in Flutter builds. Maps auth is server-side only.
  static const cyrloMapsApiToken = String.fromEnvironment(
    'CYRLO_MAPS_API_TOKEN',
    defaultValue: '',
  );

  /// Alias kept for older call sites; prefer empty [cyrloMapsApiToken].
  static const cyrloMapsApiKey = cyrloMapsApiToken;

  /// When true, place lookup / route preview call Ride's `/maps/*` proxy.
  static const useRideMapsProxy = bool.fromEnvironment(
    'USE_RIDE_MAPS_PROXY',
    defaultValue: true,
  );

  /// Hosted legal pages on eqostack.com (store listing + in-app WebView).
  static const termsOfServiceUrl = String.fromEnvironment(
    'TERMS_OF_SERVICE_URL',
    defaultValue: 'https://eqostack.com/cyrlo/terms',
  );
  static const privacyPolicyUrl = String.fromEnvironment(
    'PRIVACY_POLICY_URL',
    defaultValue: 'https://eqostack.com/cyrlo/privacy',
  );

  static const supportEmail = String.fromEnvironment(
    'SUPPORT_EMAIL',
    defaultValue: 'eqostack@gmail.com',
  );
  static const supportWhatsAppE164 = String.fromEnvironment(
    'SUPPORT_WHATSAPP_E164',
    defaultValue: '233246304492',
  );
  static const supportWhatsAppDisplay = String.fromEnvironment(
    'SUPPORT_WHATSAPP_DISPLAY',
    defaultValue: '0246304492',
  );
}
