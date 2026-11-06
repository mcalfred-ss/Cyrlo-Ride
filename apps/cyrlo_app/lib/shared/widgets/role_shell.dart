import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:go_router/go_router.dart';

import '../../core/constants/app_colors.dart';
import '../../core/theme/app_spacing.dart';
import '../../features/auth/application/signup_controller.dart';
import '../../features/auth/application/signup_draft.dart';
import 'centered_frame.dart';
import 'cyrlo_button.dart';
import 'cyrlo_card.dart';
import 'screen_header.dart';

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
        child: Column(
          children: [
            Expanded(child: navigationShell),
            const SizedBox(height: 12),
            DecoratedBox(
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
          ],
        ),
      ),
    );
  }
}

class SectionPage extends StatelessWidget {
  const SectionPage({super.key, required this.title});

  final String title;

  @override
  Widget build(BuildContext context) {
    return SizedBox.expand(
      child: CyrloCard(
        child: Center(child: ScreenHeader(title: title)),
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
    final name = role == RideRole.passenger
        ? (draft.passengerName ?? 'Passenger')
        : (draft.riderName ?? 'Rider');
    final phone = draft.phoneE164 ?? '';
    return SizedBox.expand(
      child: CyrloCard(
        child: Column(
          mainAxisAlignment: MainAxisAlignment.center,
          crossAxisAlignment: CrossAxisAlignment.stretch,
          children: [
            const ScreenHeader(
              title: 'Account',
              subtitle: 'This number is signed in on this device.',
            ),
            const SizedBox(height: AppSpacing.lg),
            Text(name, textAlign: TextAlign.center, style: Theme.of(context).textTheme.titleMedium),
            const SizedBox(height: 4),
            Text(
              phone,
              textAlign: TextAlign.center,
              style: Theme.of(context).textTheme.bodyMedium?.copyWith(
                color: AppColors.textSecondary,
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
    );
  }
}
