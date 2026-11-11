import 'package:flutter_riverpod/flutter_riverpod.dart';

import 'active_ride_request.dart';
import 'active_ride_request_controller.dart';

class RiderAcceptJobResult {
  const RiderAcceptJobResult({
    required this.accepted,
    required this.bumpedCount,
  });

  final ActiveRideRequest accepted;

  /// Other pending offers released locally once this one was accepted.
  final int bumpedCount;
}

/// Accepts one waiting job via the matching API. The server keeps the other
/// passengers' bookings searching and re-offers them to other riders, so no
/// passenger-facing notice is fabricated on this device.
Future<RiderAcceptJobResult?> acceptJobAndReleaseSiblings(
  WidgetRef ref,
  String jobId,
) async {
  final outcome = await ref.read(riderJobOffersProvider.notifier).accept(jobId);
  if (outcome == null) return null;

  return RiderAcceptJobResult(
    accepted: outcome.accepted,
    bumpedCount: outcome.bumped.length,
  );
}
