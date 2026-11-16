import 'package:flutter_riverpod/flutter_riverpod.dart';

import '../../home/application/nearby_riders_provider.dart';
import 'trip_pin_controller.dart';
import 'trip_pin_state.dart';

/// Passenger-facing service coverage derived from backend nearby discovery.
///
/// Map extent ≠ service availability. Backend `inServiceArea` is the truth.
enum ServiceCoverageStatus {
  /// No usable pickup yet (GPS denied/unavailable or pin not set).
  locationUnavailable,

  /// Waiting for the first backend coverage probe.
  checking,

  /// Pickup is inside an active service zone (backend).
  serviceAvailable,

  /// Pickup resolved, but outside any active service zone (backend).
  outsideServiceArea,
}

class ServiceCoverageState {
  const ServiceCoverageState({
    required this.status,
    required this.title,
    required this.message,
    this.serviceZoneId,
    this.pickupLabel,
  });

  final ServiceCoverageStatus status;
  final String title;
  final String message;
  final String? serviceZoneId;
  final String? pickupLabel;

  bool get canBook => status == ServiceCoverageStatus.serviceAvailable;
}

ServiceCoverageState resolveServiceCoverage({
  required TripPinState pins,
  required NearbyRidersState nearby,
}) {
  if (pins.isResolvingLocation) {
    return ServiceCoverageState(
      status: ServiceCoverageStatus.checking,
      title: 'Checking location',
      message: 'Reading your GPS fix…',
      pickupLabel: pins.pickupLabel,
    );
  }

  final pickup = pins.pickup;
  if (pickup == null || !pickup.isValid) {
    final locationMessage = pins.locationMessage;
    return ServiceCoverageState(
      status: ServiceCoverageStatus.locationUnavailable,
      title: 'Location unavailable',
      message: locationMessage ??
          'Set a pickup with My location or by tapping the map.',
      pickupLabel: pins.pickupLabel,
    );
  }

  if (nearby.isLoading && nearby.items.isEmpty && nearby.errorMessage == null) {
    return ServiceCoverageState(
      status: ServiceCoverageStatus.checking,
      title: 'Checking service area',
      message: 'Confirming whether Cyrlo Ride covers this pickup…',
      pickupLabel: pins.pickupLabel,
    );
  }

  if (nearby.errorMessage != null &&
      nearby.items.isEmpty &&
      nearby.message == null) {
    return ServiceCoverageState(
      status: ServiceCoverageStatus.checking,
      title: 'Checking service area',
      message: nearby.errorMessage!,
      pickupLabel: pins.pickupLabel,
    );
  }

  if (!nearby.inServiceArea) {
    return ServiceCoverageState(
      status: ServiceCoverageStatus.outsideServiceArea,
      title: 'Outside service area',
      message:
          'This pickup is outside Cyrlo Ride’s active service zones. '
          'Exploring Greater Kumasi on the map does not mean service is available.',
      serviceZoneId: nearby.serviceZoneId,
      pickupLabel: pins.pickupLabel,
    );
  }

  return ServiceCoverageState(
    status: ServiceCoverageStatus.serviceAvailable,
    title: 'Service available',
    message: nearby.message ??
        'This pickup is inside an active service zone.',
    serviceZoneId: nearby.serviceZoneId,
    pickupLabel: pins.pickupLabel,
  );
}

final serviceCoverageProvider = Provider<ServiceCoverageState>((ref) {
  return resolveServiceCoverage(
    pins: ref.watch(tripPinProvider),
    nearby: ref.watch(nearbyRidersProvider),
  );
});
