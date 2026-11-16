import 'package:cyrlo_app/passenger_app/home/application/nearby_riders_provider.dart';
import 'package:cyrlo_app/passenger_app/map/application/service_coverage.dart';
import 'package:cyrlo_app/passenger_app/map/application/trip_pin_state.dart';
import 'package:cyrlo_app/shared/models/geo_point.dart';
import 'package:flutter_test/flutter_test.dart';

void main() {
  const kumasi = GeoPoint(latitude: 6.6885, longitude: -1.6244);

  test('map extent is not treated as service availability', () {
    final coverage = resolveServiceCoverage(
      pins: const TripPinState(
        pickup: kumasi,
        pickupLabel: 'Kumasi, Ashanti Region',
      ),
      nearby: const NearbyRidersState(
        inServiceArea: false,
        isLoading: false,
        message: 'Outside service area',
      ),
    );
    expect(coverage.status, ServiceCoverageStatus.outsideServiceArea);
    expect(coverage.canBook, isFalse);
    expect(coverage.title, 'Outside service area');
  });

  test('service available when backend reports inServiceArea', () {
    final coverage = resolveServiceCoverage(
      pins: const TripPinState(
        pickup: GeoPoint(latitude: 6.63, longitude: -1.66),
        pickupLabel: 'Ahenema Kokoben',
      ),
      nearby: const NearbyRidersState(
        inServiceArea: true,
        serviceZoneId: 'zone-1',
        isLoading: false,
        message: 'Service available',
      ),
    );
    expect(coverage.status, ServiceCoverageStatus.serviceAvailable);
    expect(coverage.canBook, isTrue);
    expect(coverage.serviceZoneId, 'zone-1');
  });

  test('location unavailable when pickup is missing', () {
    final coverage = resolveServiceCoverage(
      pins: const TripPinState(),
      nearby: const NearbyRidersState(isLoading: false),
    );
    expect(coverage.status, ServiceCoverageStatus.locationUnavailable);
    expect(coverage.canBook, isFalse);
  });
}
