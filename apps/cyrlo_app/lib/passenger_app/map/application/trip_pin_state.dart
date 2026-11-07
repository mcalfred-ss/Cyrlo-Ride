import '../../../shared/models/geo_point.dart';

enum TripPinFocus { pickup, destination }

class TripPinState {
  const TripPinState({
    this.focus = TripPinFocus.pickup,
    this.pickup,
    this.destination,
    this.routePoints = const [],
    this.routeError,
    this.locationMessage,
    this.isResolvingLocation = false,
    this.isResolvingRoute = false,
  });

  final TripPinFocus focus;
  final GeoPoint? pickup;
  final GeoPoint? destination;
  final List<GeoPoint> routePoints;
  final String? routeError;
  final String? locationMessage;
  final bool isResolvingLocation;
  final bool isResolvingRoute;

  bool get hasBothPins => pickup != null && destination != null;

  TripPinState copyWith({
    TripPinFocus? focus,
    GeoPoint? pickup,
    GeoPoint? destination,
    List<GeoPoint>? routePoints,
    String? routeError,
    String? locationMessage,
    bool? isResolvingLocation,
    bool? isResolvingRoute,
    bool clearPickup = false,
    bool clearDestination = false,
    bool clearRoute = false,
    bool clearRouteError = false,
    bool clearLocationMessage = false,
  }) {
    return TripPinState(
      focus: focus ?? this.focus,
      pickup: clearPickup ? null : (pickup ?? this.pickup),
      destination: clearDestination ? null : (destination ?? this.destination),
      routePoints: clearRoute ? const [] : (routePoints ?? this.routePoints),
      routeError: clearRouteError ? null : (routeError ?? this.routeError),
      locationMessage: clearLocationMessage
          ? null
          : (locationMessage ?? this.locationMessage),
      isResolvingLocation: isResolvingLocation ?? this.isResolvingLocation,
      isResolvingRoute: isResolvingRoute ?? this.isResolvingRoute,
    );
  }
}
