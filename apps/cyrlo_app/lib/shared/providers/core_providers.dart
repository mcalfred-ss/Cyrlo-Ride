import 'package:flutter_riverpod/flutter_riverpod.dart';

import '../../core/config/app_config.dart';
import '../../core/demo/demo_mode_provider.dart';
import '../../core/network/api_client.dart';
import '../../core/services/realtime_client.dart';
import '../../features/auth/application/auth_session.dart';

final apiClientProvider = Provider<ApiClient>((ref) {
  final client = ApiClient(baseUrl: AppConfig.apiBaseUrl);
  // Late-bound so 401s rotate via the single-flight refresh (never parallel reuse).
  client.onUnauthorized =
      () => ref.read(authSessionProvider.notifier).tryRefresh(reason: 'api_401');
  // Keep the current session header on this instance — Demo Mode must not
  // recreate a bare client and blank Mapbox tiles via unauth /maps/config.
  final session = ref.read(authSessionProvider);
  client.setAccessToken(session?.accessToken);
  client.setDemoMode(ref.read(demoModeProvider));
  ref.listen<bool>(demoModeProvider, (_, enabled) {
    client.setDemoMode(enabled);
  });
  ref.listen<AuthSession?>(authSessionProvider, (_, next) {
    client.setAccessToken(next?.accessToken);
  });
  ref.onDispose(client.dio.close);
  return client;
});

final realtimeClientProvider = Provider<RealtimeClient>((ref) {
  final client = RealtimeClient(socketUrl: AppConfig.socketUrl);
  ref.onDispose(client.disconnect);
  return client;
});
