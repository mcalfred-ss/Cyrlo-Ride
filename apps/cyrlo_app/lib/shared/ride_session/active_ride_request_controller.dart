import 'package:flutter_riverpod/flutter_riverpod.dart';

import '../../features/auth/application/signup_controller.dart';
import '../../features/auth/application/signup_draft.dart';
import '../../passenger_app/home/domain/nearby_rider.dart';
import '../../rider_app/availability/application/rider_availability_provider.dart';
import '../models/geo_point.dart';
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
  /// [pickupPoint] is the passenger's exact GPS spot so the rider can find them.
  bool startFromNearbyRider(
    NearbyRider rider, {
    required String contactPhoneE164,
    required GeoPoint pickupPoint,
  }) {
    if (!rider.canRequest) return false;
    if (!pickupPoint.isValid) return false;
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
      riderDisplayName: rider.displayName,
      passengerName: draft.passengerName,
      passengerFirstName: draft.passengerFirstName,
      passengerGender: draft.passengerGender,
      etaMinutes: rider.etaMinutes,
      pickupPoint: pickupPoint,
    );
    return true;
  }

  void accept(ActiveRideRequest job) {
    state = job.copyWith(status: ActiveRideStatus.ongoing);
  }

  /// Keeps the rider map marker in sync when the passenger moves their pickup pin.
  void updatePickup(GeoPoint point) {
    final current = state;
    if (current == null || !point.isValid) return;
    state = current.copyWith(pickupPoint: point);
  }

  void markCompleted() {
    state = null;
  }

  void markCancelled() {
    state = null;
  }

  void clear() => state = null;
}

/// Pending pickup offers on the rider Jobs tab.
final riderJobOffersProvider =
    NotifierProvider<RiderJobOffersController, List<ActiveRideRequest>>(
  RiderJobOffersController.new,
);

class RiderJobOffersController extends Notifier<List<ActiveRideRequest>> {
  @override
  List<ActiveRideRequest> build() {
    final draft = ref.watch(signupProvider);
    final online = ref.watch(riderOnlineProvider);
    // Live offers come from matching / Socket.IO — no demo jobs.
    if (draft.role != RideRole.rider || !online) return const [];
    return const [];
  }

  void decline(String id) {
    final preview = ref.read(previewRiderJobProvider);
    if (preview?.id == id) {
      ref.read(previewRiderJobProvider.notifier).clear();
    }
    state = [
      for (final job in state)
        if (job.id != id) job,
    ];
  }

  /// Accepts [id], clears every other waiting offer, and returns those bumped
  /// siblings so the caller can SMS / notify them that the rider is busy.
  AcceptJobOutcome? accept(String id) {
    ActiveRideRequest? accepted;
    final bumped = <ActiveRideRequest>[];
    for (final job in state) {
      if (job.id == id) {
        accepted = job.copyWith(status: ActiveRideStatus.ongoing);
      } else {
        bumped.add(job);
      }
    }
    if (accepted == null) return null;
    state = const [];
    ref.read(previewRiderJobProvider.notifier).clear();
    ref.read(activeRideRequestProvider.notifier).accept(accepted);
    return AcceptJobOutcome(accepted: accepted, bumped: bumped);
  }
}

class AcceptJobOutcome {
  const AcceptJobOutcome({
    required this.accepted,
    required this.bumped,
  });

  final ActiveRideRequest accepted;
  final List<ActiveRideRequest> bumped;
}

/// Pending job the rider opened on the map before accepting.
final previewRiderJobProvider =
    NotifierProvider<PreviewRiderJobController, ActiveRideRequest?>(
  PreviewRiderJobController.new,
);

class PreviewRiderJobController extends Notifier<ActiveRideRequest?> {
  @override
  ActiveRideRequest? build() => null;

  void select(ActiveRideRequest job) => state = job;

  void clear() => state = null;
}
