import '../../features/auth/application/signup_draft.dart';
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
    this.passengerName,
    this.passengerFirstName,
    this.passengerGender,
    this.etaMinutes,
    this.pickupPoint,
  });

  final String id;
  final DriverKind kind;
  final String riderId;
  final String riderPhoneE164;
  final String passengerPhoneE164;
  final ActiveRideStatus status;
  final DateTime createdAt;
  final String? passengerName;
  final String? passengerFirstName;
  final PassengerGender? passengerGender;
  final int? etaMinutes;
  final GeoPoint? pickupPoint;

  String get kindLabel => switch (kind) {
        DriverKind.okada => 'Okada',
        DriverKind.pragya => 'Pragya',
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
  }) {
    return ActiveRideRequest(
      id: id,
      kind: kind,
      riderId: riderId,
      riderPhoneE164: riderPhoneE164,
      passengerPhoneE164: passengerPhoneE164,
      status: status ?? this.status,
      createdAt: createdAt,
      passengerName: passengerName,
      passengerFirstName: passengerFirstName,
      passengerGender: passengerGender,
      etaMinutes: etaMinutes,
      pickupPoint: pickupPoint ?? this.pickupPoint,
    );
  }
}
