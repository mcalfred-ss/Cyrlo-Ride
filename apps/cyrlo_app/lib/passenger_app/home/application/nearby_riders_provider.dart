import 'package:flutter_riverpod/flutter_riverpod.dart';

import '../../../features/auth/application/signup_draft.dart';
import '../../../shared/models/geo_point.dart';
import '../domain/nearby_rider.dart';

/// Demo nearby supply until live matching lands. Sorted closest-first like Bolt.
final nearbyRidersProvider = Provider<List<NearbyRider>>((ref) {
  return const [
    NearbyRider(
      id: 'nearby-pragya-1',
      kind: DriverKind.pragya,
      etaMinutes: 2,
      point: GeoPoint(latitude: 6.6902, longitude: -1.6218),
      phoneE164: '+233244111222',
    ),
    NearbyRider(
      id: 'nearby-okada-1',
      kind: DriverKind.okada,
      etaMinutes: 4,
      point: GeoPoint(latitude: 6.6861, longitude: -1.6279),
      phoneE164: '+233244333444',
    ),
    NearbyRider(
      id: 'nearby-pragya-2',
      kind: DriverKind.pragya,
      etaMinutes: 6,
      point: GeoPoint(latitude: 6.6938, longitude: -1.6184),
      phoneE164: '+233244555666',
    ),
    NearbyRider(
      id: 'nearby-okada-2',
      kind: DriverKind.okada,
      etaMinutes: 8,
      point: GeoPoint(latitude: 6.6824, longitude: -1.6312),
      phoneE164: '+233244777888',
    ),
    NearbyRider(
      id: 'nearby-aboboyaa-1',
      kind: DriverKind.aboboyaa,
      etaMinutes: 11,
      point: GeoPoint(latitude: 6.6975, longitude: -1.6151),
      available: false,
    ),
  ];
});

final selectedNearbyRiderProvider =
    NotifierProvider<SelectedNearbyRider, NearbyRider?>(SelectedNearbyRider.new);

class SelectedNearbyRider extends Notifier<NearbyRider?> {
  @override
  NearbyRider? build() => null;

  void select(NearbyRider rider) => state = rider;

  void clear() => state = null;
}
