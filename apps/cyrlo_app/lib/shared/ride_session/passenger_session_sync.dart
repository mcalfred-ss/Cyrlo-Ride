import 'dart:async';

import 'package:flutter_riverpod/flutter_riverpod.dart';

import '../../core/constants/realtime_events.dart';
import '../../features/auth/application/auth_session.dart';
import '../../features/auth/application/signup_draft.dart';
import '../../features/bookings/data/booking_models.dart';
import '../../features/bookings/data/bookings_api.dart';
import '../../passenger_app/home/application/nearby_riders_provider.dart';
import '../../passenger_app/home/application/passenger_notifications_provider.dart';
import '../../passenger_app/map/application/trip_pin_controller.dart';
import '../../passenger_app/rides/application/passenger_rides_provider.dart';
import '../../rider_app/availability/application/rider_availability_provider.dart';
import '../providers/core_providers.dart';
import 'active_ride_request.dart';
import 'active_ride_request_controller.dart';
import 'passenger_cancel_notice.dart';
import 'pending_ride_review.dart';

const _bookingPollInterval = Duration(seconds: 6);

/// Keeps the passenger's live booking in step with the server.
///
/// A booking created through the API is matched on the backend, so the app only
/// learns about acceptance, completion or cancellation by asking. This also
/// restores an in-flight booking after the app restarts.
final passengerBookingSyncProvider = Provider<void>((ref) {
  Timer? timer;
  var busy = false;
  String? restoredFor;

  bool isPassenger() =>
      ref.read(authSessionProvider)?.user.role == RideRole.passenger;

  Future<void> tick() async {
    if (busy) return;
    final session = ref.read(authSessionProvider);
    final active = ref.read(activeRideRequestProvider);
    final bookingId = active?.bookingId;
    if (session == null || active == null || bookingId == null) return;
    busy = true;
    try {
      final booking = await ref.read(bookingsApiProvider).get(
            accessToken: session.accessToken,
            bookingId: bookingId,
          );
      // The passenger may have cancelled while the request was in flight.
      if (ref.read(activeRideRequestProvider)?.bookingId != bookingId) return;
      _applyBooking(ref, active, booking);
    } catch (_) {
      // Transient network error — the next tick retries.
    } finally {
      busy = false;
    }
  }

  Future<void> restore() async {
    final session = ref.read(authSessionProvider);
    if (session == null || !isPassenger()) return;
    if (restoredFor == session.user.id) return;
    restoredFor = session.user.id;
    try {
      final page = await ref.read(bookingsApiProvider).list(
            accessToken: session.accessToken,
          );
      if (ref.read(activeRideRequestProvider) != null) return;
      for (final booking in page.items) {
        if (booking.isSearching || booking.isAccepted || booking.isInProgress) {
          ref.read(activeRideRequestProvider.notifier).adoptBooking(booking);
          break;
        }
      }
    } catch (_) {
      restoredFor = null;
    }
  }

  void arm() {
    final active = ref.read(activeRideRequestProvider);
    final shouldPoll =
        isPassenger() && active != null && active.bookingId != null;
    if (!shouldPoll) {
      timer?.cancel();
      timer = null;
      return;
    }
    timer ??= Timer.periodic(_bookingPollInterval, (_) => unawaited(tick()));
  }

  ref.onDispose(() => timer?.cancel());
  ref.listen<ActiveRideRequest?>(activeRideRequestProvider, (_, _) => arm());
  ref.listen<AuthSession?>(authSessionProvider, (previous, next) {
    if (next == null) {
      restoredFor = null;
      arm();
      return;
    }
    unawaited(restore().then((_) => arm()));
  });

  unawaited(restore().then((_) => arm()));
  arm();
});

void _applyBooking(Ref ref, ActiveRideRequest active, Booking booking) {
  final controller = ref.read(activeRideRequestProvider.notifier);

  if (booking.isSearching ||
      booking.isAccepted ||
      booking.isInProgress ||
      booking.isAwaitingPayment) {
    final nowOngoing = booking.isAccepted || booking.isInProgress;
    final changed = nowOngoing != active.isAccepted ||
        (booking.riderId ?? '') != active.riderId;
    if (changed) controller.adoptBooking(booking);
    return;
  }

  ref.read(passengerRidesProvider.notifier).upsertBooking(booking);
  ref.read(selectedNearbyRiderProvider.notifier).clear();
  ref.read(tripPinProvider.notifier).forceClear();

  if (booking.status == 'COMPLETED') {
    controller.markCompleted();
    if (!booking.isPassengerAcknowledged) {
      ref.read(pendingRideReviewProvider.notifier).set(
            PendingRideReview(
              rideId: booking.id,
              riderId: booking.riderId ?? '',
              riderDisplayName: active.riderLabel,
              kind: active.kind,
            ),
          );
    }
  } else {
    controller.markCancelled();
    ref.read(passengerCancelNoticeProvider.notifier).set(
          switch (booking.status) {
            'EXPIRED' => PassengerCancelNotice(
                title: 'No rider found',
                body:
                    'No ${active.kindLabel} rider accepted in time. Your booking fee is handled by Cyrlo — you can request again.',
              ),
            'PAYMENT_FAILED' => const PassengerCancelNotice(
                title: 'Payment failed',
                body: 'The booking fee did not go through. Try again.',
              ),
            _ => PassengerCancelNotice(
                title: 'Ride cancelled',
                body:
                    'Your ${active.kindLabel} request was cancelled. Request another ride when you’re ready.',
              ),
          },
        );
  }
  // Server-side outcome notices land in the inbox; pull them in right away.
  unawaited(ref.read(passengerNotificationsProvider.notifier).refresh());
}

/// Opens the authenticated socket and refreshes the inbox the moment the
/// server stores a notification (booking accepted, cancelled, refunds, ...).
/// Also refreshes rider offers / passenger booking sync on matching events.
final realtimeLifecycleProvider = Provider<void>((ref) {
  final client = ref.watch(realtimeClientProvider);

  void sync(AuthSession? session) {
    if (session == null) {
      client.disconnect();
      return;
    }
    client.connect(
      accessToken: session.accessToken,
      handlers: {
        RealtimeEvents.notificationCreated: (_) => unawaited(
              ref.read(passengerNotificationsProvider.notifier).refresh(),
            ),
        RealtimeEvents.matchingOfferCreated: (_) {
          if (ref.read(authSessionProvider)?.user.role != RideRole.rider) {
            return;
          }
          if (!ref.read(riderOnlineProvider)) return;
          unawaited(ref.read(riderJobOffersProvider.notifier).refresh());
        },
        RealtimeEvents.bookingAccepted: (_) {
          unawaited(ref.read(passengerNotificationsProvider.notifier).refresh());
          if (ref.read(authSessionProvider)?.user.role == RideRole.rider) {
            unawaited(ref.read(riderJobOffersProvider.notifier).refresh());
          }
        },
      },
    );
  }

  ref.listen<AuthSession?>(authSessionProvider, (previous, next) {
    // Reconnect with the fresh token; the handshake is the only auth check.
    if (previous?.accessToken == next?.accessToken) return;
    sync(next);
  });
  sync(ref.read(authSessionProvider));
});
