import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';

import '../../../core/constants/app_colors.dart';
import '../../../core/theme/app_spacing.dart';
import '../../../features/auth/application/signup_controller.dart';
import '../../../shared/widgets/flow_scaffold.dart';

class RiderApprovalScreen extends ConsumerWidget {
  const RiderApprovalScreen({super.key});

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final name = ref.watch(signupProvider).riderName ?? 'Your application';
    return FlowScaffold(
      child: Column(
        mainAxisAlignment: MainAxisAlignment.center,
        children: [
          Container(
            width: 88,
            height: 88,
            decoration: BoxDecoration(
              color: AppColors.brandLight,
              borderRadius: BorderRadius.circular(28),
            ),
            child: const Icon(Icons.hourglass_top_rounded, size: 40, color: AppColors.brandDark),
          ),
          const SizedBox(height: AppSpacing.lg),
          Text(
            'Waiting for approval',
            textAlign: TextAlign.center,
            style: Theme.of(context).textTheme.headlineSmall?.copyWith(
              fontWeight: FontWeight.w900,
            ),
          ),
          const SizedBox(height: AppSpacing.xs),
          Text(
            '$name is with the Cyrlo team. This screen stays here until you are accepted, then your rider home opens.',
            textAlign: TextAlign.center,
            style: Theme.of(context).textTheme.bodyLarge?.copyWith(
              color: AppColors.textSecondary,
              height: 1.4,
            ),
          ),
        ],
      ),
    );
  }
}
