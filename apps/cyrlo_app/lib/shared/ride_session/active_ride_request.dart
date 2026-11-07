import '../../features/auth/application/signup_draft.dart';

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
    this.etaMinutes,
  });

  final String id;
  final DriverKind kind;
  final String riderId;
  final String riderPhoneE164;
  final String passengerPhoneE164;
  final ActiveRideStatus status;
  final DateTime createdAt;
  final String? passengerName;
  final int? etaMinutes;

  String get kindLabel => switch (kind) {
        DriverKind.okada => 'Okada',
        DriverKind.pragya => 'Pragya',
        DriverKind.aboboyaa => 'Aboboyaa',
      };

  bool get sharesContact =>
      status == ActiveRideStatus.requested || status == ActiveRideStatus.ongoing;

  ActiveRideRequest copyWith({ActiveRideStatus? status}) {
    return ActiveRideRequest(
      id: id,
      kind: kind,
      riderId: riderId,
      riderPhoneE164: riderPhoneE164,
      passengerPhoneE164: passengerPhoneE164,
      status: status ?? this.status,
      createdAt: createdAt,
      passengerName: passengerName,
      etaMinutes: etaMinutes,
    );
  }
}
