import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';

import '../../../core/constants/app_colors.dart';
import '../../../core/theme/app_spacing.dart';
import '../../../core/utils/phone_numbers.dart';
import '../../../shared/widgets/cyrlo_button.dart';
import '../../../shared/widgets/flow_scaffold.dart';
import '../../../shared/widgets/screen_header.dart';
import '../application/signup_controller.dart';
import '../application/signup_draft.dart';

/// Last check before OTP: use this number, or enter a different one.
class ConfirmPhoneScreen extends ConsumerWidget {
  const ConfirmPhoneScreen({super.key});

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final draft = ref.watch(signupProvider);
    final phone = draft.phoneE164;
    final display = PhoneNumbers.formatGhanaDisplay(phone);
    final roleLabel = switch (draft.role) {
      RideRole.passenger => 'Passenger',
      RideRole.rider => 'Rider',
      null => 'your account',
    };
    final theme = Theme.of(context);

    return FlowScaffold(
      footer: Column(
        mainAxisSize: MainAxisSize.min,
        crossAxisAlignment: CrossAxisAlignment.stretch,
        children: [
          CyrloButton(
            key: const Key('confirm-phone-yes'),
            label: 'Yes, use this number',
            onPressed: phone == null
                ? null
                : () => ref.read(signupProvider.notifier).confirmPhoneForOtp(),
          ),
          const SizedBox(height: AppSpacing.sm),
          CyrloButton(
            key: const Key('confirm-phone-change'),
            label: 'Use a different number',
            variant: CyrloButtonVariant.outlined,
            onPressed: () =>
                ref.read(signupProvider.notifier).changePhoneKeepRole(),
          ),
        ],
      ),
      child: Column(
        mainAxisSize: MainAxisSize.min,
        crossAxisAlignment: CrossAxisAlignment.stretch,
        children: [
          ScreenHeader(
            title: 'Confirm your number',
            subtitle:
                'We’ll send a one-time code for your $roleLabel account. Is this the right phone?',
          ),
          const SizedBox(height: AppSpacing.xl),
          Container(
            key: const Key('confirm-phone-display'),
            padding: const EdgeInsets.symmetric(horizontal: 18, vertical: 20),
            decoration: BoxDecoration(
              color: AppColors.surface,
              borderRadius: BorderRadius.circular(18),
              border: Border.all(color: AppColors.border),
            ),
            child: Column(
              children: [
                Text(
                  'Phone number',
                  style: theme.textTheme.bodySmall?.copyWith(
                    color: AppColors.textSecondary,
                    fontWeight: FontWeight.w700,
                  ),
                ),
                const SizedBox(height: 6),
                Text(
                  display.isEmpty ? '—' : display,
                  textAlign: TextAlign.center,
                  style: theme.textTheme.headlineSmall?.copyWith(
                    fontWeight: FontWeight.w900,
                    letterSpacing: 0.2,
                  ),
                ),
              ],
            ),
          ),
        ],
      ),
    );
  }
}
