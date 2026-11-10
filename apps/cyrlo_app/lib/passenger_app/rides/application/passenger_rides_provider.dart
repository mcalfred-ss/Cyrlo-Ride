import 'package:flutter_riverpod/flutter_riverpod.dart';

import '../../../features/auth/application/auth_session.dart';
import '../../../features/bookings/data/booking_models.dart';
import '../../../features/bookings/data/bookings_api.dart';
import '../../../shared/ride_session/active_ride_request.dart';
import '../domain/passenger_ride.dart';

/// Ride history from the live bookings API.
final passengerRidesProvider =
    NotifierProvider<PassengerRidesController, List<PassengerRide>>(
  PassengerRidesController.new,
);

class PassengerRidesController extends Notifier<List<PassengerRide>> {
  @override
  List<PassengerRide> build() {
    Future.microtask(refresh);
    return const [];
  }

  Future<void> refresh() async {
    final session = ref.read(authSessionProvider);
    if (session == null) return;
    try {
      final page = await ref.read(bookingsApiProvider).list(
            accessToken: session.accessToken,
          );
      state = [
        for (final booking in page.items) _fromBooking(booking),
      ];
    } catch (_) {
      // Keep last snapshot.
    }
  }

  void prepend(PassengerRide ride) {
    state = [ride, ...state.where((item) => item.id != ride.id)];
  }

  void upsertBooking(Booking booking) {
    prepend(_fromBooking(booking));
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

  PassengerRide _fromBooking(Booking booking) {
    final status = switch (booking.status) {
      'COMPLETED' => PassengerRideStatus.completed,
      'CANCELLED' ||
      'EXPIRED' ||
      'PAYMENT_FAILED' =>
        PassengerRideStatus.cancelled,
      _ => PassengerRideStatus.ongoing,
    };
    return PassengerRide(
      id: booking.id,
      kind: ActiveRideRequest.kindFromCategory(booking.vehicleCategory),
      status: status,
      pickupLabel: booking.pickupLabel?.trim().isNotEmpty == true
          ? booking.pickupLabel!
          : 'Pickup',
      occurredAt: (booking.completedAt ??
              booking.cancelledAt ??
              booking.acceptedAt ??
              booking.createdAt)
          .toLocal(),
      riderId: booking.riderId,
      needsReview: status == PassengerRideStatus.completed,
      durationLabel: booking.destinationLabel,
    );
  }
}
