import 'dart:async';

import 'package:flutter_riverpod/flutter_riverpod.dart';

import '../../../features/auth/application/auth_session.dart';
import '../../../features/auth/application/signup_controller.dart';
import '../../../features/auth/application/signup_draft.dart';
import '../../../features/bookings/data/bookings_api.dart';
import '../../../shared/providers/core_providers.dart';
import '../../../shared/ride_session/active_ride_request.dart';
import '../../../shared/ride_session/active_ride_request_controller.dart';
import 'passenger_trip_plan.dart';
import 'trip_pin_controller.dart';

/// Restores SEARCHING / ACCEPTED / IN_PROGRESS bookings after refresh.
/// Polls matching status while SEARCHING so assignment survives Socket.IO gaps.
final passengerBookingRecoveryProvider =
    NotifierProvider<PassengerBookingRecovery, void>(
  PassengerBookingRecovery.new,
);

class PassengerBookingRecovery extends Notifier<void> {
  Timer? _statusPoll;
  String? _watchingBookingId;

  @override
  void build() {
    ref.onDispose(() {
      _statusPoll?.cancel();
      _statusPoll = null;
    });
    ref.listen<AuthSession?>(authSessionProvider, (previous, next) {
      if (next == null) {
        _statusPoll?.cancel();
        _watchingBookingId = null;
        return;
      }
      final draft = ref.read(signupProvider);
      if (draft.role == RideRole.passenger) {
        unawaited(restore());
      }
    });
    Future.microtask(() {
      final session = ref.read(authSessionProvider);
      final draft = ref.read(signupProvider);
      if (session != null && draft.role == RideRole.passenger) {
        unawaited(restore());
      }
    });
  }

  Future<void> restore() async {
    final session = ref.read(authSessionProvider);
    if (session == null) return;
    try {
      final page = await ref.read(bookingsApiProvider).list(
            accessToken: session.accessToken,
            pageSize: 10,
          );
      final live = [
        for (final booking in page.items)
          if (booking.isSearching ||
              booking.isAccepted ||
              booking.isInProgress)
            booking,
      ];
      if (live.isEmpty) {
        _statusPoll?.cancel();
        _watchingBookingId = null;
        return;
      }
      live.sort((a, b) => b.createdAt.compareTo(a.createdAt));
      final booking = live.first;
      final status = booking.isSearching
          ? ActiveRideStatus.requested
          : ActiveRideStatus.ongoing;
      ref.read(activeRideRequestProvider.notifier).adoptBooking(
            booking,
            status: status,
          );
      ref.read(tripPinProvider.notifier).seedPickup(booking.pickup);
      if (booking.isSearching) {
        ref.read(passengerTripPlanProvider.notifier).markSearchingRider();
        _watchSearching(booking.id);
      } else {
        ref
            .read(passengerTripPlanProvider.notifier)
            .markRiderAssigned(needsConnectionFee: booking.isAccepted);
        _statusPoll?.cancel();
        _watchingBookingId = null;
        final client = ref.read(realtimeClientProvider);
        client.subscribeBooking(booking.id);
      }
    } catch (_) {
      // Soft-fail — user can still create a new request.
    }
  }

  void refreshFromEvent(dynamic data) {
    final bookingId = data is Map ? data['bookingId'] as String? : null;
    if (bookingId == null) {
      unawaited(restore());
      return;
    }
    unawaited(_fetchAndAdopt(bookingId));
  }

  /// Start status polling for a freshly created SEARCHING booking.
  void trackSearching(String bookingId) {
    _watchSearching(bookingId);
  }

  void _watchSearching(String bookingId) {
    _watchingBookingId = bookingId;
    _statusPoll?.cancel();
    _statusPoll = Timer.periodic(const Duration(seconds: 5), (_) {
      unawaited(_pollStatus(bookingId));
    });
    unawaited(_pollStatus(bookingId));
  }

  Future<void> _pollStatus(String bookingId) async {
    if (_watchingBookingId != bookingId) return;
    final session = ref.read(authSessionProvider);
    if (session == null) return;
    try {
      final status = await ref.read(bookingsApiProvider).matchingStatus(
            accessToken: session.accessToken,
            bookingId: bookingId,
          );
      if (status.status == 'ACCEPTED' || status.status == 'IN_PROGRESS') {
        await _fetchAndAdopt(bookingId);
        return;
      }
      if (status.status == 'EXPIRED' ||
          status.status == 'CANCELLED' ||
          status.status == 'PAYMENT_FAILED') {
        _statusPoll?.cancel();
        _watchingBookingId = null;
        ref.read(activeRideRequestProvider.notifier).clear();
        ref.read(passengerTripPlanProvider.notifier).clearSubmitLock();
      }
    } catch (_) {}
  }

  Future<void> _fetchAndAdopt(String bookingId) async {
    final session = ref.read(authSessionProvider);
    if (session == null) return;
    try {
      final booking = await ref.read(bookingsApiProvider).get(
            accessToken: session.accessToken,
            bookingId: bookingId,
          );
      if (booking.isSearching) {
        ref.read(activeRideRequestProvider.notifier).adoptBooking(
              booking,
              status: ActiveRideStatus.requested,
            );
        _watchSearching(booking.id);
        return;
      }
      if (booking.isAccepted || booking.isInProgress) {
        _statusPoll?.cancel();
        _watchingBookingId = null;
        ref.read(activeRideRequestProvider.notifier).adoptBooking(
              booking,
              status: ActiveRideStatus.ongoing,
            );
        ref
            .read(passengerTripPlanProvider.notifier)
            .markRiderAssigned(needsConnectionFee: booking.isAccepted);
        ref.read(realtimeClientProvider).subscribeBooking(booking.id);
      }
    } catch (_) {}
  }
}
