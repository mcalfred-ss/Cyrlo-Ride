import 'package:cyrlo_app/rider_app/eligibility/rider_eligibility_api.dart';
import 'package:cyrlo_app/rider_app/eligibility/rider_eligibility_provider.dart';
import 'package:flutter_test/flutter_test.dart';

void main() {
  test('parses eligibility and zone approval reason', () {
    final eligibility = RiderEligibility.fromJson({
      'riderId': 'r1',
      'eligible': false,
      'reasons': ['NO_APPROVED_ACTIVE_ZONE', 'NOT_ONLINE'],
      'verificationEligible': true,
      'onActiveTrip': false,
      'gpsFresh': true,
    });
    expect(eligibility.hasApprovedActiveZone, isFalse);
    expect(eligibility.hasLocationIssue, isFalse);
    expect(
      riderZoneStatusMessage(eligibility),
      contains('not approved for an active service zone'),
    );
  });

  test('explains GPS issues without claiming eligibility', () {
    final eligibility = RiderEligibility.fromJson({
      'riderId': 'r1',
      'eligible': false,
      'reasons': ['GPS_NOT_FRESH'],
      'verificationEligible': true,
      'onActiveTrip': false,
      'gpsFresh': false,
    });
    expect(eligibility.hasLocationIssue, isTrue);
    expect(
      riderZoneStatusMessage(eligibility),
      contains('GPS alone does not make you eligible'),
    );
  });
}
