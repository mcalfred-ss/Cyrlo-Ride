import '../../../features/auth/application/signup_draft.dart';

enum PassengerRideStatus { completed, cancelled, ongoing }

class PassengerRide {
  const PassengerRide({
    required this.id,
    required this.kind,
    required this.status,
    required this.pickupLabel,
    required this.occurredAt,
    this.durationLabel,
  });

  final String id;
  final DriverKind kind;
  final PassengerRideStatus status;
  final String pickupLabel;
  final DateTime occurredAt;
  final String? durationLabel;

  String get kindLabel => switch (kind) {
        DriverKind.okada => 'Okada',
        DriverKind.pragya => 'Pragya',
        DriverKind.aboboyaa => 'Aboboyaa',
      };

  String get statusLabel => switch (status) {
        PassengerRideStatus.completed => 'Completed',
        PassengerRideStatus.cancelled => 'Cancelled',
        PassengerRideStatus.ongoing => 'Ongoing',
      };
}
