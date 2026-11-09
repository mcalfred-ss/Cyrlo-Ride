import 'package:flutter_riverpod/flutter_riverpod.dart';

import '../../../features/auth/application/signup_draft.dart';
import '../../../shared/models/geo_point.dart';
import '../domain/nearby_rider.dart';

/// Preview nearby supply around Kumasi center until live location APIs are wired.
/// Coordinates sit on/near major streets so top-down markers read as “on the road.”
final nearbyRidersProvider = Provider<List<NearbyRider>>((ref) {
  return const [
    NearbyRider(
      id: 'preview-okada-1',
      kind: DriverKind.okada,
      etaMinutes: 3,
      point: GeoPoint(latitude: 6.6902, longitude: -1.6231),
      displayName: 'Kofi M.',
      gender: PassengerGender.male,
      rating: 4.8,
      reviewCount: 126,
      phoneE164: '+233240000001',
    ),
    NearbyRider(
      id: 'preview-pragya-1',
      kind: DriverKind.pragya,
      etaMinutes: 5,
      point: GeoPoint(latitude: 6.6871, longitude: -1.6260),
      displayName: 'Ama S.',
      gender: PassengerGender.female,
      rating: 4.7,
      reviewCount: 89,
      phoneE164: '+233240000002',
    ),
    NearbyRider(
      id: 'preview-aboboyaa-1',
      kind: DriverKind.aboboyaa,
      etaMinutes: 7,
      point: GeoPoint(latitude: 6.6894, longitude: -1.6278),
      displayName: 'Yaw B.',
      gender: PassengerGender.male,
      rating: 4.5,
      reviewCount: 41,
      available: false,
      phoneE164: '+233240000003',
    ),
    NearbyRider(
      id: 'preview-okada-2',
      kind: DriverKind.okada,
      etaMinutes: 4,
      point: GeoPoint(latitude: 6.6860, longitude: -1.6220),
      displayName: 'Kwesi A.',
      gender: PassengerGender.male,
      rating: 4.9,
      reviewCount: 210,
      phoneE164: '+233240000004',
    ),
    NearbyRider(
      id: 'preview-pragya-2',
      kind: DriverKind.pragya,
      etaMinutes: 6,
      point: GeoPoint(latitude: 6.6915, longitude: -1.6255),
      displayName: 'Efua T.',
      gender: PassengerGender.female,
      rating: 4.6,
      reviewCount: 73,
      phoneE164: '+233240000005',
    ),
    NearbyRider(
      id: 'preview-okada-3',
      kind: DriverKind.okada,
      etaMinutes: 2,
      point: GeoPoint(latitude: 6.6888, longitude: -1.6210),
      displayName: 'Nana K.',
      gender: PassengerGender.male,
      rating: 4.4,
      reviewCount: 38,
      busy: true,
      phoneE164: '+233240000006',
    ),
  ];
});

final nearbyRiderByIdProvider = Provider.family<NearbyRider?, String>((ref, id) {
  for (final rider in ref.watch(nearbyRidersProvider)) {
    if (rider.id == id) return rider;
  }
  return null;
});

final selectedNearbyRiderProvider =
    NotifierProvider<SelectedNearbyRider, NearbyRider?>(SelectedNearbyRider.new);

class SelectedNearbyRider extends Notifier<NearbyRider?> {
  @override
  NearbyRider? build() => null;

  void select(NearbyRider rider) => state = rider;

  void clear() => state = null;
}
