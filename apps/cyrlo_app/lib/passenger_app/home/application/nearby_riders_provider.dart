import 'dart:async';

import 'package:flutter_riverpod/flutter_riverpod.dart';

import '../../../features/auth/application/auth_session.dart';
import '../../../shared/models/geo_point.dart';
import '../../map/application/passenger_trip_plan.dart';
import '../../map/application/trip_pin_controller.dart';
import '../data/nearby_riders_api.dart';
import '../domain/nearby_rider.dart';

class NearbyRidersState {
  const NearbyRidersState({
    this.items = const [],
    this.isLoading = false,
    this.inServiceArea = true,
    this.message,
    this.errorMessage,
  });

  final List<NearbyRider> items;
  final bool isLoading;
  final bool inServiceArea;
  final String? message;
  final String? errorMessage;

  bool get isEmpty => items.isEmpty;
  bool get isNotEmpty => items.isNotEmpty;

  NearbyRidersState copyWith({
    List<NearbyRider>? items,
    bool? isLoading,
    bool? inServiceArea,
    String? message,
    String? errorMessage,
    bool clearMessage = false,
    bool clearError = false,
  }) {
    return NearbyRidersState(
      items: items ?? this.items,
      isLoading: isLoading ?? this.isLoading,
      inServiceArea: inServiceArea ?? this.inServiceArea,
      message: clearMessage ? null : (message ?? this.message),
      errorMessage: clearError ? null : (errorMessage ?? this.errorMessage),
    );
  }
}

/// Live nearby supply from POST /matching/nearby (approximate coords only).
final nearbyRidersProvider =
    NotifierProvider<NearbyRidersController, NearbyRidersState>(
  NearbyRidersController.new,
);

class NearbyRidersController extends Notifier<NearbyRidersState> {
  Timer? _poll;
  Future<void>? _inFlight;
  GeoPoint? _lastPickup;

  static const _pollInterval = Duration(seconds: 12);

  @override
  NearbyRidersState build() {
    ref.onDispose(() {
      _poll?.cancel();
      _poll = null;
    });

    void onPickup(GeoPoint? pickup) {
      if (pickup == null || !pickup.isValid) {
        _poll?.cancel();
        _poll = null;
        _lastPickup = null;
        state = const NearbyRidersState(
          message: 'Set a pickup to see nearby riders.',
        );
        return;
      }
      if (_lastPickup != pickup) {
        _lastPickup = pickup;
        unawaited(refresh());
      }
      _ensurePoll();
    }

    ref.listen(passengerTripPlanProvider, (_, next) => onPickup(next.pickup));
    ref.listen(tripPinProvider, (_, next) => onPickup(next.pickup));

    final pickup = ref.read(passengerTripPlanProvider).pickup ??
        ref.read(tripPinProvider).pickup;
    if (pickup != null && pickup.isValid) {
      _lastPickup = pickup;
      Future.microtask(refresh);
      _ensurePoll();
    }

    return const NearbyRidersState(isLoading: true);
  }

  void _ensurePoll() {
    _poll ??= Timer.periodic(_pollInterval, (_) {
      unawaited(refresh());
    });
  }

  Future<void> refresh() async {
    final session = ref.read(authSessionProvider);
    final pickup = ref.read(passengerTripPlanProvider).pickup ??
        ref.read(tripPinProvider).pickup;
    if (session == null || pickup == null || !pickup.isValid) {
      state = const NearbyRidersState(
        message: 'Set a pickup to see nearby riders.',
      );
      return;
    }
    if (_inFlight != null) return;
    final future = _load(session.accessToken, pickup);
    _inFlight = future;
    try {
      await future;
    } finally {
      if (identical(_inFlight, future)) _inFlight = null;
    }
  }

  Future<void> _load(String accessToken, GeoPoint pickup) async {
    if (state.items.isEmpty) {
      state = state.copyWith(isLoading: true, clearError: true);
    }
    try {
      final result = await ref.read(nearbyRidersApiProvider).discover(
            accessToken: accessToken,
            pickup: pickup,
          );
      final message = !result.inServiceArea
          ? 'Pickup is outside the active service area.'
          : result.riders.isEmpty
              ? 'No eligible riders nearby right now.'
              : null;
      state = NearbyRidersState(
        items: result.riders,
        isLoading: false,
        inServiceArea: result.inServiceArea,
        message: message,
      );
    } catch (_) {
      state = state.copyWith(
        isLoading: false,
        errorMessage: 'Could not refresh nearby riders. Trying again…',
      );
    }
  }

  void replaceAll(List<NearbyRider> riders) {
    state = NearbyRidersState(items: riders, isLoading: false);
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
