import '../../../shared/models/geo_point.dart';

class BookingPaymentCheckout {
  const BookingPaymentCheckout({
    required this.paymentId,
    required this.amountPesewas,
    required this.currency,
    required this.status,
    required this.reference,
    required this.authorizationUrl,
    required this.accessCode,
    required this.paymentExpiresAt,
  });

  final String paymentId;
  final int amountPesewas;
  final String currency;
  final String status;
  final String reference;
  final String authorizationUrl;
  final String accessCode;
  final DateTime paymentExpiresAt;

  factory BookingPaymentCheckout.fromJson(Map<String, dynamic> json) {
    return BookingPaymentCheckout(
      paymentId: json['paymentId'] as String,
      amountPesewas: (json['amountPesewas'] as num).toInt(),
      currency: json['currency'] as String? ?? 'GHS',
      status: json['status'] as String? ?? 'PENDING',
      reference: json['reference'] as String? ?? '',
      authorizationUrl: json['authorizationUrl'] as String? ?? '',
      accessCode: json['accessCode'] as String? ?? '',
      paymentExpiresAt: DateTime.parse(json['paymentExpiresAt'] as String),
    );
  }
}

class Booking {
  const Booking({
    required this.id,
    required this.status,
    required this.vehicleCategory,
    required this.pickup,
    required this.bookingFeePesewas,
    required this.createdAt,
    this.destination,
    this.paymentExpiresAt,
    this.passengerId,
    this.riderId,
    this.pickupLabel,
    this.destinationLabel,
    this.searchExpiresAt,
    this.acceptedAt,
    this.startedAt,
    this.cancelledAt,
    this.completedAt,
    this.passengerAcknowledgedAt,
    this.payment,
  });

  final String id;
  final String status;
  final String vehicleCategory;
  final GeoPoint pickup;
  final GeoPoint? destination;
  final int bookingFeePesewas;
  final DateTime? paymentExpiresAt;
  final DateTime createdAt;
  final String? passengerId;
  final String? riderId;
  final String? pickupLabel;
  final String? destinationLabel;
  final DateTime? searchExpiresAt;
  final DateTime? acceptedAt;
  final DateTime? startedAt;
  final DateTime? cancelledAt;
  final DateTime? completedAt;
  final DateTime? passengerAcknowledgedAt;
  final BookingPaymentCheckout? payment;

  bool get isPassengerAcknowledged => passengerAcknowledgedAt != null;
  bool get isAwaitingPayment => status == 'AWAITING_PAYMENT';
  bool get isSearching => status == 'SEARCHING';
  bool get isAccepted => status == 'ACCEPTED';
  bool get isInProgress => status == 'IN_PROGRESS';
  bool get isTerminal =>
      status == 'COMPLETED' ||
      status == 'CANCELLED' ||
      status == 'EXPIRED' ||
      status == 'PAYMENT_FAILED';

  factory Booking.fromJson(Map<String, dynamic> json) {
    final pickup = json['pickup'];
    final destination = json['destination'];
    final paymentRaw = json['payment'];
    return Booking(
      id: json['id'] as String,
      status: json['status'] as String,
      vehicleCategory: json['vehicleCategory'] as String? ?? 'PRAGYA',
      pickup: _point(pickup),
      destination: _optPoint(destination),
      bookingFeePesewas: (json['bookingFeePesewas'] as num?)?.toInt() ?? 100,
      paymentExpiresAt: _optDate(json['paymentExpiresAt']),
      createdAt: DateTime.parse(
        json['createdAt'] as String? ??
            json['requestedAt'] as String? ??
            DateTime.now().toUtc().toIso8601String(),
      ),
      passengerId: json['passengerId'] as String?,
      riderId: json['riderId'] as String?,
      pickupLabel: json['pickupLabel'] as String?,
      destinationLabel: json['destinationLabel'] as String?,
      searchExpiresAt: _optDate(json['searchExpiresAt']),
      acceptedAt: _optDate(json['acceptedAt']),
      startedAt: _optDate(json['startedAt']),
      cancelledAt: _optDate(json['cancelledAt']),
      completedAt: _optDate(json['completedAt']),
      passengerAcknowledgedAt: _optDate(json['passengerAcknowledgedAt']),
      payment: paymentRaw is Map
          ? BookingPaymentCheckout.fromJson(
              Map<String, dynamic>.from(paymentRaw),
            )
          : null,
    );
  }

  static GeoPoint _point(Object? raw) {
    if (raw is Map) {
      return GeoPoint(
        latitude: (raw['latitude'] as num?)?.toDouble() ?? 0,
        longitude: (raw['longitude'] as num?)?.toDouble() ?? 0,
      );
    }
    return const GeoPoint(latitude: 0, longitude: 0);
  }

  static GeoPoint? _optPoint(Object? raw) {
    if (raw == null) return null;
    if (raw is Map) {
      final lat = (raw['latitude'] as num?)?.toDouble();
      final lng = (raw['longitude'] as num?)?.toDouble();
      if (lat == null || lng == null) return null;
      return GeoPoint(latitude: lat, longitude: lng);
    }
    return null;
  }

  static DateTime? _optDate(Object? raw) {
    if (raw is! String || raw.isEmpty) return null;
    return DateTime.tryParse(raw);
  }
}

class MatchingOffer {
  const MatchingOffer({
    required this.offerId,
    required this.bookingId,
    required this.status,
    required this.batchSequence,
    required this.offeredAt,
    required this.expiresAt,
    required this.booking,
  });

  final String offerId;
  final String bookingId;
  final String status;
  final int batchSequence;
  final DateTime offeredAt;
  final DateTime expiresAt;
  final Booking booking;

  factory MatchingOffer.fromJson(Map<String, dynamic> json) {
    final bookingRaw = json['booking'];
    final bookingMap = bookingRaw is Map
        ? Map<String, dynamic>.from(bookingRaw)
        : <String, dynamic>{};
    // Offer payload nests a partial booking — merge ids/status for Booking.fromJson.
    bookingMap.putIfAbsent('id', () => json['bookingId']);
    bookingMap.putIfAbsent('status', () => bookingMap['status'] ?? 'SEARCHING');
    bookingMap.putIfAbsent(
      'bookingFeePesewas',
      () => 100,
    );
    // Destination and paymentExpiresAt stay optional — do not invent them.
    bookingMap.putIfAbsent(
      'createdAt',
      () => json['offeredAt'] ?? DateTime.now().toUtc().toIso8601String(),
    );
    return MatchingOffer(
      offerId: json['offerId'] as String,
      bookingId: json['bookingId'] as String,
      status: json['status'] as String? ?? 'PENDING',
      batchSequence: (json['batchSequence'] as num?)?.toInt() ?? 0,
      offeredAt: DateTime.parse(
        json['offeredAt'] as String? ?? DateTime.now().toUtc().toIso8601String(),
      ),
      expiresAt: DateTime.parse(
        json['expiresAt'] as String? ?? DateTime.now().toUtc().toIso8601String(),
      ),
      booking: Booking.fromJson(bookingMap),
    );
  }
}

class MatchingStatus {
  const MatchingStatus({
    required this.bookingId,
    required this.status,
    this.searchExpiresAt,
    this.assignedRiderId,
    this.acceptedAt,
  });

  final String bookingId;
  final String status;
  final DateTime? searchExpiresAt;
  final String? assignedRiderId;
  final DateTime? acceptedAt;

  factory MatchingStatus.fromJson(Map<String, dynamic> json) {
    return MatchingStatus(
      bookingId: json['bookingId'] as String,
      status: json['status'] as String,
      searchExpiresAt: Booking._optDate(json['searchExpiresAt']),
      assignedRiderId: json['assignedRiderId'] as String?,
      acceptedAt: Booking._optDate(json['acceptedAt']),
    );
  }
}

/// Count-only nearby supply from `GET /matching/supply`.
class MatchingSupply {
  const MatchingSupply({
    required this.available,
    required this.count,
    required this.vehicleCategory,
  });

  final bool available;
  final int count;
  final String vehicleCategory;

  factory MatchingSupply.fromJson(Map<String, dynamic> json) {
    return MatchingSupply(
      available: json['available'] == true,
      count: (json['count'] as num?)?.toInt() ?? 0,
      vehicleCategory: json['vehicleCategory'] as String? ?? 'PRAGYA',
    );
  }
}
