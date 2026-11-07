import 'package:flutter_riverpod/flutter_riverpod.dart';

import '../../features/auth/application/signup_controller.dart';
import '../../features/auth/application/signup_draft.dart';
import '../../passenger_app/home/domain/nearby_rider.dart';
import 'active_ride_request.dart';

final activeRideRequestProvider =
    NotifierProvider<ActiveRideRequestController, ActiveRideRequest?>(
  ActiveRideRequestController.new,
);

class ActiveRideRequestController extends Notifier<ActiveRideRequest?> {
  @override
  ActiveRideRequest? build() => null;

  /// Starts a live request after the GHS 1 fee. Numbers stay shared until done.
  /// [contactPhoneE164] is the number riders should call (signup or alternate).
  bool startFromNearbyRider(
    NearbyRider rider, {
    required String contactPhoneE164,
  }) {
    if (!rider.available) return false;
    final draft = ref.read(signupProvider);
    final riderPhone = rider.phoneE164;
    if (contactPhoneE164.isEmpty ||
        riderPhone == null ||
        riderPhone.isEmpty) {
      return false;
    }

    state = ActiveRideRequest(
      id: 'req-${DateTime.now().millisecondsSinceEpoch}',
      kind: rider.kind,
      riderId: rider.id,
      riderPhoneE164: riderPhone,
      passengerPhoneE164: contactPhoneE164,
      status: ActiveRideStatus.ongoing,
      createdAt: DateTime.now(),
      passengerName: draft.passengerName,
      etaMinutes: rider.etaMinutes,
    );
    return true;
  }

  /// Demo job for the rider Jobs tab so contact sharing is visible there too.
  void seedDemoRiderJobIfNeeded() {
    if (state != null) return;
    final draft = ref.read(signupProvider);
    if (draft.role != RideRole.rider) return;

    state = ActiveRideRequest(
      id: 'demo-rider-job',
      kind: draft.driverKind ?? DriverKind.pragya,
      riderId: 'self',
      riderPhoneE164: draft.phoneE164 ?? '+233244000111',
      passengerPhoneE164: '+233201234567',
      status: ActiveRideStatus.ongoing,
      createdAt: DateTime.now().subtract(const Duration(minutes: 3)),
      passengerName: 'Ama Mensah',
      etaMinutes: 4,
    );
  }

  void markCompleted() {
    // Drop the session so numbers are no longer shared or retained in UI.
    state = null;
  }

  void markCancelled() {
    state = null;
  }

  void clear() => state = null;
}
