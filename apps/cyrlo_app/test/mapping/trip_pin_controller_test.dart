import 'package:cyrlo_app/core/mapping/device_location_gateway.dart';
import 'package:cyrlo_app/core/mapping/mapping_providers.dart';
import 'package:cyrlo_app/core/mapping/place_lookup_gateway.dart';
import 'package:cyrlo_app/core/mapping/resolved_location.dart';
import 'package:cyrlo_app/passenger_app/map/application/trip_pin_controller.dart';
import 'package:cyrlo_app/shared/models/geo_point.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:flutter_test/flutter_test.dart';

class _FakePlaces implements PlaceLookupGateway {
  PlaceLookupHit? reverseResult;
  ResolvedLocation? resolveResult;

  @override
  Future<List<PlaceLookupHit>> search(String query, {GeoPoint? bias}) async =>
      const [];

  @override
  Future<List<PlaceLookupHit>> forward(String query) async => const [];

  @override
  Future<PlaceLookupHit?> reverse(GeoPoint point) async => reverseResult;

  @override
  Future<ResolvedLocation?> resolve(
    GeoPoint point, {
    int landmarkLimit = 5,
  }) async =>
      resolveResult;
}

void main() {
  late FakeDeviceLocationGateway location;
  late _FakePlaces places;
  late ProviderContainer container;

  setUp(() {
    location = FakeDeviceLocationGateway(
      const DeviceLocationResult.fix(
        GeoPoint(latitude: 6.6885, longitude: -1.6244),
      ),
    );
    places = _FakePlaces()
      ..resolveResult = const ResolvedLocation(
        formattedAddress: 'Kumasi, Ashanti Region, Ghana',
        city: 'Kumasi',
        region: 'Ashanti Region',
        country: 'Ghana',
        point: GeoPoint(latitude: 6.6885, longitude: -1.6244),
        source: 'partial',
        confidence: 'approximate',
        approximate: true,
      );
    container = ProviderContainer(
      overrides: [
        deviceLocationGatewayProvider.overrideWithValue(location),
        placeLookupGatewayProvider.overrideWithValue(places),
      ],
    );
  });

  tearDown(() => container.dispose());

  test('map tap sets pickup and resolves a shaped label', () async {
    final controller = container.read(tripPinProvider.notifier);
    await controller.placeAt(const GeoPoint(latitude: 6.69, longitude: -1.62));

    final state = container.read(tripPinProvider);
    expect(state.pickup, const GeoPoint(latitude: 6.69, longitude: -1.62));
    expect(state.pickupLabel, 'Kumasi, Ashanti Region');
    expect(state.approximateLocation, isTrue);
    expect(state.hasPickup, isTrue);
  });

  test('resolved Ahenema label keeps pickup coordinates unchanged', () async {
    places.resolveResult = ResolvedLocation(
      formattedAddress:
          'Ahenema Kokoben, Atwima Kwanwoma, Ashanti Region, Ghana',
      locality: 'Ahenema Kokoben',
      district: 'Atwima Kwanwoma',
      region: 'Ashanti Region',
      country: 'Ghana',
      point: const GeoPoint(latitude: 6.6295, longitude: -1.6615),
      source: 'provider+catalogue',
      confidence: 'high',
      approximate: false,
      nearbyLandmarks: const [
        NearbyLandmarkRef(
          name: 'Santasi Roundabout',
          category: 'landmark',
          point: GeoPoint(latitude: 6.6723, longitude: -1.6411),
          distanceMeters: 5200,
          source: 'verified-catalog',
        ),
      ],
    );

    final controller = container.read(tripPinProvider.notifier);
    const pin = GeoPoint(latitude: 6.6295, longitude: -1.6615);
    await controller.placeAt(pin);

    final state = container.read(tripPinProvider);
    expect(state.pickup, pin);
    expect(state.pickupLabel, contains('Ahenema Kokoben'));
    expect(state.nearbyLandmarks, isNotEmpty);
    expect(state.nearbyLandmarks.first.name, 'Santasi Roundabout');
  });

  test('another tap updates pickup without destination', () async {
    final controller = container.read(tripPinProvider.notifier);
    await controller.placeAt(const GeoPoint(latitude: 6.69, longitude: -1.62));
    places.resolveResult = const ResolvedLocation(
      formattedAddress: 'Adum, Kumasi, Ashanti Region, Ghana',
      locality: 'Adum',
      city: 'Kumasi',
      region: 'Ashanti Region',
      country: 'Ghana',
      point: GeoPoint(latitude: 6.70, longitude: -1.63),
      source: 'provider',
      confidence: 'high',
      approximate: false,
    );
    await controller.placeAt(const GeoPoint(latitude: 6.70, longitude: -1.63));

    final state = container.read(tripPinProvider);
    expect(state.pickup, const GeoPoint(latitude: 6.70, longitude: -1.63));
    expect(state.pickupLabel, 'Adum, Kumasi, Ashanti Region');
  });

  test('denied location leaves a message and does not invent a pickup', () async {
    location.result = const DeviceLocationResult.denied();
    final controller = container.read(tripPinProvider.notifier);
    await controller.useCurrentLocationAsPickup();

    final state = container.read(tripPinProvider);
    expect(state.pickup, isNull);
    expect(state.locationMessage, contains('permission'));
  });

  test('disabled location services leave a message', () async {
    location.result = const DeviceLocationResult.serviceDisabled();
    final controller = container.read(tripPinProvider.notifier);
    await controller.useCurrentLocationAsPickup();

    final state = container.read(tripPinProvider);
    expect(state.pickup, isNull);
    expect(state.locationMessage, contains('Location services'));
  });

  test('clear resets pickup', () async {
    final controller = container.read(tripPinProvider.notifier);
    await controller.placeAt(const GeoPoint(latitude: 6.69, longitude: -1.62));
    controller.clearPickup();
    expect(container.read(tripPinProvider).pickup, isNull);
  });
}
