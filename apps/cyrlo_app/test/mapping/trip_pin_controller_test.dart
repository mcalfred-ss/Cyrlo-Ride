import 'package:cyrlo_app/core/mapping/device_location_gateway.dart';
import 'package:cyrlo_app/core/mapping/mapping_providers.dart';
import 'package:cyrlo_app/passenger_app/map/application/trip_pin_controller.dart';
import 'package:cyrlo_app/shared/models/geo_point.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:flutter_test/flutter_test.dart';

void main() {
  late FakeDeviceLocationGateway location;
  late ProviderContainer container;

  setUp(() {
    location = FakeDeviceLocationGateway(
      const DeviceLocationResult.fix(
        GeoPoint(latitude: 6.6885, longitude: -1.6244),
      ),
    );
    container = ProviderContainer(
      overrides: [
        deviceLocationGatewayProvider.overrideWithValue(location),
      ],
    );
  });

  tearDown(() => container.dispose());

  test('map tap sets pickup only', () async {
    final controller = container.read(tripPinProvider.notifier);
    await controller.placeAt(const GeoPoint(latitude: 6.69, longitude: -1.62));

    final state = container.read(tripPinProvider);
    expect(state.pickup, const GeoPoint(latitude: 6.69, longitude: -1.62));
    expect(state.hasPickup, isTrue);
  });

  test('another tap updates pickup without destination', () async {
    final controller = container.read(tripPinProvider.notifier);
    await controller.placeAt(const GeoPoint(latitude: 6.69, longitude: -1.62));
    await controller.placeAt(const GeoPoint(latitude: 6.70, longitude: -1.63));

    final state = container.read(tripPinProvider);
    expect(state.pickup, const GeoPoint(latitude: 6.70, longitude: -1.63));
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
