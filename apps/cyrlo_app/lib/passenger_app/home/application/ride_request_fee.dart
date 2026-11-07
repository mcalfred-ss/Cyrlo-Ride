/// Flat request fee charged before a passenger can send a ride request.
/// Ride fare itself is paid outside the app.
abstract final class RideRequestFee {
  static const amountCedi = 1;
  static const label = 'GHS 1.00';
}
