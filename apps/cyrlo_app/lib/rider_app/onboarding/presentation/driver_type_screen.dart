import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';

import '../../../core/constants/app_colors.dart';
import '../../../core/theme/app_spacing.dart';
import '../../../features/auth/application/signup_controller.dart';
import '../../../features/auth/application/signup_draft.dart';
import '../../../shared/widgets/flow_scaffold.dart';

class DriverTypeScreen extends ConsumerWidget {
  const DriverTypeScreen({super.key});

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    return FlowScaffold(
      child: ListView(
        children: [
          Text(
            'What do you drive?',
            style: Theme.of(context).textTheme.headlineSmall?.copyWith(
              fontWeight: FontWeight.w900,
            ),
          ),
          const SizedBox(height: AppSpacing.xs),
          Text(
            'Choose the vehicle you will use for rides.',
            style: Theme.of(context).textTheme.bodyLarge?.copyWith(
              color: AppColors.textSecondary,
            ),
          ),
          const SizedBox(height: AppSpacing.xl),
          _DriverChoice(
            key: const Key('driver-okada'),
            title: 'Okada driver',
            subtitle: 'Motorcycle',
            onTap: () => ref.read(signupProvider.notifier).chooseDriver(DriverKind.okada),
          ),
          const SizedBox(height: AppSpacing.sm),
          _DriverChoice(
            key: const Key('driver-pragya'),
            title: 'Pragya driver',
            subtitle: 'Three-wheeler',
            onTap: () => ref.read(signupProvider.notifier).chooseDriver(DriverKind.pragya),
          ),
          const SizedBox(height: AppSpacing.sm),
          const _DriverChoice(
            key: Key('driver-aboboyaa'),
            title: 'Aboboyaa driver',
            subtitle: 'Coming soon',
            enabled: false,
          ),
        ],
      ),
    );
  }
}

class _DriverChoice extends StatelessWidget {
  const _DriverChoice({
    super.key,
    required this.title,
    required this.subtitle,
    this.onTap,
    this.enabled = true,
  });

  final String title;
  final String subtitle;
  final VoidCallback? onTap;
  final bool enabled;

  @override
  Widget build(BuildContext context) {
    return Opacity(
      opacity: enabled ? 1 : 0.55,
      child: Material(
        color: Colors.transparent,
        child: InkWell(
          onTap: enabled ? onTap : null,
          borderRadius: BorderRadius.circular(22),
          child: Ink(
            decoration: BoxDecoration(
              borderRadius: BorderRadius.circular(22),
              border: Border.all(color: AppColors.border),
              color: AppColors.surfaceAlt,
            ),
            child: Padding(
              padding: const EdgeInsets.all(16),
              child: Row(
                children: [
                  Expanded(
                    child: Column(
                      crossAxisAlignment: CrossAxisAlignment.start,
                      children: [
                        Text(
                          title,
                          style: Theme.of(context).textTheme.titleMedium?.copyWith(
                            fontWeight: FontWeight.w800,
                          ),
                        ),
                        Text(
                          subtitle,
                          style: Theme.of(context).textTheme.bodyMedium?.copyWith(
                            color: enabled ? AppColors.textSecondary : AppColors.onBrandSoft,
                            fontWeight: enabled ? FontWeight.w600 : FontWeight.w800,
                          ),
                        ),
                      ],
                    ),
                  ),
                  if (enabled) const Icon(Icons.chevron_right_rounded),
                ],
              ),
            ),
          ),
        ),
      ),
    );
  }
}
