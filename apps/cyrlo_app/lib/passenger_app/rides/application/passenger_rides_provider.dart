import 'package:flutter_riverpod/flutter_riverpod.dart';

import '../../../features/auth/application/signup_draft.dart';
import '../domain/passenger_ride.dart';

/// Demo ride history until live trip history lands.
final passengerRidesProvider =
    NotifierProvider<PassengerRidesController, List<PassengerRide>>(
  PassengerRidesController.new,
);

class PassengerRidesController extends Notifier<List<PassengerRide>> {
  @override
  List<PassengerRide> build() {
    final now = DateTime.now();
    return [
      PassengerRide(
        id: 'ride-ongoing',
        kind: DriverKind.pragya,
        status: PassengerRideStatus.ongoing,
        pickupLabel: 'Asafo Market',
        occurredAt: now.subtract(const Duration(minutes: 8)),
        durationLabel: 'On the way',
        riderDisplayName: 'Kwame Mensah',
        riderId: 'nearby-pragya-1',
      ),
      PassengerRide(
        id: 'ride-awaiting-rate',
        kind: DriverKind.pragya,
        status: PassengerRideStatus.completed,
        pickupLabel: 'Asokwa Junction',
        occurredAt: now.subtract(const Duration(minutes: 25)),
        durationLabel: 'Completed',
        riderDisplayName: 'Kwame Mensah',
        riderId: 'nearby-pragya-1',
        needsReview: true,
      ),
      PassengerRide(
        id: 'ride-1',
        kind: DriverKind.pragya,
        status: PassengerRideStatus.completed,
        pickupLabel: 'Kejetia Market',
        occurredAt: now.subtract(const Duration(hours: 3)),
        durationLabel: '16 mins',
        riderDisplayName: 'Kwame Mensah',
        riderId: 'nearby-pragya-1',
        rating: 5,
        reviewComment: 'Very polite and arrived fast.',
      ),
      PassengerRide(
        id: 'ride-2',
        kind: DriverKind.okada,
        status: PassengerRideStatus.completed,
        pickupLabel: 'Adum',
        occurredAt: now.subtract(const Duration(days: 1, hours: 4)),
        durationLabel: '11 mins',
        riderDisplayName: 'Yaw Boateng',
        riderId: 'nearby-okada-1',
        rating: 4,
      ),
      PassengerRide(
        id: 'ride-3',
        kind: DriverKind.pragya,
        status: PassengerRideStatus.completed,
        pickupLabel: 'Abuakwa',
        occurredAt: now.subtract(const Duration(days: 2, hours: 6)),
        durationLabel: '21 mins',
        riderDisplayName: 'Ama Serwaa',
        riderId: 'nearby-pragya-2',
        rating: 5,
      ),
      PassengerRide(
        id: 'ride-4',
        kind: DriverKind.okada,
        status: PassengerRideStatus.completed,
        pickupLabel: 'Suame Magazine',
        occurredAt: now.subtract(const Duration(days: 4, hours: 2)),
        durationLabel: '9 mins',
        riderDisplayName: 'Kofi Asante',
        riderId: 'nearby-okada-2',
        rating: 5,
      ),
      PassengerRide(
        id: 'ride-5',
        kind: DriverKind.pragya,
        status: PassengerRideStatus.cancelled,
        pickupLabel: 'Santasi',
        occurredAt: now.subtract(const Duration(days: 5)),
        riderDisplayName: 'Kwame Mensah',
        riderId: 'nearby-pragya-1',
      ),
    ];
  }

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
            reviewComment: comment?.trim().isEmpty == true ? null : comment?.trim(),
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
