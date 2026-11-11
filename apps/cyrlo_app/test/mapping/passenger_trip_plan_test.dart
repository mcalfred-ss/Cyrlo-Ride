import 'package:cyrlo_app/core/errors/api_exception.dart';
import 'package:cyrlo_app/core/mapping/device_location_gateway.dart';
import 'package:cyrlo_app/core/mapping/mapping_providers.dart';
import 'package:cyrlo_app/core/mapping/place_lookup_gateway.dart';
import 'package:cyrlo_app/passenger_app/map/application/passenger_trip_plan.dart';
import 'package:cyrlo_app/shared/models/geo_point.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:flutter_test/flutter_test.dart';

class _FakePlaces implements PlaceLookupGateway {
  PlaceLookupHit? reverseResult;

  @override
  Future<List<PlaceLookupHit>> search(String query, {GeoPoint? bias}) async =>
      const [];

  @override
  Future<List<PlaceLookupHit>> forward(String query) async => const [];

  @override
  Future<PlaceLookupHit?> reverse(GeoPoint point) async => reverseResult;
}

void main() {
  late FakeDeviceLocationGateway location;
  late _FakePlaces places;
  late ProviderContainer container;

  const pickup = GeoPoint(latitude: 6.6885, longitude: -1.6244);
  const otherPin = GeoPoint(latitude: 6.6900, longitude: -1.6220);

  setUp(() {
    location = FakeDeviceLocationGateway(
      const DeviceLocationResult.fix(pickup),
    );
    places = _FakePlaces()
      ..reverseResult = const PlaceLookupHit(
        label: 'Kejetia Market',
        point: pickup,
        address: 'Kejetia Market, Kumasi',
      );
    container = ProviderContainer(
      overrides: [
        deviceLocationGatewayProvider.overrideWithValue(location),
        placeLookupGatewayProvider.overrideWithValue(places),
      ],
    );
  });

  tearDown(() => container.dispose());

  PassengerTripPlanController plan() =>
      container.read(passengerTripPlanProvider.notifier);

  PassengerTripPlanState snap() => container.read(passengerTripPlanProvider);

  test('current location sets pickup and reverse-geocodes label', () async {
    await plan().useCurrentLocationAsPickup();
    expect(snap().pickup, pickup);
    expect(snap().pickupLabel, 'Kejetia Market, Kumasi');
    expect(snap().phase, TripPlanPhase.pickupSelected);
    expect(snap().canFindRider, isTrue);
  });

  test('permission denial does not invent coordinates', () async {
    location.result = const DeviceLocationResult.denied();
    await plan().useCurrentLocationAsPickup();
    expect(snap().pickup, isNull);
    expect(snap().message, contains('permission'));
    expect(snap().canFindRider, isFalse);
  });

  test('map tap places pickup and reverse-geocodes label', () async {
    places.reverseResult = const PlaceLookupHit(
      label: 'Pinned spot',
      point: pickup,
      address: 'Adum, Kumasi',
    );
    await plan().placeMapPoint(pickup);
    expect(snap().pickup, pickup);
    expect(snap().pickupLabel, 'Adum, Kumasi');
    expect(snap().phase, TripPlanPhase.pickupSelected);
  });

  test('another map tap updates pickup only', () async {
    await plan().placeMapPoint(pickup);
    places.reverseResult = const PlaceLookupHit(
      label: 'Second pin',
      point: otherPin,
      address: 'Adum Road',
    );
    await plan().placeMapPoint(otherPin);
    expect(snap().pickup, otherPin);
    expect(snap().pickupLabel, 'Adum Road');
    expect(snap().phase, TripPlanPhase.pickupSelected);
  });

  test('canFindRider requires valid pickup and unlocked submit', () async {
    expect(snap().canFindRider, isFalse);
    expect(plan().beginSubmit(), isFalse);

    await plan().placeMapPoint(pickup);
    expect(snap().canFindRider, isTrue);
    expect(plan().beginSubmit(), isTrue);
    expect(snap().canFindRider, isFalse);
    expect(plan().beginSubmit(), isFalse);
    expect(snap().isSubmitting, isTrue);
    expect(snap().phase, TripPlanPhase.submittingBooking);
  });

  test('submit error unlocks for retry and preserves pickup', () async {
    await plan().placeMapPoint(pickup);
    plan().beginSubmit();
    plan().markSubmitError('Could not start booking');
    expect(snap().isSubmitting, isFalse);
    expect(snap().phase, TripPlanPhase.pickupSelected);
    expect(snap().pickup, pickup);
    expect(snap().canFindRider, isTrue);
    expect(plan().beginSubmit(), isTrue);
  });

  test('service unavailable preserves pickup and blocks CTA label path', () async {
    await plan().placeMapPoint(pickup);
    plan().beginSubmit();
    plan().markServiceUnavailable('No active service zone covers this area.');
    expect(snap().phase, TripPlanPhase.serviceUnavailable);
    expect(snap().isSubmitting, isFalse);
    expect(snap().pickup, pickup);
    expect(snap().message, contains('No active service'));
    // Pickup remains; user can still attempt find after adjusting pin.
    expect(snap().canFindRider, isTrue);
  });

  test('markSearchingRider clears submit lock', () async {
    await plan().placeMapPoint(pickup);
    plan().beginSubmit();
    plan().markSearchingRider();
    expect(snap().phase, TripPlanPhase.searchingRider);
    expect(snap().isSubmitting, isFalse);
  });

  test('service-zone rejection helper matches backend wording', () {
    expect(
      isServiceAreaRejection(
        const ApiException(
          code: 'VALIDATION_ERROR',
          message: 'Pickup is outside the active service area.',
        ),
      ),
      isTrue,
    );
    expect(
      isServiceAreaRejection(
        const ApiException(code: 'INTERNAL_ERROR', message: 'boom'),
      ),
      isFalse,
    );
  });

  test('connection fee note distinguishes fee from transport fare', () {
    expect(snap().connectionFeeNote, contains('GH₵1'));
    expect(snap().connectionFeeNote.toLowerCase(), contains('connection'));
    expect(snap().connectionFeeNote.toLowerCase(), contains('agreed'));
  });
}
