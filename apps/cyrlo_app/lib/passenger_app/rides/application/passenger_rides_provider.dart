import 'package:flutter_riverpod/flutter_riverpod.dart';

import '../domain/passenger_ride.dart';

/// Ride history from the live API. Starts empty until bookings are listed.
final passengerRidesProvider =
    NotifierProvider<PassengerRidesController, List<PassengerRide>>(
  PassengerRidesController.new,
);

class PassengerRidesController extends Notifier<List<PassengerRide>> {
  @override
  List<PassengerRide> build() => const [];

  void prepend(PassengerRide ride) {
    state = [ride, ...state];
  }

  void submitReview({
    required String rideId,
    required int rating,
    String? comment,
  }) {
    state = [
      for (final ride in state)
        if (ride.id == rideId)
          ride.copyWith(
            rating: rating,
            reviewComment:
                comment?.trim().isEmpty == true ? null : comment?.trim(),
            needsReview: false,
          )
        else
          ride,
    ];
  }

  void dismissReviewPrompt(String rideId) {
    state = [
      for (final ride in state)
        if (ride.id == rideId) ride.copyWith(needsReview: false) else ride,
    ];
  }
}
