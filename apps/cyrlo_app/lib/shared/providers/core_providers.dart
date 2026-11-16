import 'package:flutter_riverpod/flutter_riverpod.dart';

import '../../core/config/app_config.dart';
import '../../core/demo/demo_mode_provider.dart';
import '../../core/network/api_client.dart';
import '../../core/services/realtime_client.dart';
import '../../features/auth/application/auth_session.dart';

/// Stable HTTP client. Must not watch auth/demo during create — that loops with
/// [authSessionProvider] (adopt/save also read this provider).
final apiClientProvider = Provider<ApiClient>((ref) {
  final client = ApiClient(baseUrl: AppConfig.apiBaseUrl);
  // Late-bound so 401s rotate via the single-flight refresh (never parallel reuse).
  client.onUnauthorized =
      () => ref.read(authSessionProvider.notifier).tryRefresh(reason: 'api_401');
  ref.onDispose(client.dio.close);
  return client;
});

/// Applies Demo Mode + bearer token onto the existing [ApiClient] instance.
/// Kept outside [apiClientProvider] so toggling demo never recreates Dio and
/// never creates an auth ↔ client circular dependency.
final apiClientHeadersBinderProvider = Provider<void>((ref) {
  final client = ref.watch(apiClientProvider);
  client.setDemoMode(ref.watch(demoModeProvider));
  client.setAccessToken(ref.watch(authSessionProvider)?.accessToken);
});

final realtimeClientProvider = Provider<RealtimeClient>((ref) {
  final client = RealtimeClient(socketUrl: AppConfig.socketUrl);
  ref.onDispose(client.disconnect);
  return client;
});
