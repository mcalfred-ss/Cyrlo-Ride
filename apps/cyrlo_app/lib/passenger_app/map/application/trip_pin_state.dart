import '../../../core/mapping/resolved_location.dart';
import '../../../shared/models/geo_point.dart';

/// Pickup-only pin state. Destination stays off-app (agreed with the rider in person).
class TripPinState {
  const TripPinState({
    this.pickup,
    this.pickupLabel,
    this.locationMessage,
    this.nearbyLandmarks = const [],
    this.approximateLocation = false,
    this.isResolvingLocation = false,
    this.isResolvingLabel = false,
  });

  final GeoPoint? pickup;
  final String? pickupLabel;
  final String? locationMessage;
  final List<NearbyLandmarkRef> nearbyLandmarks;
  final bool approximateLocation;
  final bool isResolvingLocation;
  final bool isResolvingLabel;

  bool get hasPickup => pickup != null;

  TripPinState copyWith({
    GeoPoint? pickup,
    String? pickupLabel,
    String? locationMessage,
    List<NearbyLandmarkRef>? nearbyLandmarks,
    bool? approximateLocation,
    bool? isResolvingLocation,
    bool? isResolvingLabel,
    bool clearPickup = false,
    bool clearPickupLabel = false,
    bool clearLocationMessage = false,
    bool clearNearbyLandmarks = false,
  }) {
    return TripPinState(
      pickup: clearPickup ? null : (pickup ?? this.pickup),
      pickupLabel: clearPickup || clearPickupLabel
          ? null
          : (pickupLabel ?? this.pickupLabel),
      locationMessage: clearLocationMessage
          ? null
          : (locationMessage ?? this.locationMessage),
      nearbyLandmarks: clearPickup || clearNearbyLandmarks
          ? const []
          : (nearbyLandmarks ?? this.nearbyLandmarks),
      approximateLocation: clearPickup
          ? false
          : (approximateLocation ?? this.approximateLocation),
      isResolvingLocation: isResolvingLocation ?? this.isResolvingLocation,
      isResolvingLabel: isResolvingLabel ?? this.isResolvingLabel,
    );
  }
}
