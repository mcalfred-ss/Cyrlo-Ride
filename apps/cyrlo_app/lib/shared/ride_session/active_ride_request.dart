import '../../features/auth/application/signup_draft.dart';
import '../../features/bookings/data/booking_models.dart';
import '../../rider_app/onboarding/data/rider_onboarding_models.dart';
import '../models/geo_point.dart';

enum ActiveRideStatus { requested, ongoing, completed, cancelled }

/// Live pickup request. Contact numbers are visible only while [sharesContact].
class ActiveRideRequest {
  const ActiveRideRequest({
    required this.id,
    required this.kind,
    required this.riderId,
    required this.riderPhoneE164,
    required this.passengerPhoneE164,
    required this.status,
    required this.createdAt,
    this.bookingId,
    this.riderDisplayName,
    this.passengerName,
    this.passengerFirstName,
    this.passengerGender,
    this.etaMinutes,
    this.pickupPoint,
  });

  /// Offer id when pending for a rider; booking id when accepted / passenger-owned.
  final String id;
  final String? bookingId;
  final DriverKind kind;
  final String riderId;
  final String riderPhoneE164;
  final String passengerPhoneE164;
  final ActiveRideStatus status;
  final DateTime createdAt;
  final String? riderDisplayName;
  final String? passengerName;
  final String? passengerFirstName;
  final PassengerGender? passengerGender;
  final int? etaMinutes;
  final GeoPoint? pickupPoint;

  String get resolvedBookingId => bookingId ?? id;

  String get riderLabel {
    final name = riderDisplayName?.trim();
    if (name != null && name.isNotEmpty) return name;
    return '$kindLabel rider';
  }

  String get kindLabel => switch (kind) {
        DriverKind.okada => 'Car',
        DriverKind.pragya => 'Tricycle',
        DriverKind.aboboyaa => 'Aboboyaa',
      };

  String get displayFirstName {
    final first = passengerFirstName?.trim();
    if (first != null && first.isNotEmpty) return first;
    final full = passengerName?.trim();
    if (full == null || full.isEmpty) return 'Passenger';
    return full.split(RegExp(r'\s+')).first;
  }

  String get etaLabel {
    final mins = etaMinutes;
    if (mins == null) return 'Nearby';
    if (mins <= 1) return '1 min away';
    return '$mins mins away';
  }

  bool get sharesContact =>
      status == ActiveRideStatus.requested || status == ActiveRideStatus.ongoing;

  bool get isPending => status == ActiveRideStatus.requested;

  bool get isAccepted => status == ActiveRideStatus.ongoing;

  ActiveRideRequest copyWith({
    ActiveRideStatus? status,
    GeoPoint? pickupPoint,
    String? riderDisplayName,
    String? bookingId,
  }) {
    return ActiveRideRequest(
      id: id,
      bookingId: bookingId ?? this.bookingId,
      kind: kind,
      riderId: riderId,
      riderPhoneE164: riderPhoneE164,
      passengerPhoneE164: passengerPhoneE164,
      status: status ?? this.status,
      createdAt: createdAt,
      riderDisplayName: riderDisplayName ?? this.riderDisplayName,
      passengerName: passengerName,
      passengerFirstName: passengerFirstName,
      passengerGender: passengerGender,
      etaMinutes: etaMinutes,
      pickupPoint: pickupPoint ?? this.pickupPoint,
    );
  }

  static DriverKind kindFromCategory(String? category) {
    final parsed = VehicleCategoryApi.fromApi(category);
    return switch (parsed) {
      VehicleCategory.car => DriverKind.okada,
      VehicleCategory.tricycle || null => DriverKind.pragya,
    };
  }

  factory ActiveRideRequest.fromMatchingOffer(MatchingOffer offer) {
    final booking = offer.booking;
    return ActiveRideRequest(
      id: offer.offerId,
      bookingId: offer.bookingId,
      kind: kindFromCategory(booking.vehicleCategory),
      riderId: booking.riderId ?? '',
      riderPhoneE164: '',
      passengerPhoneE164: '',
      status: ActiveRideStatus.requested,
      createdAt: offer.offeredAt,
      passengerName: booking.pickupLabel ?? 'Passenger',
      passengerFirstName: (booking.pickupLabel ?? 'Passenger')
          .split(RegExp(r'\s+'))
          .first,
      pickupPoint: booking.pickup,
      etaMinutes: null,
    );
  }

  factory ActiveRideRequest.fromBooking(
    Booking booking, {
    required ActiveRideStatus status,
    String? passengerPhoneE164,
  }) {
    return ActiveRideRequest(
      id: booking.id,
      bookingId: booking.id,
      kind: kindFromCategory(booking.vehicleCategory),
      riderId: booking.riderId ?? '',
      riderPhoneE164: '',
      passengerPhoneE164: passengerPhoneE164 ?? '',
      status: status,
      createdAt: booking.createdAt,
      pickupPoint: booking.pickup,
      passengerName: booking.pickupLabel,
    );
  }
}
