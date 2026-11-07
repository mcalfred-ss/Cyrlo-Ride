/// Boundary for the future hosted Cyrlo Maps HTTP API.
///
/// Intended production origin once the OpenAPI contract ships:
/// `https://api.cyrlomap.eqostack.com/v1`
///
/// No path, query, request body, response field, or auth scheme is defined
/// here. Inventing them would couple Ride to a contract that does not exist yet.
abstract class CyrloMapsApiClient {
  /// Configured base URL, or null when the dart-define is empty.
  Uri? get baseUrl;

  /// True when [baseUrl] is set. Does not mean the remote is reachable or that
  /// any endpoint is known.
  bool get isConfigured;

  /// Optional bearer from configuration. Empty until the contract defines auth.
  String get accessToken;

  /// Rejects every capability until OpenAPI methods are generated and reviewed.
  Future<Never> requireContract(String capability);
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
