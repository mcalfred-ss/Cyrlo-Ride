import 'package:flutter_riverpod/flutter_riverpod.dart';

import '../../features/auth/application/auth_session.dart';
import 'push_messaging.dart';

/// Starts FCM registration when a session appears; no-op when Firebase isn't configured.
final pushLifecycleProvider = Provider<void>((ref) {
  ref.listen<AuthSession?>(authSessionProvider, (previous, next) {
    if (next == null) return;
    if (previous?.accessToken == next.accessToken && previous != null) return;
    Future.microtask(
      () => ref.read(pushMessagingControllerProvider).startAfterAuth(),
    );
  });

  final session = ref.read(authSessionProvider);
  if (session != null) {
    Future.microtask(
      () => ref.read(pushMessagingControllerProvider).startAfterAuth(),
    );
  }
});
