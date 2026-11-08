import 'package:flutter_riverpod/flutter_riverpod.dart';

import '../domain/nearby_rider.dart';

/// Extra reviews from passenger ratings in this session (merged into nearby cards).
final riderReviewExtrasProvider =
    NotifierProvider<RiderReviewExtrasController, Map<String, List<RiderReview>>>(
  RiderReviewExtrasController.new,
);

class RiderReviewExtrasController
    extends Notifier<Map<String, List<RiderReview>>> {
  @override
  Map<String, List<RiderReview>> build() => const {};

  void add(String riderId, RiderReview review) {
    final existing = state[riderId] ?? const <RiderReview>[];
    state = {
      ...state,
      riderId: [review, ...existing],
    };
  }
}
