import '../../features/auth/application/signup_draft.dart';
import '../../passenger_app/home/domain/nearby_rider.dart';
import '../../shared/models/geo_point.dart';

/// Synthetic Pragya pins for investor map theater (Demo Mode only).
List<NearbyRider> buildDemoNearbyRiders(GeoPoint pickup) {
  const offsets = <(double, double, String, double, int)>[
    (0.0042, 0.0018, 'Ama (Demo)', 4.8, 3),
    (-0.0031, 0.0026, 'Kofi (Demo)', 4.6, 5),
    (0.0024, -0.0038, 'Abena (Demo)', 4.9, 2),
    (-0.0016, -0.0022, 'Yaw (Demo)', 4.5, 4),
    (0.0051, -0.0011, 'Efua (Demo)', 4.7, 6),
  ];

  return [
    for (var i = 0; i < offsets.length; i++)
      NearbyRider(
        id: 'demo-rider-${i + 1}',
        kind: DriverKind.pragya,
        etaMinutes: offsets[i].$5,
        point: GeoPoint(
          latitude: pickup.latitude + offsets[i].$1,
          longitude: pickup.longitude + offsets[i].$2,
        ),
        displayName: offsets[i].$3,
        rating: offsets[i].$4,
        reviewCount: 12 + i * 3,
        gender: i.isEven ? PassengerGender.female : PassengerGender.male,
        available: true,
        busy: false,
      ),
  ];
}

/// Merge live supply first; fill with demo pins so the map looks alive.
List<NearbyRider> mergeDemoNearbyRiders({
  required List<NearbyRider> live,
  required GeoPoint pickup,
  required bool demoMode,
}) {
  if (!demoMode) return live;
  final demo = buildDemoNearbyRiders(pickup);
  if (live.isEmpty) return demo;
  final liveIds = {for (final r in live) r.id};
  return [
    ...live,
    for (final r in demo)
      if (!liveIds.contains(r.id)) r,
  ];
}
