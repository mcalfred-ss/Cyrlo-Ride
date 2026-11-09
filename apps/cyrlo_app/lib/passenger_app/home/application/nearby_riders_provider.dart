import 'package:flutter_riverpod/flutter_riverpod.dart';

import '../domain/nearby_rider.dart';

/// Live nearby supply will come from rider location / matching APIs.
/// Empty until the client is wired to those endpoints — no demo pins.
final nearbyRidersProvider = Provider<List<NearbyRider>>((ref) {
  return const [];
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
