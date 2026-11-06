import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';

import 'core/constants/app_colors.dart';
import 'core/routing/app_router.dart';
import 'core/theme/cyrlo_theme.dart';
import 'shared/providers/core_providers.dart';

class CyrloApp extends ConsumerWidget {
  const CyrloApp({super.key});

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    ref.watch(apiClientProvider);
    ref.watch(realtimeClientProvider);
    final router = ref.watch(appRouterProvider);
    return MaterialApp.router(
      title: 'Cyrlo Ride',
      debugShowCheckedModeBanner: false,
      theme: CyrloTheme.light,
      darkTheme: CyrloTheme.dark,
      themeMode: ThemeMode.light,
      routerConfig: router,
      builder: (context, child) {
        AppColors.applyBrightness(Theme.of(context).brightness);
        return child ?? const SizedBox.shrink();
      },
    );
  }
}
