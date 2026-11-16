import 'dart:async';

import 'package:flutter_riverpod/flutter_riverpod.dart';

import '../../../core/demo/demo_mode_provider.dart';
import '../../../core/demo/demo_nearby_riders.dart';
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
  static const _demoPilotPickup = GeoPoint(
    latitude: demoPilotLatitude,
    longitude: demoPilotLongitude,
  );

  @override
  NearbyRidersState build() {
    ref.onDispose(() {
      _poll?.cancel();
      _poll = null;
    });

    void onPickup(GeoPoint? pickup) {
      final demoMode = ref.read(demoModeProvider);
      final effective = _effectivePickup(
        pinned: pickup,
        demoMode: demoMode,
      );
      if (effective == null) {
        _poll?.cancel();
        _poll = null;
        _lastPickup = null;
        state = const NearbyRidersState(
          message: 'Set a pickup to see nearby riders.',
        );
        return;
      }
      if (_lastPickup != effective) {
        _lastPickup = effective;
        unawaited(refresh());
      }
      _ensurePoll();
    }

    ref.listen(passengerTripPlanProvider, (_, next) => onPickup(next.pickup));
    ref.listen(tripPinProvider, (_, next) => onPickup(next.pickup));
    ref.listen(demoModeProvider, (previous, next) {
      if (next) _seedDemoPickupIfNeeded();
      unawaited(refresh());
    });

    final demoMode = ref.read(demoModeProvider);
    if (demoMode) _seedDemoPickupIfNeeded();
    final pickup = _effectivePickup(
      pinned: ref.read(passengerTripPlanProvider).pickup ??
          ref.read(tripPinProvider).pickup,
      demoMode: demoMode,
    );
    if (pickup != null) {
      _lastPickup = pickup;
      Future.microtask(refresh);
      _ensurePoll();
      if (demoMode) {
        return NearbyRidersState(
          items: buildDemoNearbyRiders(pickup),
          isLoading: false,
          inServiceArea: true,
          message: 'Demo riders nearby — book to match a live rider phone.',
        );
      }
      return const NearbyRidersState(isLoading: true);
    }

    // No pickup yet — never leave the home list spinning forever.
    return const NearbyRidersState(
      message: 'Set a pickup to see nearby riders.',
    );
  }

  void _ensurePoll() {
    _poll ??= Timer.periodic(_pollInterval, (_) {
      unawaited(refresh());
    });
  }

  GeoPoint? _effectivePickup({
    required GeoPoint? pinned,
    required bool demoMode,
  }) {
    if (pinned != null && pinned.isValid) return pinned;
    if (demoMode) return _demoPilotPickup;
    return null;
  }

  /// Investor pitch: seed Kokobin so Home/Map show riders without waiting on GPS.
  void _seedDemoPickupIfNeeded() {
    final pinned = ref.read(tripPinProvider).pickup;
    if (pinned != null && pinned.isValid) return;
    ref.read(tripPinProvider.notifier).seedPickup(
          _demoPilotPickup,
          message: 'Demo Mode pickup set to the Kokobin pilot area.',
        );
  }

  Future<void> refresh() async {
    final session = ref.read(authSessionProvider);
    final demoMode = ref.read(demoModeProvider);
    if (demoMode) _seedDemoPickupIfNeeded();
    final pickup = _effectivePickup(
      pinned: ref.read(passengerTripPlanProvider).pickup ??
          ref.read(tripPinProvider).pickup,
      demoMode: demoMode,
    );
    if (session == null || pickup == null) {
      state = NearbyRidersState(
        items: demoMode ? buildDemoNearbyRiders(_demoPilotPickup) : const [],
        isLoading: false,
        inServiceArea: demoMode,
        message: demoMode
            ? 'Demo riders nearby — book to match a live rider phone.'
            : 'Set a pickup to see nearby riders.',
      );
      return;
    }
    if (_inFlight != null) return;
    final future = _load(session.accessToken, pickup, demoMode: demoMode);
    _inFlight = future;
    try {
      await future;
    } finally {
      if (identical(_inFlight, future)) _inFlight = null;
    }
  }

  Future<void> _load(
    String accessToken,
    GeoPoint pickup, {
    required bool demoMode,
  }) async {
    if (demoMode) {
      // Show theater riders immediately so Home never stays on skeletons.
      state = NearbyRidersState(
        items: buildDemoNearbyRiders(pickup),
        isLoading: false,
        inServiceArea: true,
        message: 'Demo riders nearby — book to match a live rider phone.',
      );
    } else if (state.items.isEmpty) {
      state = state.copyWith(isLoading: true, clearError: true);
    }
    try {
      final result = await ref.read(nearbyRidersApiProvider).discover(
            accessToken: accessToken,
            pickup: pickup,
          );
      final riders = mergeDemoNearbyRiders(
        live: result.riders,
        pickup: pickup,
        demoMode: demoMode,
      );
      final message = !result.inServiceArea && !demoMode
          ? 'Pickup is outside the active service area.'
          : riders.isEmpty
              ? 'No eligible riders nearby right now.'
              : demoMode && result.riders.isEmpty
                  ? 'Demo riders nearby — book to match a live rider phone.'
                  : null;
      state = NearbyRidersState(
        items: riders,
        isLoading: false,
        inServiceArea: result.inServiceArea || demoMode,
        message: message,
      );
    } catch (_) {
      if (demoMode) {
        final riders = buildDemoNearbyRiders(pickup);
        state = NearbyRidersState(
          items: riders,
          isLoading: false,
          inServiceArea: true,
          message: 'Demo riders nearby — book to match a live rider phone.',
        );
        return;
      }
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
