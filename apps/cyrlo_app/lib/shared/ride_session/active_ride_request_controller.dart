import 'dart:async';

import 'package:flutter_riverpod/flutter_riverpod.dart';

import '../../features/auth/application/auth_session.dart';
import '../../features/auth/application/signup_controller.dart';
import '../../features/auth/application/signup_draft.dart';
import '../../features/bookings/data/booking_models.dart';
import '../../passenger_app/home/domain/nearby_rider.dart';
import '../../rider_app/availability/application/rider_availability_provider.dart';
import '../../rider_app/ops/rider_ops_api.dart';
import '../models/geo_point.dart';
import 'active_ride_request.dart';

final activeRideRequestProvider =
    NotifierProvider<ActiveRideRequestController, ActiveRideRequest?>(
  ActiveRideRequestController.new,
);

class ActiveRideRequestController extends Notifier<ActiveRideRequest?> {
  @override
  ActiveRideRequest? build() => null;

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

  void adoptBooking(Booking booking, {ActiveRideStatus? status}) {
    state = ActiveRideRequest.fromBooking(
      booking,
      status: status ??
          (booking.isAccepted || booking.isInProgress
              ? ActiveRideStatus.ongoing
              : ActiveRideStatus.requested),
    );
  }

  void accept(ActiveRideRequest job) {
    state = job.copyWith(status: ActiveRideStatus.ongoing);
  }

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

/// Pending pickup offers on the rider Jobs tab (polled from matching API).
final riderJobOffersProvider =
    NotifierProvider<RiderJobOffersController, List<ActiveRideRequest>>(
  RiderJobOffersController.new,
);

class RiderJobOffersController extends Notifier<List<ActiveRideRequest>> {
  Timer? _poll;

  @override
  List<ActiveRideRequest> build() {
    final draft = ref.watch(signupProvider);
    final online = ref.watch(riderOnlineProvider);
    ref.onDispose(() {
      _poll?.cancel();
      _poll = null;
    });

    if (draft.role != RideRole.rider || !online) {
      _poll?.cancel();
      _poll = null;
      return const [];
    }

    _poll ??= Timer.periodic(const Duration(seconds: 8), (_) {
      unawaited(refresh());
    });
    Future.microtask(refresh);
    return const [];
  }

  Future<void> refresh() async {
    final session = ref.read(authSessionProvider);
    final online = ref.read(riderOnlineProvider);
    if (session == null || !online) {
      state = const [];
      return;
    }
    try {
      final offers =
          await ref.read(riderOpsApiProvider).listOffers(session.accessToken);
      state = [
        for (final offer in offers)
          if (offer.status == 'PENDING')
            ActiveRideRequest.fromMatchingOffer(offer),
      ];
    } catch (_) {
      // Keep last known offers on transient failures.
    }
  }

  Future<void> decline(String id) async {
    final session = ref.read(authSessionProvider);
    final preview = ref.read(previewRiderJobProvider);
    if (preview?.id == id) {
      ref.read(previewRiderJobProvider.notifier).clear();
    }
    if (session != null) {
      try {
        await ref.read(riderOpsApiProvider).rejectOffer(
              accessToken: session.accessToken,
              offerId: id,
            );
      } catch (_) {}
    }
    state = [
      for (final job in state)
        if (job.id != id) job,
    ];
  }

  /// Accepts [id] via matching API and clears sibling local offers.
  Future<AcceptJobOutcome?> accept(String id) async {
    final session = ref.read(authSessionProvider);
    ActiveRideRequest? accepted;
    final bumped = <ActiveRideRequest>[];
    for (final job in state) {
      if (job.id == id) {
        accepted = job;
      } else {
        bumped.add(job);
      }
    }
    if (accepted == null) return null;

    if (session != null) {
      final booking = await ref.read(riderOpsApiProvider).acceptOffer(
            accessToken: session.accessToken,
            offerId: id,
          );
      accepted = ActiveRideRequest.fromBooking(
        booking,
        status: ActiveRideStatus.ongoing,
        passengerPhoneE164: accepted.passengerPhoneE164,
      );
    } else {
      accepted = accepted.copyWith(status: ActiveRideStatus.ongoing);
    }

    state = const [];
    ref.read(previewRiderJobProvider.notifier).clear();
    ref.read(activeRideRequestProvider.notifier).accept(accepted);
    return AcceptJobOutcome(accepted: accepted, bumped: bumped);
  }
}

class AcceptJobOutcome {
  const AcceptJobOutcome({required this.accepted, required this.bumped});

  final ActiveRideRequest accepted;
  final List<ActiveRideRequest> bumped;
}

final previewRiderJobProvider =
    NotifierProvider<PreviewRiderJobController, ActiveRideRequest?>(
  PreviewRiderJobController.new,
);

class PreviewRiderJobController extends Notifier<ActiveRideRequest?> {
  @override
  ActiveRideRequest? build() => null;

  void preview(ActiveRideRequest job) => state = job;

  void select(ActiveRideRequest job) => state = job;

  void clear() => state = null;
}
