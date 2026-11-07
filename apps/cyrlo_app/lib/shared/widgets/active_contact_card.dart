import 'package:flutter/material.dart';
import 'package:flutter/services.dart';

import '../../core/constants/app_colors.dart';
import '../../core/theme/app_radii.dart';
import '../../core/theme/app_spacing.dart';
import '../../core/utils/phone_numbers.dart';

/// Shows the other party's number only while a pickup request is active.
class ActiveContactCard extends StatelessWidget {
  const ActiveContactCard({
    super.key,
    required this.title,
    required this.subtitle,
    required this.phoneE164,
    required this.contactLabel,
    this.onComplete,
    this.onCancel,
  });

  final String title;
  final String subtitle;
  final String phoneE164;
  final String contactLabel;
  final VoidCallback? onComplete;
  final VoidCallback? onCancel;

  Future<void> _copyNumber(BuildContext context) async {
    await Clipboard.setData(ClipboardData(text: phoneE164));
    if (!context.mounted) return;
    ScaffoldMessenger.of(context).showSnackBar(
      SnackBar(
        behavior: SnackBarBehavior.floating,
        backgroundColor: AppColors.darkGrey,
        content: Text(
          '$contactLabel number copied',
          style: const TextStyle(fontWeight: FontWeight.w700),
        ),
      ),
    );
  }

  @override
  Widget build(BuildContext context) {
    final theme = Theme.of(context);
    final display = PhoneNumbers.formatGhanaDisplay(phoneE164);

    return DecoratedBox(
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
        child: Column(
          crossAxisAlignment: CrossAxisAlignment.stretch,
          children: [
            Text(
              title,
              style: theme.textTheme.titleSmall?.copyWith(
                color: AppColors.textPrimary,
                fontWeight: FontWeight.w800,
              ),
            ),
            const SizedBox(height: 4),
            Text(
              subtitle,
              style: theme.textTheme.bodyMedium?.copyWith(
                color: AppColors.textSecondary,
                fontWeight: FontWeight.w500,
                height: 1.35,
              ),
            ),
            const SizedBox(height: AppSpacing.sm),
            DecoratedBox(
              decoration: BoxDecoration(
                color: AppColors.brandLight,
                borderRadius: BorderRadius.circular(AppRadii.md),
              ),
              child: Padding(
                padding: const EdgeInsets.symmetric(horizontal: 12, vertical: 12),
                child: Row(
                  children: [
                    Container(
                      width: 42,
                      height: 42,
                      decoration: BoxDecoration(
                        color: AppColors.yellow,
                        borderRadius: BorderRadius.circular(14),
                      ),
                      child: const Icon(
                        Icons.phone_rounded,
                        color: AppColors.darkGrey,
                        size: 20,
                      ),
                    ),
                    const SizedBox(width: 12),
                    Expanded(
                      child: Column(
                        crossAxisAlignment: CrossAxisAlignment.start,
                        children: [
                          Text(
                            contactLabel,
                            style: theme.textTheme.labelMedium?.copyWith(
                              color: AppColors.textSecondary,
                              fontWeight: FontWeight.w700,
                            ),
                          ),
                          const SizedBox(height: 2),
                          Text(
                            display,
                            key: const Key('shared-contact-number'),
                            style: theme.textTheme.titleSmall?.copyWith(
                              color: AppColors.darkGrey,
                              fontWeight: FontWeight.w800,
                            ),
                          ),
                        ],
                      ),
                    ),
                    IconButton(
                      key: const Key('copy-contact-number'),
                      tooltip: 'Copy number',
                      onPressed: () => _copyNumber(context),
                      icon: const Icon(Icons.copy_rounded),
                      color: AppColors.darkGrey,
                    ),
                  ],
                ),
              ),
            ),
            if (onComplete != null || onCancel != null) ...[
              const SizedBox(height: AppSpacing.sm),
              Row(
                children: [
                  if (onCancel != null)
                    Expanded(
                      child: OutlinedButton(
                        key: const Key('cancel-active-ride'),
                        onPressed: onCancel,
                        child: const Text('Cancel'),
                      ),
                    ),
                  if (onCancel != null && onComplete != null)
                    const SizedBox(width: AppSpacing.sm),
                  if (onComplete != null)
                    Expanded(
                      child: FilledButton(
                        key: const Key('complete-active-ride'),
                        onPressed: onComplete,
                        child: const Text('Arrived / Done'),
                      ),
                    ),
                ],
              ),
            ],
          ],
        ),
      ),
    );
  }
}
