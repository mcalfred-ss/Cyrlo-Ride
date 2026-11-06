import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';

import '../../../core/theme/app_spacing.dart';
import '../../../shared/widgets/choice_card.dart';
import '../../../shared/widgets/flow_scaffold.dart';
import '../../../shared/widgets/screen_header.dart';
import '../application/signup_controller.dart';
import '../application/signup_draft.dart';

class SelectRoleScreen extends ConsumerWidget {
  const SelectRoleScreen({super.key});

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    return FlowScaffold(
      child: Column(
        mainAxisSize: MainAxisSize.min,
        crossAxisAlignment: CrossAxisAlignment.stretch,
        children: [
          const ScreenHeader(
            title: 'How will you ride?',
            subtitle: 'Choose one. You can use a different number for the other role.',
          ),
          const SizedBox(height: AppSpacing.xl),
          ChoiceCard(
            key: const Key('role-passenger'),
            icon: Icons.person_rounded,
            title: 'Passenger',
            subtitle: 'Request rides and follow them live.',
            onTap: () => ref.read(signupProvider.notifier).chooseRole(RideRole.passenger),
          ),
          const SizedBox(height: AppSpacing.sm),
          ChoiceCard(
            key: const Key('role-rider'),
            icon: Icons.two_wheeler_rounded,
            title: 'Rider',
            subtitle: 'Take ride requests after approval.',
            onTap: () => ref.read(signupProvider.notifier).chooseRole(RideRole.rider),
          ),
        ],
      ),
    );
  }
}
