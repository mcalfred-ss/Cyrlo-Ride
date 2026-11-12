import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';

import 'core/constants/app_colors.dart';
import 'core/routing/app_router.dart';
import 'core/theme/cyrlo_theme.dart';
import 'core/theme/theme_mode_provider.dart';
import 'passenger_app/map/application/passenger_booking_recovery.dart';
import 'shared/providers/core_providers.dart';
import 'shared/providers/realtime_session.dart';
import 'shared/push/push_lifecycle.dart';

class CyrloApp extends ConsumerWidget {
  const CyrloApp({super.key});

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    ref.watch(apiClientProvider);
    ref.watch(realtimeClientProvider);
    ref.watch(realtimeSessionProvider);
    ref.watch(passengerBookingRecoveryProvider);
    ref.watch(pushLifecycleProvider);
    final router = ref.watch(appRouterProvider);
    final themePreference = ref.watch(themePreferenceProvider);
    return MaterialApp.router(
      title: 'Cyrlo Ride',
      debugShowCheckedModeBanner: false,
      theme: CyrloTheme.light,
      darkTheme: CyrloTheme.dark,
      themeMode: themePreference.themeMode,
      routerConfig: router,
      builder: (context, child) {
        final brightness = Theme.of(context).brightness;
        AppColors.applyBrightness(brightness);
        // Rebuild after AppColors syncs so dark/light tokens match the theme.
        return KeyedSubtree(
          key: ValueKey(brightness),
          child: child ?? const SizedBox.shrink(),
        );
      },
    );
  }
}
