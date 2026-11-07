import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:go_router/go_router.dart';

import '../../core/constants/app_colors.dart';
import '../../core/theme/app_radii.dart';
import '../../core/theme/app_spacing.dart';
import '../../features/auth/application/signup_controller.dart';
import '../../features/auth/application/signup_draft.dart';
import 'centered_frame.dart';
import 'cyrlo_button.dart';

class RoleShell extends StatelessWidget {
  const RoleShell({
    super.key,
    required this.navigationShell,
    required this.destinations,
  });

  final StatefulNavigationShell navigationShell;
  final List<NavigationDestination> destinations;

  @override
  Widget build(BuildContext context) {
    return Scaffold(
      backgroundColor: AppColors.background,
      body: CenteredFrame(
        margin: 0,
        child: Column(
          children: [
            Expanded(child: navigationShell),
            Padding(
              padding: const EdgeInsets.fromLTRB(16, 8, 16, 12),
              child: DecoratedBox(
                decoration: BoxDecoration(
                  color: AppColors.darkGrey,
                  borderRadius: BorderRadius.circular(30),
                  boxShadow: [
                    BoxShadow(
                      color: AppColors.elevationShadow(lightAlpha: 0.1),
                      blurRadius: 22,
                      offset: const Offset(0, 10),
                    ),
                  ],
                ),
                child: ClipRRect(
                  borderRadius: BorderRadius.circular(30),
                  child: NavigationBar(
                    selectedIndex: navigationShell.currentIndex,
                    onDestinationSelected: (index) {
                      navigationShell.goBranch(
                        index,
                        initialLocation: index == navigationShell.currentIndex,
                      );
                    },
                    destinations: destinations,
                  ),
                ),
              ),
            ),
          ],
        ),
      ),
    );
  }
}

class SectionPage extends StatelessWidget {
  const SectionPage({super.key, required this.title, this.subtitle});

  final String title;
  final String? subtitle;

  @override
  Widget build(BuildContext context) {
    final theme = Theme.of(context);
    return SizedBox.expand(
      child: Padding(
        padding: const EdgeInsets.fromLTRB(20, 12, 20, 0),
        child: Column(
          crossAxisAlignment: CrossAxisAlignment.stretch,
          children: [
            Text(
              title,
              style: theme.textTheme.headlineSmall?.copyWith(
                color: AppColors.textPrimary,
                fontWeight: FontWeight.w800,
                letterSpacing: -0.4,
                height: 1.15,
              ),
            ),
            if (subtitle != null) ...[
              const SizedBox(height: 6),
              Text(
                subtitle!,
                style: theme.textTheme.bodyLarge?.copyWith(
                  color: AppColors.textSecondary,
                  fontWeight: FontWeight.w500,
                  height: 1.35,
                ),
              ),
            ],
          ],
        ),
      ),
    );
  }
}

class AccountPage extends ConsumerWidget {
  const AccountPage({super.key, required this.role});

  final RideRole role;

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final draft = ref.watch(signupProvider);
    final theme = Theme.of(context);
    final name = role == RideRole.passenger
        ? (draft.passengerName ?? 'Passenger')
        : (draft.riderName ?? 'Rider');
    final phone = draft.phoneE164 ?? '';
    final roleLabel = role == RideRole.passenger ? 'Passenger' : 'Rider';
    final initials = name
        .trim()
        .split(RegExp(r'\s+'))
        .where((part) => part.isNotEmpty)
        .take(2)
        .map((part) => part[0].toUpperCase())
        .join();

    return SizedBox.expand(
      child: Padding(
        padding: const EdgeInsets.fromLTRB(20, 12, 20, 0),
        child: Column(
          crossAxisAlignment: CrossAxisAlignment.stretch,
          children: [
            Text(
              'Account',
              style: theme.textTheme.headlineSmall?.copyWith(
                color: AppColors.textPrimary,
                fontWeight: FontWeight.w800,
                letterSpacing: -0.4,
                height: 1.15,
              ),
            ),
            const SizedBox(height: 6),
            Text(
              'Your profile on this device.',
              style: theme.textTheme.bodyLarge?.copyWith(
                color: AppColors.textSecondary,
                fontWeight: FontWeight.w500,
                height: 1.35,
              ),
            ),
            const SizedBox(height: AppSpacing.lg),
            Expanded(
              child: ListView(
                children: [
                  DecoratedBox(
                    decoration: BoxDecoration(
                      color: AppColors.surface,
                      borderRadius: BorderRadius.circular(AppRadii.lg),
                      border: Border.all(color: AppColors.border),
                      boxShadow: [
                        BoxShadow(
                          color: AppColors.elevationShadow(lightAlpha: 0.05),
                          blurRadius: 16,
                          offset: const Offset(0, 8),
                        ),
                      ],
                    ),
                    child: Padding(
                      padding: const EdgeInsets.all(AppSpacing.md),
                      child: Row(
                        children: [
                          Container(
                            width: 58,
                            height: 58,
                            alignment: Alignment.center,
                            decoration: BoxDecoration(
                              color: AppColors.yellow,
                              borderRadius: BorderRadius.circular(18),
                            ),
                            child: Text(
                              initials.isEmpty ? 'C' : initials,
                              style: theme.textTheme.titleLarge?.copyWith(
                                color: AppColors.darkGrey,
                                fontWeight: FontWeight.w800,
                              ),
                            ),
                          ),
                          const SizedBox(width: AppSpacing.md),
                          Expanded(
                            child: Column(
                              crossAxisAlignment: CrossAxisAlignment.start,
                              children: [
                                Text(
                                  name,
                                  style: theme.textTheme.titleMedium?.copyWith(
                                    color: AppColors.textPrimary,
                                    fontWeight: FontWeight.w800,
                                  ),
                                ),
                                const SizedBox(height: 4),
                                Text(
                                  phone,
                                  style: theme.textTheme.bodyMedium?.copyWith(
                                    color: AppColors.textSecondary,
                                    fontWeight: FontWeight.w600,
                                  ),
                                ),
                                const SizedBox(height: 8),
                                Container(
                                  padding: const EdgeInsets.symmetric(
                                    horizontal: 10,
                                    vertical: 5,
                                  ),
                                  decoration: BoxDecoration(
                                    color: AppColors.brandLight,
                                    borderRadius:
                                        BorderRadius.circular(AppRadii.pill),
                                  ),
                                  child: Text(
                                    roleLabel,
                                    style: theme.textTheme.labelMedium?.copyWith(
                                      color: AppColors.darkGrey,
                                      fontWeight: FontWeight.w800,
                                    ),
                                  ),
                                ),
                              ],
                            ),
                          ),
                        ],
                      ),
                    ),
                  ),
                  const SizedBox(height: AppSpacing.xl),
                  CyrloButton(
                    key: const Key('sign-out'),
                    label: 'Sign out',
                    variant: CyrloButtonVariant.outlined,
                    onPressed: () => ref.read(signupProvider.notifier).signOut(),
                  ),
                ],
              ),
            ),
          ],
        ),
      ),
    );
  }
}
