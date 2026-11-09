import 'package:flutter_riverpod/flutter_riverpod.dart';

import '../../core/messaging/ride_sms_gateway.dart';
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
    required this.smsSent,
    this.passengerFirstName,
  });

  final bool cancelled;
  final bool smsSent;
  final String? passengerFirstName;
}

/// Ends an accepted pickup: SMS + in-app notice for the passenger, history row,
/// then clears the live session so the rider can take new jobs.
Future<RiderCancelAcceptedResult> cancelAcceptedRideByRider(
  WidgetRef ref,
) async {
  final job = ref.read(activeRideRequestProvider);
  if (job == null || !job.isAccepted) {
    return const RiderCancelAcceptedResult(cancelled: false, smsSent: false);
  }

  final smsBody =
      'Cyrlo Ride: Your ${job.kindLabel} rider cancelled the pickup. '
      'Open the app to request another ride.';

  final sms = await ref.read(rideSmsGatewayProvider).send(
        toE164: job.passengerPhoneE164,
        body: smsBody,
      );

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
          id: 'cancelled-${job.id}',
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
          body: sms.sent
              ? 'Your ${job.kindLabel} rider cancelled the pickup. Check SMS for the same update.'
              : 'Your ${job.kindLabel} rider cancelled the pickup. Request another rider when you’re ready.',
        ),
      );

  ref.read(activeRideRequestProvider.notifier).markCancelled();
  ref.read(selectedNearbyRiderProvider.notifier).clear();
  ref.read(previewRiderJobProvider.notifier).clear();
  ref.read(tripPinProvider.notifier).forceClear();

  return RiderCancelAcceptedResult(
    cancelled: true,
    smsSent: sms.sent,
    passengerFirstName: job.displayFirstName,
  );
}

String _pickupLabel(ActiveRideRequest job) {
  final point = job.pickupPoint;
  if (point == null) return 'Shared pickup';
  return 'Pickup (${point.latitude.toStringAsFixed(4)}, ${point.longitude.toStringAsFixed(4)})';
}
