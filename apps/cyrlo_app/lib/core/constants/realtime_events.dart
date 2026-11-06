/// Socket.IO event names shared with the backend contract.
/// The server does not emit these events yet.
abstract final class RealtimeEvents {
  static const bookingRequested = 'booking.requested';
  static const bookingAccepted = 'booking.accepted';
  static const bookingRejected = 'booking.rejected';
  static const bookingCancelled = 'booking.cancelled';
  static const bookingCompleted = 'booking.completed';
  static const riderLocationUpdated = 'rider.location.updated';
  static const riderAvailabilityUpdated = 'rider.availability.updated';

  static const all = <String>[
    bookingRequested,
    bookingAccepted,
    bookingRejected,
    bookingCancelled,
    bookingCompleted,
    riderLocationUpdated,
    riderAvailabilityUpdated,
  ];
}
