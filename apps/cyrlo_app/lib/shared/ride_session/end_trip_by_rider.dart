import 'package:flutter_riverpod/flutter_riverpod.dart';

import '../../passenger_app/home/application/nearby_riders_provider.dart';
import '../../passenger_app/home/application/passenger_notifications_provider.dart';
import '../../passenger_app/home/domain/passenger_notification.dart';
import '../../passenger_app/map/application/trip_pin_controller.dart';
import '../../passenger_app/rides/application/passenger_rides_provider.dart';
import '../../passenger_app/rides/domain/passenger_ride.dart';
import 'active_ride_request.dart';
import 'active_ride_request_controller.dart';
import 'pending_ride_review.dart';

class EndTripResult {
  const EndTripResult({
    required this.ended,
    this.passengerFirstName,
    this.rideId,
  });

  final bool ended;
  final String? passengerFirstName;
  final String? rideId;
}

/// Rider marks drop-off done. Clears the live session and queues passenger rating.
EndTripResult endTripByRider(WidgetRef ref) {
  final job = ref.read(activeRideRequestProvider);
  if (job == null || !job.isAccepted) {
    return const EndTripResult(ended: false);
  }

  final rideId = 'completed-${job.id}';
  final pickupLabel = _pickupLabel(job);

  ref.read(passengerRidesProvider.notifier).prepend(
        PassengerRide(
          id: rideId,
          kind: job.kind,
          status: PassengerRideStatus.completed,
          pickupLabel: pickupLabel,
          occurredAt: DateTime.now(),
          durationLabel: 'Completed',
          riderId: job.riderId,
          riderDisplayName: job.riderLabel,
          needsReview: true,
        ),
      );

  ref.read(pendingRideReviewProvider.notifier).set(
        PendingRideReview(
          rideId: rideId,
          riderId: job.riderId,
          riderDisplayName: job.riderLabel,
          kind: job.kind,
        ),
      );

  ref.read(passengerNotificationsProvider.notifier).prepend(
        PassengerNotification(
          id: 'notif-rate-$rideId',
          kind: PassengerNotificationKind.rideUpdate,
          title: 'Trip completed',
          body: 'Rate ${job.riderLabel} while the ride is fresh.',
          createdAt: DateTime.now(),
          action: PassengerNotificationAction.home,
          vehicleKind: job.kind,
        ),
      );

  ref.read(activeRideRequestProvider.notifier).markCompleted();
  ref.read(selectedNearbyRiderProvider.notifier).clear();
  ref.read(previewRiderJobProvider.notifier).clear();
  ref.read(tripPinProvider.notifier).forceClear();

  return EndTripResult(
    ended: true,
    passengerFirstName: job.displayFirstName,
    rideId: rideId,
  );
}

String _pickupLabel(ActiveRideRequest job) {
  final point = job.pickupPoint;
  if (point == null) return 'Shared pickup';
  return 'Pickup (${point.latitude.toStringAsFixed(4)}, ${point.longitude.toStringAsFixed(4)})';
}
