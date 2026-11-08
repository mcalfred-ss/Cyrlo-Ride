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
    this.riderId,
    this.riderDisplayName,
    this.rating,
    this.reviewComment,
    this.needsReview = false,
  });

  final String id;
  final DriverKind kind;
  final PassengerRideStatus status;
  final String pickupLabel;
  final DateTime occurredAt;
  final String? durationLabel;
  final String? riderId;
  final String? riderDisplayName;
  final int? rating;
  final String? reviewComment;
  final bool needsReview;

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

  String get riderLabel {
    final name = riderDisplayName?.trim();
    if (name != null && name.isNotEmpty) return name;
    return '$kindLabel rider';
  }

  bool get canRate =>
      status == PassengerRideStatus.completed && rating == null;

  PassengerRide copyWith({
    PassengerRideStatus? status,
    String? durationLabel,
    int? rating,
    String? reviewComment,
    bool? needsReview,
    bool clearRating = false,
  }) {
    return PassengerRide(
      id: id,
      kind: kind,
      status: status ?? this.status,
      pickupLabel: pickupLabel,
      occurredAt: occurredAt,
      durationLabel: durationLabel ?? this.durationLabel,
      riderId: riderId,
      riderDisplayName: riderDisplayName,
      rating: clearRating ? null : (rating ?? this.rating),
      reviewComment: reviewComment ?? this.reviewComment,
      needsReview: needsReview ?? this.needsReview,
    );
  }
}
