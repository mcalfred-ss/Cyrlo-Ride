import 'package:flutter_riverpod/flutter_riverpod.dart';

import '../../../core/mapping/device_location_gateway.dart';
import '../../../core/mapping/location_label.dart';
import '../../../core/mapping/mapping_providers.dart';
import '../../../core/mapping/resolved_location.dart';
import '../../../shared/models/geo_point.dart';
import '../../../shared/ride_session/active_ride_request_controller.dart';
import 'trip_pin_state.dart';

/// Owns pickup selection so a rider can come to the passenger.
/// Destination and trip fare stay off-app.
///
/// GPS / map tap set coordinates. Location resolution only shapes the label and
/// never invents a community from the coordinates alone or moves the pin.
class TripPinController extends Notifier<TripPinState> {
  @override
  TripPinState build() => const TripPinState();

  DeviceLocationGateway get _location =>
      ref.read(deviceLocationGatewayProvider);

  void _syncActivePickup(GeoPoint point) {
    ref.read(activeRideRequestProvider.notifier).updatePickup(point);
  }

  /// Seeds the map pin after a request starts with a required GPS fix.
  void seedPickup(GeoPoint point, {String? message, String? label}) {
    if (!point.isValid) return;
    state = state.copyWith(
      pickup: point,
      pickupLabel: label,
      clearPickupLabel: label == null,
      clearLocationMessage: message == null,
      locationMessage: message,
      clearNearbyLandmarks: true,
      approximateLocation: isCoarseRegionLabel(label),
      isResolvingLocation: false,
      isResolvingLabel: false,
    );
  }

  Future<void> placeAt(GeoPoint point) async {
    if (!point.isValid) return;
    state = state.copyWith(
      pickup: point,
      clearPickupLabel: true,
      clearLocationMessage: true,
      clearNearbyLandmarks: true,
      approximateLocation: false,
      isResolvingLabel: true,
    );
    _syncActivePickup(point);
    final resolved = await _resolve(point, preferLabel: 'Pinned pickup');
    if (!ref.mounted) return;
    // Ignore stale reverse results if the pin moved again.
    if (state.pickup != point) return;
    state = state.copyWith(
      pickupLabel: resolved.label,
      nearbyLandmarks: resolved.landmarks,
      approximateLocation: resolved.approximate,
      isResolvingLabel: false,
    );
  }

  void clearPickup() {
    // Keep an exact spot while a request is live so the rider still has a pin.
    if (ref.read(activeRideRequestProvider)?.pickupPoint != null) return;
    state = const TripPinState();
  }

  void forceClear() {
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
          clearPickupLabel: true,
          clearNearbyLandmarks: true,
          approximateLocation: false,
          isResolvingLocation: false,
          isResolvingLabel: true,
          locationMessage: 'Pickup set to your current location.',
        );
        _syncActivePickup(point);
        final resolved =
            await _resolve(point, preferLabel: 'Current location');
        if (!ref.mounted) return;
        if (state.pickup != point) return;
        state = state.copyWith(
          pickupLabel: resolved.label,
          nearbyLandmarks: resolved.landmarks,
          approximateLocation: resolved.approximate,
          isResolvingLabel: false,
        );
      case DeviceLocationStatus.denied:
        state = state.copyWith(
          isResolvingLocation: false,
          isResolvingLabel: false,
          locationMessage:
              'Location permission was denied. Enable it in settings, or tap the map.',
        );
      case DeviceLocationStatus.serviceDisabled:
        state = state.copyWith(
          isResolvingLocation: false,
          isResolvingLabel: false,
          locationMessage:
              'Location services are off. Turn them on, or tap the map.',
        );
      case DeviceLocationStatus.unavailable:
        state = state.copyWith(
          isResolvingLocation: false,
          isResolvingLabel: false,
          locationMessage: 'Could not read a GPS fix. Tap the map instead.',
        );
    }
  }

  Future<({String label, List<NearbyLandmarkRef> landmarks, bool approximate})>
      _resolve(
    GeoPoint point, {
    required String preferLabel,
  }) async {
    try {
      final resolved =
          await ref.read(placeLookupGatewayProvider).resolve(point);
      if (resolved != null && resolved.hasAddress) {
        final label = displayResolvedLocationLabel(
          resolved,
          fallback: preferLabel,
        );
        if (label.isNotEmpty) {
          return (
            label: label,
            landmarks: resolved.nearbyLandmarks,
            approximate:
                resolved.approximate || isCoarseRegionLabel(label),
          );
        }
      }
    } catch (_) {
      // Fall through to legacy reverse label.
    }

    try {
      final hit = await ref.read(placeLookupGatewayProvider).reverse(point);
      if (hit != null) {
        final shaped = shapeLocationLabel(
          hit.address?.trim().isNotEmpty == true ? hit.address : hit.label,
          fallback: preferLabel,
        );
        if (shaped.isNotEmpty) {
          return (
            label: shaped,
            landmarks: const <NearbyLandmarkRef>[],
            approximate: isCoarseRegionLabel(shaped),
          );
        }
      }
    } catch (_) {
      // Label enrichment is best-effort; coordinates remain the source of truth.
    }
    return (
      label: preferLabel,
      landmarks: const <NearbyLandmarkRef>[],
      approximate: true,
    );
  }
}

final tripPinProvider =
    NotifierProvider<TripPinController, TripPinState>(TripPinController.new);
