import '../../../shared/models/geo_point.dart';

/// Pickup-only pin state. Destination stays off-app (agreed with the rider in person).
class TripPinState {
  const TripPinState({
    this.pickup,
    this.locationMessage,
    this.isResolvingLocation = false,
  });

  final GeoPoint? pickup;
  final String? locationMessage;
  final bool isResolvingLocation;

  bool get hasPickup => pickup != null;

  TripPinState copyWith({
    GeoPoint? pickup,
    String? locationMessage,
    bool? isResolvingLocation,
    bool clearPickup = false,
    bool clearLocationMessage = false,
  }) {
    return TripPinState(
      pickup: clearPickup ? null : (pickup ?? this.pickup),
      locationMessage: clearLocationMessage
          ? null
          : (locationMessage ?? this.locationMessage),
      isResolvingLocation: isResolvingLocation ?? this.isResolvingLocation,
    );
  }
}
