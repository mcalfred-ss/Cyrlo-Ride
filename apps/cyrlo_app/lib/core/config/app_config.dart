/// Runtime configuration supplied with --dart-define.
/// Defaults point at a local API and do not embed secrets.
abstract final class AppConfig {
  static const appName = 'Cyrlo Ride';
  static const apiBaseUrl = String.fromEnvironment(
    'API_BASE_URL',
    defaultValue: 'http://localhost:3000/api/v1',
  );
  static const socketUrl = String.fromEnvironment(
    'SOCKET_URL',
    defaultValue: 'http://localhost:3000',
  );

  /// Public Mapbox token for Cyrlo Maps tiles and device Directions.
  /// Resolved again by [MapToken] inside the SDK. Never pass an `sk.` secret.
  static const mapboxAccessToken = String.fromEnvironment(
    'MAPBOX_ACCESS_TOKEN',
    defaultValue: '',
  );

  /// Direct hosted Cyrlo Maps HTTP API base (optional diagnostics only).
  /// Privileged geocode/search/routes go through Ride (`API_BASE_URL`) so the
  /// Maps API key never ships in the app. Leave empty in production builds.
  static const cyrloMapsApiBaseUrl = String.fromEnvironment(
    'CYRLO_MAPS_API_BASE_URL',
    defaultValue: '',
  );

  /// Must remain empty in Flutter builds. Maps auth is server-side only.
  static const cyrloMapsApiToken = String.fromEnvironment(
    'CYRLO_MAPS_API_TOKEN',
    defaultValue: '',
  );

  /// When true, place lookup / route preview call Ride's `/maps/*` proxy.
  static const useRideMapsProxy = bool.fromEnvironment(
    'USE_RIDE_MAPS_PROXY',
    defaultValue: true,
  );
}
