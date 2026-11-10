import 'dart:async';

import 'package:flutter_riverpod/flutter_riverpod.dart';

import '../../../core/errors/api_exception.dart';
import '../../../core/mapping/mapping_providers.dart';
import '../../../features/auth/application/auth_session.dart';
import '../../ops/rider_ops_api.dart';

/// Rider starts offline and must tap Go online before job offers appear.
final riderOnlineProvider =
    NotifierProvider<RiderAvailabilityController, bool>(
  RiderAvailabilityController.new,
);

class RiderAvailabilityController extends Notifier<bool> {
  Timer? _gpsTimer;

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
    await _publishLocation(session.accessToken);
    await ref.read(riderOpsApiProvider).setAvailability(
          accessToken: session.accessToken,
          online: true,
        );
    state = true;
    _gpsTimer?.cancel();
    _gpsTimer = Timer.periodic(const Duration(seconds: 20), (_) {
      unawaited(_publishLocation(session.accessToken));
    });
  }

  Future<void> goOffline() async {
    final session = ref.read(authSessionProvider);
    _gpsTimer?.cancel();
    _gpsTimer = null;
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

  Future<void> _publishLocation(String accessToken) async {
    final fix = await ref.read(deviceLocationGatewayProvider).current();
    if (!fix.hasFix || fix.point == null) {
      throw const ApiException(
        code: 'LOCATION_REQUIRED',
        message: 'Turn on location to go online.',
      );
    }
    await ref.read(riderOpsApiProvider).publishLocation(
          accessToken: accessToken,
          point: fix.point!,
          accuracyMeters: fix.accuracyMeters,
        );
  }
}
