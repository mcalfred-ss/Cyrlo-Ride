import 'package:cyrlo_app/passenger_app/home/data/nearby_riders_api.dart';
import 'package:cyrlo_app/features/auth/application/signup_draft.dart';
import 'package:flutter_test/flutter_test.dart';

void main() {
  test('nearby discovery parses approximate riders and drops invalid points', () {
    final result = NearbyDiscoveryResult.fromJson({
      'inServiceArea': true,
      'serviceZoneId': 'zone-1',
      'radiusMeters': 5000,
      'freshnessWindowSeconds': 30,
      'riders': [
        {
          'id': 'rider-1',
          'displayName': 'Kwame',
          'vehicleCategory': 'PRAGYA',
          'etaMinutes': 4,
          'approximate': {'latitude': 6.69, 'longitude': -1.62},
          'available': true,
        },
        {
          'id': 'bad',
          'displayName': 'Nope',
          'vehicleCategory': 'OKADA',
          'etaMinutes': 2,
          'approximate': {'latitude': 200, 'longitude': 0},
          'available': true,
        },
      ],
    });

    expect(result.inServiceArea, isTrue);
    expect(result.riders, hasLength(1));
    expect(result.riders.single.id, 'rider-1');
    expect(result.riders.single.kind, DriverKind.pragya);
    expect(result.riders.single.phoneE164, isNull);
    expect(result.riders.single.point.latitude, 6.69);
  });

  test('outside service area returns empty riders without inventing supply', () {
    final result = NearbyDiscoveryResult.fromJson({
      'inServiceArea': false,
      'serviceZoneId': null,
      'riders': [],
    });
    expect(result.inServiceArea, isFalse);
    expect(result.riders, isEmpty);
  });
}
