import 'package:flutter_riverpod/flutter_riverpod.dart';

import '../../../core/errors/api_exception.dart';
import '../../../core/mapping/device_location_gateway.dart';
import '../../../core/mapping/mapping_providers.dart';
import '../../../shared/models/geo_point.dart';
import 'trip_pin_controller.dart';

enum TripPlanPhase {
  initial,
  gettingLocation,
  pickupSelected,
  submittingBooking,
  searchingRider,
  riderAssigned,
  awaitingConnectionFee,
  serviceUnavailable,
  error,
}

/// Pickup-only trip plan. Destination / route are not part of Cyrlo's booking flow.
class PassengerTripPlanState {
  const PassengerTripPlanState({
    this.phase = TripPlanPhase.initial,
    this.pickup,
    this.pickupLabel,
    this.message,
    this.isSubmitting = false,
    this.connectionFeeNote =
        'Cyrlo charges GH₵1 connection fee when a rider accepts. Transport fare is agreed with your rider.',
  });

  final TripPlanPhase phase;
  final GeoPoint? pickup;
  final String? pickupLabel;
  final String? message;
  final bool isSubmitting;
  final String connectionFeeNote;

  bool get hasPickup => pickup != null && pickup!.isValid;
  bool get canFindRider =>
      hasPickup && !isSubmitting && phase != TripPlanPhase.submittingBooking;

  PassengerTripPlanState copyWith({
    TripPlanPhase? phase,
    GeoPoint? pickup,
    String? pickupLabel,
    String? message,
    bool? isSubmitting,
    String? connectionFeeNote,
    bool clearPickup = false,
    bool clearMessage = false,
  }) {
    return PassengerTripPlanState(
      phase: phase ?? this.phase,
      pickup: clearPickup ? null : (pickup ?? this.pickup),
      pickupLabel: clearPickup ? null : (pickupLabel ?? this.pickupLabel),
      message: clearMessage ? null : (message ?? this.message),
      isSubmitting: isSubmitting ?? this.isSubmitting,
      connectionFeeNote: connectionFeeNote ?? this.connectionFeeNote,
    );
  }
}

class PassengerTripPlanController extends Notifier<PassengerTripPlanState> {
  @override
  PassengerTripPlanState build() => const PassengerTripPlanState();

  Future<void> useCurrentLocationAsPickup() async {
    state = state.copyWith(
      phase: TripPlanPhase.gettingLocation,
      clearMessage: true,
    );
    final result = await ref.read(deviceLocationGatewayProvider).current();
    switch (result.status) {
      case DeviceLocationStatus.fix:
        await _applyPickup(result.point!, preferLabel: 'Current location');
      case DeviceLocationStatus.denied:
        state = state.copyWith(
          phase: state.hasPickup
              ? TripPlanPhase.pickupSelected
              : TripPlanPhase.initial,
          message:
              'Location permission was denied. Enable it in settings, or tap the map.',
        );
      case DeviceLocationStatus.serviceDisabled:
        state = state.copyWith(
          phase: state.hasPickup
              ? TripPlanPhase.pickupSelected
              : TripPlanPhase.initial,
          message: 'Location services are off. Turn them on, or tap the map.',
        );
      case DeviceLocationStatus.unavailable:
        state = state.copyWith(
          phase: state.hasPickup
              ? TripPlanPhase.pickupSelected
              : TripPlanPhase.initial,
          message: 'Could not read a GPS fix. Tap the map instead.',
        );
    }
  }

  Future<void> placeMapPoint(GeoPoint point) async {
    if (!point.isValid) return;
    await _applyPickup(point, preferLabel: 'Pinned pickup');
  }

  Future<void> _applyPickup(GeoPoint point, {String? preferLabel}) async {
    final label = await _reverseLabel(point) ?? preferLabel ?? _coordLabel(point);
    ref.read(tripPinProvider.notifier).seedPickup(point);
    state = state.copyWith(
      phase: TripPlanPhase.pickupSelected,
      pickup: point,
      pickupLabel: label,
      clearMessage: true,
    );
  }

  bool beginSubmit() {
    if (!state.canFindRider) return false;
    state = state.copyWith(
      phase: TripPlanPhase.submittingBooking,
      isSubmitting: true,
      clearMessage: true,
    );
    return true;
  }

  void markSearchingRider() {
    state = state.copyWith(
      phase: TripPlanPhase.searchingRider,
      isSubmitting: false,
      clearMessage: true,
    );
  }

  void markRiderAssigned({required bool needsConnectionFee}) {
    state = state.copyWith(
      phase: needsConnectionFee
          ? TripPlanPhase.awaitingConnectionFee
          : TripPlanPhase.riderAssigned,
      isSubmitting: false,
      clearMessage: true,
    );
  }

  void markServiceUnavailable(String message) {
    state = state.copyWith(
      phase: TripPlanPhase.serviceUnavailable,
      isSubmitting: false,
      message: message,
    );
  }

  void markSubmitError(String message) {
    state = state.copyWith(
      phase: state.hasPickup ? TripPlanPhase.pickupSelected : TripPlanPhase.error,
      isSubmitting: false,
      message: message,
    );
  }

  void clearSubmitLock() {
    if (!state.isSubmitting) return;
    state = state.copyWith(
      isSubmitting: false,
      phase: state.hasPickup
          ? TripPlanPhase.pickupSelected
          : TripPlanPhase.initial,
    );
  }

  Future<String?> _reverseLabel(GeoPoint point) async {
    try {
      final hit = await ref.read(placeLookupGatewayProvider).reverse(point);
      if (hit == null) return null;
      final address = hit.address?.trim();
      if (address != null && address.isNotEmpty) return address;
      final label = hit.label.trim();
      return label.isEmpty ? null : label;
    } catch (_) {
      return null;
    }
  }

  String _coordLabel(GeoPoint point) =>
      '${point.latitude.toStringAsFixed(5)}, ${point.longitude.toStringAsFixed(5)}';
}

/// Maps API / booking errors that mean the pickup is outside coverage.
bool isServiceAreaRejection(Object error) {
  if (error is! ApiException) return false;
  final message = error.message.toLowerCase();
  return message.contains('outside the active service area') ||
      message.contains('service area') ||
      message.contains('no active service');
}

final passengerTripPlanProvider =
    NotifierProvider<PassengerTripPlanController, PassengerTripPlanState>(
  PassengerTripPlanController.new,
);
