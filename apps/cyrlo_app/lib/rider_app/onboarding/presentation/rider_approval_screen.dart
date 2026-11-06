import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';

import '../../../core/theme/app_spacing.dart';
import '../../../features/auth/application/signup_controller.dart';
import '../../../shared/widgets/choice_card.dart';
import '../../../shared/widgets/flow_scaffold.dart';
import '../../../shared/widgets/screen_header.dart';

class RiderApprovalScreen extends ConsumerWidget {
  const RiderApprovalScreen({super.key});

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final name = ref.watch(signupProvider).riderName ?? 'Your application';
    return FlowScaffold(
      child: Column(
        mainAxisSize: MainAxisSize.min,
        children: [
          const IconBadge(icon: Icons.hourglass_top_rounded),
          const SizedBox(height: AppSpacing.lg),
          ScreenHeader(
            title: 'Waiting for approval',
            subtitle:
                '$name is with the Cyrlo team. This screen stays here until you are accepted, then your rider home opens.',
          ),
        ],
      ),
    );
  }
}
