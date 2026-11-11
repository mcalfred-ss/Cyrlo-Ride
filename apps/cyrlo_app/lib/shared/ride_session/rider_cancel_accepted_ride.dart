import 'package:flutter_riverpod/flutter_riverpod.dart';

import '../../features/auth/application/auth_session.dart';
import '../../features/bookings/data/bookings_api.dart';
import '../../passenger_app/home/application/nearby_riders_provider.dart';
import '../../passenger_app/home/application/passenger_notifications_provider.dart';
import '../../passenger_app/home/domain/passenger_notification.dart';
import '../../passenger_app/map/application/trip_pin_controller.dart';
import '../../passenger_app/rides/application/passenger_rides_provider.dart';
import '../../passenger_app/rides/domain/passenger_ride.dart';
import 'active_ride_request.dart';
import 'active_ride_request_controller.dart';
import 'passenger_cancel_notice.dart';

class RiderCancelAcceptedResult {
  const RiderCancelAcceptedResult({
    required this.cancelled,
    required this.passengerNotified,
    this.passengerFirstName,
  });

  final bool cancelled;

  /// True once the server recorded the cancellation (and queued notices).
  final bool passengerNotified;
  final String? passengerFirstName;
}

/// Ends an accepted pickup via API, then clears the live session.
Future<RiderCancelAcceptedResult> cancelAcceptedRideByRider(
  WidgetRef ref,
) async {
  final job = ref.read(activeRideRequestProvider);
  if (job == null || !job.isAccepted) {
    return const RiderCancelAcceptedResult(
      cancelled: false,
      passengerNotified: false,
    );
  }

  // The server queues the passenger's in-app, push and SMS notices when it
  // records the cancellation, so no client-side SMS is attempted.
  var serverConfirmed = false;
  final session = ref.read(authSessionProvider);
  if (session != null) {
    try {
      await ref.read(bookingsApiProvider).riderCancel(
            accessToken: session.accessToken,
            bookingId: job.resolvedBookingId,
            reason: 'Rider cancelled after accept',
          );
      serverConfirmed = true;
    } catch (_) {
      // Continue local cleanup.
    }
  }

  ref.read(passengerNotificationsProvider.notifier).prepend(
        PassengerNotification(
          id: 'notif-cancel-${job.id}',
          kind: PassengerNotificationKind.rideUpdate,
          title: 'Rider cancelled your pickup',
          body:
              'Your ${job.kindLabel} rider cancelled. Request another nearby rider when you’re ready.',
          createdAt: DateTime.now(),
          action: PassengerNotificationAction.home,
          vehicleKind: job.kind,
        ),
      );

  ref.read(passengerRidesProvider.notifier).prepend(
        PassengerRide(
          id: job.resolvedBookingId,
          kind: job.kind,
          status: PassengerRideStatus.cancelled,
          pickupLabel: _pickupLabel(job),
          occurredAt: DateTime.now(),
          durationLabel: 'Cancelled by rider',
        ),
      );

  ref.read(passengerCancelNoticeProvider.notifier).set(
        PassengerCancelNotice(
          title: 'Rider cancelled',
          body:
              'Your ${job.kindLabel} rider cancelled the pickup. Request another rider when you’re ready.',
        ),
      );

  ref.read(activeRideRequestProvider.notifier).markCancelled();
  ref.read(selectedNearbyRiderProvider.notifier).clear();
  ref.read(previewRiderJobProvider.notifier).clear();
  ref.read(tripPinProvider.notifier).forceClear();

  return RiderCancelAcceptedResult(
    cancelled: true,
    passengerNotified: serverConfirmed,
    passengerFirstName: job.displayFirstName,
  );
}

String _pickupLabel(ActiveRideRequest job) {
  final point = job.pickupPoint;
  if (point == null) return 'Shared pickup';
  return 'Pickup (${point.latitude.toStringAsFixed(4)}, ${point.longitude.toStringAsFixed(4)})';
}
