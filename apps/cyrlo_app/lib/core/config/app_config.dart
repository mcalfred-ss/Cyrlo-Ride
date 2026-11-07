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

  /// Base URL for the future hosted Cyrlo Maps HTTP API.
  /// Default is empty so the app does not call an undeployed service.
  /// When the OpenAPI contract lands, pass
  /// `--dart-define=CYRLO_MAPS_API_BASE_URL=https://api.cyrlomap.eqostack.com/v1`.
  static const cyrloMapsApiBaseUrl = String.fromEnvironment(
    'CYRLO_MAPS_API_BASE_URL',
    defaultValue: '',
  );

  /// Optional bearer for the future Maps API. Empty until the contract defines auth.
  static const cyrloMapsApiToken = String.fromEnvironment(
    'CYRLO_MAPS_API_TOKEN',
    defaultValue: '',
  );
}
