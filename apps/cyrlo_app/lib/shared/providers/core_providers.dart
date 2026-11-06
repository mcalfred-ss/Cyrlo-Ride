import 'package:flutter_riverpod/flutter_riverpod.dart';

import '../../core/config/app_config.dart';
import '../../core/network/api_client.dart';
import '../../core/services/realtime_client.dart';

final apiClientProvider = Provider<ApiClient>((ref) {
  final client = ApiClient(baseUrl: AppConfig.apiBaseUrl);
  ref.onDispose(client.dio.close);
  return client;
});

final realtimeClientProvider = Provider<RealtimeClient>((ref) {
  final client = RealtimeClient(socketUrl: AppConfig.socketUrl);
  ref.onDispose(client.disconnect);
  return client;
});
