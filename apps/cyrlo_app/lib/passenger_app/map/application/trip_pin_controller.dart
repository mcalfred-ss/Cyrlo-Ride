import 'package:flutter_riverpod/flutter_riverpod.dart';

import '../../../core/mapping/device_location_gateway.dart';
import '../../../core/mapping/mapping_providers.dart';
import '../../../shared/models/geo_point.dart';
import 'trip_pin_state.dart';

/// Owns pickup selection so a rider can come to the passenger.
/// Destination and trip fare stay off-app.
class TripPinController extends Notifier<TripPinState> {
  @override
  TripPinState build() => const TripPinState();

  DeviceLocationGateway get _location =>
      ref.read(deviceLocationGatewayProvider);

  Future<void> placeAt(GeoPoint point) async {
    if (!point.isValid) return;
    state = state.copyWith(
      pickup: point,
      clearLocationMessage: true,
    );
  }

  void clearPickup() {
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
        state = state.copyWith(
          pickup: result.point!,
          isResolvingLocation: false,
          locationMessage: 'Pickup set to your current location.',
        );
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
}

final tripPinProvider =
    NotifierProvider<TripPinController, TripPinState>(TripPinController.new);
