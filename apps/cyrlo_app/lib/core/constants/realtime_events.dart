/// Socket.IO event names shared with the backend contract.
abstract final class RealtimeEvents {
  /// Emitted to the user's own room whenever an inbox notification is stored.
  static const notificationCreated = 'notification.created';

  static const bookingRequested = 'booking.requested';
  static const bookingAccepted = 'booking.accepted';
  static const bookingRejected = 'booking.rejected';
  static const bookingCancelled = 'booking.cancelled';
  static const bookingCompleted = 'booking.completed';
  static const matchingOfferCreated = 'matching.offer.created';
  static const riderLocationUpdated = 'rider.location.updated';
  static const riderAvailabilityUpdated = 'rider.availability.updated';

  static const all = <String>[
    notificationCreated,
    bookingRequested,
    bookingAccepted,
    bookingRejected,
    bookingCancelled,
    bookingCompleted,
    matchingOfferCreated,
    riderLocationUpdated,
    riderAvailabilityUpdated,
  ];
}
