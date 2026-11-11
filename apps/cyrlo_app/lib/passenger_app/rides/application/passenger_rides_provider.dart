import 'package:flutter_riverpod/flutter_riverpod.dart';

import '../../../features/auth/application/auth_session.dart';
import '../../../features/bookings/data/booking_models.dart';
import '../../../features/bookings/data/bookings_api.dart';
import '../../../shared/models/loadable_list.dart';
import '../../../shared/ride_session/active_ride_request.dart';
import '../domain/passenger_ride.dart';

/// Ride history from the live bookings API.
final passengerRidesProvider =
    NotifierProvider<PassengerRidesController, LoadableList<PassengerRide>>(
  PassengerRidesController.new,
);

class PassengerRidesController extends Notifier<LoadableList<PassengerRide>> {
  @override
  LoadableList<PassengerRide> build() {
    Future.microtask(refresh);
    return const LoadableList(isLoading: true);
  }

  Future<void> refresh() async {
    final session = ref.read(authSessionProvider);
    if (session == null) {
      state = const LoadableList(isLoading: false);
      return;
    }
    if (state.items.isEmpty) {
      state = state.copyWith(isLoading: true);
    }
    try {
      final page = await ref.read(bookingsApiProvider).list(
            accessToken: session.accessToken,
          );
      state = LoadableList(
        items: [
          for (final booking in page.items) _fromBooking(booking),
        ],
        isLoading: false,
      );
    } catch (_) {
      state = state.copyWith(isLoading: false);
    }
  }

  void prepend(PassengerRide ride) {
    state = LoadableList(
      items: [ride, ...state.items.where((item) => item.id != ride.id)],
      isLoading: false,
    );
  }

  void upsertBooking(Booking booking) {
    prepend(_fromBooking(booking));
  }

  void submitReview({
    required String rideId,
    required int rating,
    String? comment,
  }) {
    state = LoadableList(
      items: [
        for (final ride in state.items)
          if (ride.id == rideId)
            ride.copyWith(
              rating: rating,
              reviewComment:
                  comment?.trim().isEmpty == true ? null : comment?.trim(),
              needsReview: false,
            )
          else
            ride,
      ],
      isLoading: false,
    );
  }

  void dismissReviewPrompt(String rideId) {
    state = LoadableList(
      items: [
        for (final ride in state.items)
          if (ride.id == rideId) ride.copyWith(needsReview: false) else ride,
      ],
      isLoading: false,
    );
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
      durationLabel: booking.pickupLabel ?? booking.destinationLabel,
    );
  }
}
