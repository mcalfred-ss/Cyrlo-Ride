import 'dart:async';

import 'package:flutter_riverpod/flutter_riverpod.dart';

import '../../../core/errors/api_exception.dart';
import '../../../core/mapping/device_location_gateway.dart';
import '../../../core/mapping/mapping_providers.dart';
import '../../../features/auth/application/auth_session.dart';
import '../../ops/rider_ops_api.dart';

/// Rider starts offline and must tap Go online before job offers appear.
///
/// While AVAILABLE, GPS is published on an interval shorter than the backend
/// 30s freshness window. Reporting stops when the rider goes offline.
final riderOnlineProvider =
    NotifierProvider<RiderAvailabilityController, bool>(
  RiderAvailabilityController.new,
);

class RiderAvailabilityController extends Notifier<bool> {
  Timer? _gpsTimer;
  Future<void>? _publishInFlight;
  var _publishGeneration = 0;

  /// Keep well under RIDER_LOCATION_MAX_AGE_MS (30s) including network latency.
  static const _gpsInterval = Duration(seconds: 15);

  @override
  bool build() {
    ref.onDispose(() {
      _gpsTimer?.cancel();
      _gpsTimer = null;
    });
    return false;
  }

  Future<void> goOnline() async {
    final session = ref.read(authSessionProvider);
    if (session == null) {
      throw const ApiException(
        code: 'UNAUTHORIZED',
        message: 'Sign in again to go online.',
      );
    }
    await _publishLocation(session.accessToken, required: true);
    await ref.read(riderOpsApiProvider).setAvailability(
          accessToken: session.accessToken,
          online: true,
        );
    state = true;
    _startGpsLoop(session.accessToken);
  }

  Future<void> goOffline() async {
    final session = ref.read(authSessionProvider);
    final generation = ++_publishGeneration;
    _gpsTimer?.cancel();
    _gpsTimer = null;
    // Wait for any in-flight publish to finish before stop-sharing.
    final inFlight = _publishInFlight;
    if (inFlight != null) {
      try {
        await inFlight;
      } catch (_) {}
    }
    if (generation != _publishGeneration) return;
    if (session != null) {
      try {
        await ref.read(riderOpsApiProvider).setAvailability(
              accessToken: session.accessToken,
              online: false,
            );
        await ref
            .read(riderOpsApiProvider)
            .stopSharingLocation(session.accessToken);
      } catch (_) {
        // Still flip local state so the rider can leave the online UI.
      }
    }
    state = false;
  }

  void setOnline(bool online) {
    if (online) {
      unawaited(goOnline());
    } else {
      unawaited(goOffline());
    }
  }

  void _startGpsLoop(String accessToken) {
    _gpsTimer?.cancel();
    _gpsTimer = Timer.periodic(_gpsInterval, (_) {
      if (!state) return;
      unawaited(_publishLocation(accessToken, required: false));
    });
  }

  Future<void> _publishLocation(
    String accessToken, {
    required bool required,
  }) async {
    if (_publishInFlight != null) {
      // Avoid overlapping GPS→API requests (battery + rate-limit friendly).
      if (required) await _publishInFlight;
      return;
    }
    final generation = _publishGeneration;
    final future = _doPublish(accessToken, required: required);
    _publishInFlight = future;
    try {
      await future;
    } finally {
      if (identical(_publishInFlight, future)) {
        _publishInFlight = null;
      }
    }
    if (generation != _publishGeneration) return;
  }

  Future<void> _doPublish(
    String accessToken, {
    required bool required,
  }) async {
    final fix = await ref.read(deviceLocationGatewayProvider).current();
    if (fix.status == DeviceLocationStatus.denied ||
        fix.status == DeviceLocationStatus.serviceDisabled ||
        fix.status == DeviceLocationStatus.unavailable ||
        !fix.hasFix ||
        fix.point == null ||
        !fix.point!.isValid) {
      if (required) {
        final message = switch (fix.status) {
          DeviceLocationStatus.denied =>
            'Location permission was denied. Enable it in settings to go online.',
          DeviceLocationStatus.serviceDisabled =>
            'Location services are off. Turn them on to go online.',
          _ => 'Could not read a valid GPS fix. Try again outdoors.',
        };
        throw ApiException(code: 'LOCATION_REQUIRED', message: message);
      }
      return;
    }

    try {
      await ref.read(riderOpsApiProvider).publishLocation(
            accessToken: accessToken,
            point: fix.point!,
            accuracyMeters: fix.accuracyMeters,
          );
    } catch (_) {
      if (required) rethrow;
      // Soft-fail on background ticks — network blips must not force offline.
    }
  }
}
