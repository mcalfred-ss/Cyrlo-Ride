import 'package:flutter_riverpod/flutter_riverpod.dart';

import '../../core/messaging/ride_sms_gateway.dart';
import '../../passenger_app/home/application/passenger_notifications_provider.dart';
import '../../passenger_app/home/domain/passenger_notification.dart';
import '../../passenger_app/rides/application/passenger_rides_provider.dart';
import '../../passenger_app/rides/domain/passenger_ride.dart';
import 'active_ride_request.dart';
import 'active_ride_request_controller.dart';

class RiderAcceptJobResult {
  const RiderAcceptJobResult({
    required this.accepted,
    required this.bumpedCount,
    required this.smsSentCount,
  });

  final ActiveRideRequest accepted;
  final int bumpedCount;
  final int smsSentCount;
}

/// Accepts one waiting job. Other same-window offers are dropped and those
/// passengers are told the rider is busy (SMS + in-app).
Future<RiderAcceptJobResult?> acceptJobAndReleaseSiblings(
  WidgetRef ref,
  String jobId,
) async {
  final outcome = ref.read(riderJobOffersProvider.notifier).accept(jobId);
  if (outcome == null) return null;

  var smsSentCount = 0;
  for (final sibling in outcome.bumped) {
    final notified = await _notifyPassengerRiderBusy(ref, sibling);
    if (notified) smsSentCount += 1;
  }

  return RiderAcceptJobResult(
    accepted: outcome.accepted,
    bumpedCount: outcome.bumped.length,
    smsSentCount: smsSentCount,
  );
}

Future<bool> _notifyPassengerRiderBusy(
  WidgetRef ref,
  ActiveRideRequest job,
) async {
  final smsBody =
      'Cyrlo Ride: Your ${job.kindLabel} rider is busy with another pickup. '
      'Wait a bit, or request a different rider in the app.';

  final sms = await ref.read(rideSmsGatewayProvider).send(
        toE164: job.passengerPhoneE164,
        body: smsBody,
      );

  ref.read(passengerNotificationsProvider.notifier).prepend(
        PassengerNotification(
          id: 'notif-busy-${job.id}-${DateTime.now().millisecondsSinceEpoch}',
          kind: PassengerNotificationKind.rideUpdate,
          title: 'Rider is busy',
          body:
              'Your ${job.kindLabel} rider accepted another pickup nearby. '
              'Wait for them, or request a different rider.',
          createdAt: DateTime.now(),
        ),
      );

  ref.read(passengerRidesProvider.notifier).prepend(
        PassengerRide(
          id: 'busy-${job.id}-${DateTime.now().millisecondsSinceEpoch}',
          kind: job.kind,
          status: PassengerRideStatus.cancelled,
          pickupLabel: _pickupLabel(job),
          occurredAt: DateTime.now(),
          durationLabel: 'Rider busy',
        ),
      );

  return sms.sent;
}

String _pickupLabel(ActiveRideRequest job) {
  final point = job.pickupPoint;
  if (point == null) return 'Shared pickup';
  return 'Pickup (${point.latitude.toStringAsFixed(4)}, ${point.longitude.toStringAsFixed(4)})';
}
