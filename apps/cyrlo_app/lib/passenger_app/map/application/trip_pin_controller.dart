import 'package:flutter_riverpod/flutter_riverpod.dart';

import '../../../core/mapping/device_location_gateway.dart';
import '../../../core/mapping/mapping_providers.dart';
import '../../../core/mapping/route_preview_gateway.dart';
import '../../../shared/models/geo_point.dart';
import 'trip_pin_state.dart';

/// Owns pickup and destination selection. Does not create bookings or call Paystack.
class TripPinController extends Notifier<TripPinState> {
  @override
  TripPinState build() => const TripPinState();

  DeviceLocationGateway get _location =>
      ref.read(deviceLocationGatewayProvider);

  RoutePreviewGateway get _routes => ref.read(routePreviewGatewayProvider);

  void setFocus(TripPinFocus focus) {
    state = state.copyWith(focus: focus, clearLocationMessage: true);
  }

  Future<void> placeAt(GeoPoint point) async {
    if (!point.isValid) return;
    if (state.focus == TripPinFocus.pickup) {
      state = state.copyWith(
        pickup: point,
        focus: TripPinFocus.destination,
        clearRoute: true,
        clearRouteError: true,
        clearLocationMessage: true,
      );
    } else {
      state = state.copyWith(
        destination: point,
        clearRoute: true,
        clearRouteError: true,
        clearLocationMessage: true,
      );
    }
    if (state.hasBothPins) {
      await _refreshRoute();
    }
  }

  void clearPins() {
    state = const TripPinState();
  }

  Future<void> useCurrentLocationAsPickup() async {
    state = state.copyWith(
      isResolvingLocation: true,
      clearLocationMessage: true,
    );
    final result = await _location.current();
    switch (result.status) {
      case DeviceLocationStatus.fix:
        final point = result.point!;
        state = state.copyWith(
          pickup: point,
          focus: TripPinFocus.destination,
          isResolvingLocation: false,
          clearRoute: true,
          clearRouteError: true,
          locationMessage: 'Pickup set to your current location.',
        );
        if (state.hasBothPins) {
          await _refreshRoute();
        }
      case DeviceLocationStatus.denied:
        state = state.copyWith(
          isResolvingLocation: false,
          locationMessage:
              'Location permission was denied. Enable it in settings, or tap the map.',
        );
      case DeviceLocationStatus.serviceDisabled:
        state = state.copyWith(
          isResolvingLocation: false,
          locationMessage:
              'Location services are off. Turn them on, or tap the map.',
        );
      case DeviceLocationStatus.unavailable:
        state = state.copyWith(
          isResolvingLocation: false,
          locationMessage: 'Could not read a GPS fix. Tap the map instead.',
        );
    }
  }

  Future<void> _refreshRoute() async {
    final pickup = state.pickup;
    final destination = state.destination;
    if (pickup == null || destination == null) return;

    state = state.copyWith(
      isResolvingRoute: true,
      clearRouteError: true,
      clearRoute: true,
    );
    try {
      final preview = await _routes.preview(from: pickup, to: destination);
      state = state.copyWith(
        routePoints: preview.points,
        isResolvingRoute: false,
        clearRouteError: true,
      );
    } on RoutePreviewException catch (error) {
      state = state.copyWith(
        isResolvingRoute: false,
        clearRoute: true,
        routeError: error.message,
      );
    }
  }
}

final tripPinProvider =
    NotifierProvider<TripPinController, TripPinState>(TripPinController.new);
