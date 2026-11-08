import 'package:cyrlo_app/core/mapping/maps_api/maps_api_client.dart';
import 'package:flutter_test/flutter_test.dart';

void main() {
  test('Maps client without api key is not configured for direct privileged calls', () {
    final client = CyrloMapsApiClient(
      baseUrl: 'https://api.cyrlomap.eqostack.com',
      apiKey: '',
    );
    expect(client.isConfigured, isFalse);
    expect(client.baseUrl, Uri.parse('https://api.cyrlomap.eqostack.com'));
  });

  test('direct Maps client can be constructed with baseUrl + apiKey for diagnostics', () {
    final client = CyrloMapsApiClient(
      baseUrl: 'https://api.cyrlomap.eqostack.com',
      apiKey: 'ride-maps-key',
    );
    expect(client.isConfigured, isTrue);
    expect(client.apiKey, 'ride-maps-key');
    expect(client.dio.options.headers['X-API-Key'], 'ride-maps-key');
  });

  test('unconfigured client refuses authenticated calls', () {
    final client = CyrloMapsApiClient(baseUrl: '', apiKey: '');
    expect(
      () => client.get('/v1/anything'),
      throwsA(isA<CyrloMapsApiUnavailableException>()),
    );
  });
}
