import 'package:cyrlo_app/core/mapping/device_location_gateway.dart';
import 'package:cyrlo_app/core/mapping/mapping_providers.dart';
import 'package:cyrlo_app/core/mapping/route_preview_gateway.dart';
import 'package:cyrlo_app/passenger_app/map/application/trip_pin_controller.dart';
import 'package:cyrlo_app/passenger_app/map/application/trip_pin_state.dart';
import 'package:cyrlo_app/shared/models/geo_point.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:flutter_test/flutter_test.dart';

class _RecordingRouteGateway implements RoutePreviewGateway {
  int calls = 0;
  RoutePreview? next;
  RoutePreviewException? error;

  @override
  Future<RoutePreview> preview({
    required GeoPoint from,
    required GeoPoint to,
  }) async {
    calls += 1;
    if (error != null) throw error!;
    return next ??
        RoutePreview(
          points: [from, to],
          distanceMeters: 1000,
          durationSeconds: 120,
        );
  }
}

void main() {
  late FakeDeviceLocationGateway location;
  late _RecordingRouteGateway routes;
  late ProviderContainer container;

  setUp(() {
    location = FakeDeviceLocationGateway(
      const DeviceLocationResult.fix(
        GeoPoint(latitude: 6.6885, longitude: -1.6244),
      ),
    );
    routes = _RecordingRouteGateway();
    container = ProviderContainer(
      overrides: [
        deviceLocationGatewayProvider.overrideWithValue(location),
        routePreviewGatewayProvider.overrideWithValue(routes),
      ],
    );
  });

  tearDown(() => container.dispose());

  test('first map tap sets pickup and moves focus to destination', () async {
    final controller = container.read(tripPinProvider.notifier);
    await controller.placeAt(const GeoPoint(latitude: 6.69, longitude: -1.62));

    final state = container.read(tripPinProvider);
    expect(state.pickup, const GeoPoint(latitude: 6.69, longitude: -1.62));
    expect(state.destination, isNull);
    expect(state.focus, TripPinFocus.destination);
  });

  test('second tap sets destination and requests a route preview', () async {
    final controller = container.read(tripPinProvider.notifier);
    await controller.placeAt(const GeoPoint(latitude: 6.69, longitude: -1.62));
    await controller.placeAt(const GeoPoint(latitude: 6.70, longitude: -1.63));

    final state = container.read(tripPinProvider);
    expect(state.destination, const GeoPoint(latitude: 6.70, longitude: -1.63));
    expect(routes.calls, 1);
    expect(state.routePoints, hasLength(2));
    expect(state.routeError, isNull);
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

  test('route preview failures keep both pins and surface the error', () async {
    routes.error = const RoutePreviewException(
      code: 'unavailable',
      message: 'Route preview is not configured.',
    );
    final controller = container.read(tripPinProvider.notifier);
    await controller.placeAt(const GeoPoint(latitude: 6.69, longitude: -1.62));
    await controller.placeAt(const GeoPoint(latitude: 6.70, longitude: -1.63));

    final state = container.read(tripPinProvider);
    expect(state.hasBothPins, isTrue);
    expect(state.routePoints, isEmpty);
    expect(state.routeError, 'Route preview is not configured.');
  });

  test('clear resets selection without calling booking APIs', () async {
    final controller = container.read(tripPinProvider.notifier);
    await controller.placeAt(const GeoPoint(latitude: 6.69, longitude: -1.62));
    controller.clearPins();
    expect(container.read(tripPinProvider).pickup, isNull);
    expect(container.read(tripPinProvider).destination, isNull);
  });
}
