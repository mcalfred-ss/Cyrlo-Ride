import 'package:cyrlo_maps/cyrlo_maps.dart';

/// Ride-owned [MapProject] values. Booking and matching stay out of this file.
///
/// Built here instead of importing `cyrlo_ride_maps` so this app keeps its own
/// package name and does not pull the extracted Cirlo user-agents or school asset.
abstract final class RideMapProjects {
  static const String passengerUserAgent = 'com.cyrloride.app';

  /// Kumasi center until a GPS fix is available. Matches the pilot region.
  static const MapCoordinate defaultCenter = MapCoordinate(
    latitude: 6.6885,
    longitude: -1.6244,
  );

  static const MapStyleSet styles = MapStyleSet(
    darkStyleId: 'dark-v11',
    lightStyleId: 'streets-v12',
    defaultIsDark: false,
  );

  static MapProject passengerRequest() {
    return const MapProject(
      id: 'cyrlo_ride.passenger_request',
      initialCamera: MapCamera(center: defaultCenter, zoom: 14),
      styles: styles,
      userAgentPackageName: passengerUserAgent,
      missingTokenPolicy: MissingTokenPolicy.cartoFallback,
      locationTrackingEnabled: true,
      navigationEnabled: true,
    );
  }

  static MapProject liveTrip() {
    return const MapProject(
      id: 'cyrlo_ride.live_trip',
      initialCamera: MapCamera(center: defaultCenter, zoom: 13.5),
      styles: styles,
      userAgentPackageName: passengerUserAgent,
      missingTokenPolicy: MissingTokenPolicy.offlineCanvas,
      navigationEnabled: true,
    );
  }
}
