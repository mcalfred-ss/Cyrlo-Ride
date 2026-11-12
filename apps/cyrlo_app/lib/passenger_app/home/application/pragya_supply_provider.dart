import 'dart:async';

import 'package:flutter_riverpod/flutter_riverpod.dart';

import '../../../core/mapping/device_location_gateway.dart';
import '../../../core/mapping/mapping_providers.dart';
import '../../../features/auth/application/auth_session.dart';
import '../../../features/bookings/data/bookings_api.dart';
import '../../../shared/models/geo_point.dart';
import '../../map/application/trip_pin_controller.dart';

class PragyaSupplyState {
  const PragyaSupplyState({
    this.available = false,
    this.count = 0,
    this.isLoading = true,
  });

  final bool available;
  final int count;
  final bool isLoading;

  PragyaSupplyState copyWith({
    bool? available,
    int? count,
    bool? isLoading,
  }) {
    return PragyaSupplyState(
      available: available ?? this.available,
      count: count ?? this.count,
      isLoading: isLoading ?? this.isLoading,
    );
  }
}

/// Whether an online Pragya can be matched near the passenger pickup.
final pragyaSupplyProvider =
    NotifierProvider<PragyaSupplyController, PragyaSupplyState>(
  PragyaSupplyController.new,
);

class PragyaSupplyController extends Notifier<PragyaSupplyState> {
  static const _pollInterval = Duration(seconds: 25);

  Timer? _poll;

  @override
  PragyaSupplyState build() {
    ref.onDispose(() => _poll?.cancel());
    ref.listen<AuthSession?>(authSessionProvider, (previous, next) {
      if (next == null) {
        _poll?.cancel();
        state = const PragyaSupplyState(isLoading: false);
        return;
      }
      unawaited(refresh());
    });
    ref.listen(tripPinProvider, (previous, next) {
      if (previous?.pickup != next.pickup) unawaited(refresh());
    });
    Future.microtask(refresh);
    _poll = Timer.periodic(_pollInterval, (_) => unawaited(refresh()));
    return const PragyaSupplyState();
  }

  Future<void> refresh() async {
    final session = ref.read(authSessionProvider);
    if (session == null) {
      state = const PragyaSupplyState(isLoading: false);
      return;
    }

    final pickup = await _resolveProbePoint();
    if (!ref.mounted) return;
    if (pickup == null) {
      state = const PragyaSupplyState(isLoading: false);
      return;
    }

    try {
      final supply = await ref.read(bookingsApiProvider).matchingSupply(
            accessToken: session.accessToken,
            pickup: pickup,
          );
      if (!ref.mounted) return;
      state = PragyaSupplyState(
        available: supply.available,
        count: supply.count,
        isLoading: false,
      );
    } catch (_) {
      if (!ref.mounted) return;
      // Fail closed: hide Book when supply cannot be confirmed.
      state = const PragyaSupplyState(isLoading: false);
    }
  }

  /// Prefer the chosen pickup pin; otherwise GPS (without moving the pin).
  Future<GeoPoint?> _resolveProbePoint() async {
    final pinned = ref.read(tripPinProvider).pickup;
    if (pinned != null && pinned.isValid) return pinned;

    final result = await ref.read(deviceLocationGatewayProvider).current();
    if (!ref.mounted) return null;
    if (result.status == DeviceLocationStatus.fix &&
        result.point != null &&
        result.point!.isValid) {
      return result.point;
    }
    return null;
  }
}
