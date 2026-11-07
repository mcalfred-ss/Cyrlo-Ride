import 'package:flutter_riverpod/flutter_riverpod.dart';

import '../../../features/auth/application/signup_draft.dart';
import '../domain/passenger_ride.dart';

/// Demo ride history until live trip history lands. Local cancels prepend here.
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
      ),
      PassengerRide(
        id: 'ride-1',
        kind: DriverKind.pragya,
        status: PassengerRideStatus.completed,
        pickupLabel: 'Kejetia Market',
        occurredAt: now.subtract(const Duration(hours: 3)),
        durationLabel: '16 mins',
      ),
      PassengerRide(
        id: 'ride-2',
        kind: DriverKind.okada,
        status: PassengerRideStatus.completed,
        pickupLabel: 'Adum',
        occurredAt: now.subtract(const Duration(days: 1, hours: 4)),
        durationLabel: '11 mins',
      ),
      PassengerRide(
        id: 'ride-3',
        kind: DriverKind.pragya,
        status: PassengerRideStatus.completed,
        pickupLabel: 'Abuakwa',
        occurredAt: now.subtract(const Duration(days: 2, hours: 6)),
        durationLabel: '21 mins',
      ),
      PassengerRide(
        id: 'ride-4',
        kind: DriverKind.okada,
        status: PassengerRideStatus.completed,
        pickupLabel: 'Suame Magazine',
        occurredAt: now.subtract(const Duration(days: 4, hours: 2)),
        durationLabel: '9 mins',
      ),
      PassengerRide(
        id: 'ride-5',
        kind: DriverKind.pragya,
        status: PassengerRideStatus.cancelled,
        pickupLabel: 'Santasi',
        occurredAt: now.subtract(const Duration(days: 5)),
      ),
    ];
  }

  void prepend(PassengerRide ride) {
    state = [ride, ...state];
  }
}
