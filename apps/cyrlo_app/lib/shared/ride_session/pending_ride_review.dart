import 'package:flutter_riverpod/flutter_riverpod.dart';

import '../../features/auth/application/signup_draft.dart';

/// Set when the rider ends a trip so the passenger can rate them.
class PendingRideReview {
  const PendingRideReview({
    required this.rideId,
    required this.riderId,
    required this.riderDisplayName,
    required this.kind,
  });

  final String rideId;
  final String riderId;
  final String riderDisplayName;
  final DriverKind kind;
}

final pendingRideReviewProvider =
    NotifierProvider<PendingRideReviewController, PendingRideReview?>(
  PendingRideReviewController.new,
);

class PendingRideReviewController extends Notifier<PendingRideReview?> {
  @override
  PendingRideReview? build() => null;

  void set(PendingRideReview review) => state = review;

  void clear() => state = null;
}
