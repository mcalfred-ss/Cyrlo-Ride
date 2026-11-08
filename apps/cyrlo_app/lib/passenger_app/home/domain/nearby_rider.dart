import '../../../features/auth/application/signup_draft.dart';
import '../../../shared/models/geo_point.dart';

class RiderReview {
  const RiderReview({
    required this.id,
    required this.passengerName,
    required this.rating,
    required this.comment,
    required this.occurredAt,
  });

  final String id;
  final String passengerName;
  final double rating;
  final String comment;
  final DateTime occurredAt;
}

class NearbyRider {
  const NearbyRider({
    required this.id,
    required this.kind,
    required this.etaMinutes,
    required this.point,
    required this.displayName,
    required this.rating,
    required this.reviewCount,
    this.gender,
    this.reviews = const [],
    this.phoneE164,
    this.available = true,
    this.busy = false,
  });

  final String id;
  final DriverKind kind;
  final int etaMinutes;
  final GeoPoint point;
  final String displayName;
  final PassengerGender? gender;
  final double rating;
  final int reviewCount;
  final List<RiderReview> reviews;
  /// Shared only after a paid request — never shown on the public nearby list UI.
  final String? phoneE164;
  final bool available;
  final bool busy;

  bool get canRequest => available && !busy;

  String get kindLabel => switch (kind) {
        DriverKind.okada => 'Okada',
        DriverKind.pragya => 'Pragya',
        DriverKind.aboboyaa => 'Aboboyaa',
      };

  String get kindRiderLabel => '$kindLabel rider';

  String get etaLabel => etaMinutes <= 1 ? '1 min away' : '$etaMinutes mins away';

  String get statusLabel {
    if (busy) return 'Busy';
    if (!available) return 'Coming soon';
    return 'Available nearby';
  }

  String get ratingLabel => rating.toStringAsFixed(1);

  String get reviewCountLabel {
    if (reviewCount <= 0) return 'No reviews yet';
    if (reviewCount == 1) return '1 review';
    return '$reviewCount reviews';
  }

  NearbyRider copyWith({
    bool? busy,
    bool? available,
    double? rating,
    int? reviewCount,
    List<RiderReview>? reviews,
  }) {
    return NearbyRider(
      id: id,
      kind: kind,
      etaMinutes: etaMinutes,
      point: point,
      displayName: displayName,
      gender: gender,
      rating: rating ?? this.rating,
      reviewCount: reviewCount ?? this.reviewCount,
      reviews: reviews ?? this.reviews,
      phoneE164: phoneE164,
      available: available ?? this.available,
      busy: busy ?? this.busy,
    );
  }
}
