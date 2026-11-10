import 'dart:async';

import 'package:flutter_riverpod/flutter_riverpod.dart';

import '../../../shared/models/loadable_list.dart';
import '../domain/nearby_rider.dart';

/// Live nearby supply will come from rider location / matching APIs.
/// Empty until the client is wired to those endpoints — no demo pins.
final nearbyRidersProvider =
    NotifierProvider<NearbyRidersController, LoadableList<NearbyRider>>(
  NearbyRidersController.new,
);

class NearbyRidersController extends Notifier<LoadableList<NearbyRider>> {
  @override
  LoadableList<NearbyRider> build() {
    Future.microtask(_finishInitialLoad);
    return const LoadableList(isLoading: true);
  }

  Future<void> _finishInitialLoad() async {
    // Brief hydrate so Home shows skeleton instead of flashing empty.
    await Future<void>.delayed(const Duration(milliseconds: 280));
    if (!ref.mounted) return;
    state = const LoadableList(isLoading: false);
  }

  void replaceAll(List<NearbyRider> riders) {
    state = LoadableList(items: riders, isLoading: false);
  }
}

final nearbyRiderByIdProvider = Provider.family<NearbyRider?, String>((ref, id) {
  for (final rider in ref.watch(nearbyRidersProvider).items) {
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
