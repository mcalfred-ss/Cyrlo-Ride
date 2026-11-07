import 'package:cyrlo_app/core/mapping/maps_api/deferred_maps_api_client.dart';
import 'package:cyrlo_app/core/mapping/maps_api/maps_api_client.dart';
import 'package:flutter_test/flutter_test.dart';

void main() {
  test('empty base URL is not configured and never invents an endpoint', () async {
    final client = DeferredCyrloMapsApiClient(baseUrl: '');
    expect(client.isConfigured, isFalse);
    expect(client.baseUrl, isNull);

    await expectLater(
      client.requireContract('geocode'),
      throwsA(
        isA<CyrloMapsApiUnavailableException>().having(
          (error) => error.capability,
          'capability',
          'geocode',
        ),
      ),
    );
  });

  test('configured base URL still refuses to call until OpenAPI is wired', () async {
    final client = DeferredCyrloMapsApiClient(
      baseUrl: 'https://api.cyrlomap.eqostack.com/v1',
      accessToken: 'not-a-secret-for-tests',
    );
    expect(client.isConfigured, isTrue);
    expect(
      client.baseUrl,
      Uri.parse('https://api.cyrlomap.eqostack.com/v1'),
    );
    expect(client.accessToken, 'not-a-secret-for-tests');

    await expectLater(
      client.requireContract('directions'),
      throwsA(
        isA<CyrloMapsApiUnavailableException>().having(
          (error) => error.reason,
          'reason',
          contains('OpenAPI contract is not wired'),
        ),
      ),
    );
  });
}
