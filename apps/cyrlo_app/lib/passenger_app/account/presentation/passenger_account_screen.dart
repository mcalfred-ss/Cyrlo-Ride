import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';

import '../../../core/constants/app_colors.dart';
import '../../../core/theme/app_radii.dart';
import '../../../core/theme/app_spacing.dart';
import '../../../features/auth/application/signup_controller.dart';
import '../../../features/auth/application/signup_draft.dart';
import '../../../shared/widgets/cyrlo_button.dart';

class PassengerAccountScreen extends ConsumerWidget {
  const PassengerAccountScreen({super.key});

  String _formatDob(DateTime date) {
    final day = date.day.toString().padLeft(2, '0');
    final month = date.month.toString().padLeft(2, '0');
    return '$day/$month/${date.year}';
  }

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final draft = ref.watch(signupProvider);
    final theme = Theme.of(context);
    final name = draft.passengerName ?? 'Passenger';
    final first = draft.passengerFirstName?.trim() ?? '';
    final last = draft.passengerLastName?.trim() ?? '';
    final initials = [
      if (first.isNotEmpty) first[0].toUpperCase(),
      if (last.isNotEmpty) last[0].toUpperCase(),
    ].join();
    final genderLabel = switch (draft.passengerGender) {
      PassengerGender.male => 'Male',
      PassengerGender.female => 'Female',
      null => '—',
    };

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
                                  draft.phoneE164 ?? '',
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
                                    'Passenger',
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
                  const SizedBox(height: AppSpacing.md),
                  Text(
                    'Details',
                    style: theme.textTheme.titleSmall?.copyWith(
                      color: AppColors.textPrimary,
                      fontWeight: FontWeight.w800,
                    ),
                  ),
                  const SizedBox(height: AppSpacing.sm),
                  _AccountDetailCard(
                    children: [
                      _AccountDetailRow(
                        icon: Icons.place_rounded,
                        label: 'Location',
                        value: draft.passengerLocation ?? '—',
                      ),
                      _AccountDetailRow(
                        icon: Icons.cake_rounded,
                        label: 'Date of birth',
                        value: draft.passengerDateOfBirth == null
                            ? '—'
                            : _formatDob(draft.passengerDateOfBirth!),
                      ),
                      _AccountDetailRow(
                        icon: Icons.person_rounded,
                        label: 'Gender',
                        value: genderLabel,
                        showDivider: false,
                      ),
                    ],
                  ),
                  const SizedBox(height: AppSpacing.xl),
                  CyrloButton(
                    key: const Key('sign-out'),
                    label: 'Sign out',
                    variant: CyrloButtonVariant.outlined,
                    onPressed: () => ref.read(signupProvider.notifier).signOut(),
                  ),
                  const SizedBox(height: AppSpacing.md),
                ],
              ),
            ),
          ],
        ),
      ),
    );
  }
}

class _AccountDetailCard extends StatelessWidget {
  const _AccountDetailCard({required this.children});

  final List<Widget> children;

  @override
  Widget build(BuildContext context) {
    return DecoratedBox(
      decoration: BoxDecoration(
        color: AppColors.surface,
        borderRadius: BorderRadius.circular(AppRadii.lg),
        border: Border.all(color: AppColors.border),
      ),
      child: Padding(
        padding: const EdgeInsets.symmetric(horizontal: 14, vertical: 6),
        child: Column(children: children),
      ),
    );
  }
}

class _AccountDetailRow extends StatelessWidget {
  const _AccountDetailRow({
    required this.icon,
    required this.label,
    required this.value,
    this.showDivider = true,
  });

  final IconData icon;
  final String label;
  final String value;
  final bool showDivider;

  @override
  Widget build(BuildContext context) {
    final theme = Theme.of(context);
    return Column(
      children: [
        Padding(
          padding: const EdgeInsets.symmetric(vertical: 12),
          child: Row(
            children: [
              Container(
                width: 36,
                height: 36,
                decoration: BoxDecoration(
                  color: AppColors.field,
                  borderRadius: BorderRadius.circular(12),
                ),
                child: Icon(icon, size: 18, color: AppColors.darkGrey),
              ),
              const SizedBox(width: 12),
              Expanded(
                child: Column(
                  crossAxisAlignment: CrossAxisAlignment.start,
                  children: [
                    Text(
                      label,
                      style: theme.textTheme.labelMedium?.copyWith(
                        color: AppColors.textSecondary,
                        fontWeight: FontWeight.w700,
                      ),
                    ),
                    const SizedBox(height: 2),
                    Text(
                      value,
                      style: theme.textTheme.bodyLarge?.copyWith(
                        color: AppColors.textPrimary,
                        fontWeight: FontWeight.w700,
                      ),
                    ),
                  ],
                ),
              ),
            ],
          ),
        ),
        if (showDivider) const Divider(height: 1),
      ],
    );
  }
}
