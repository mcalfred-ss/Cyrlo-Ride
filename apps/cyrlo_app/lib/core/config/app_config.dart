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
}
