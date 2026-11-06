import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';

import '../../../core/theme/app_spacing.dart';
import '../../../features/auth/application/signup_controller.dart';
import '../../../features/auth/application/signup_draft.dart';
import '../../../shared/widgets/choice_card.dart';
import '../../../shared/widgets/flow_scaffold.dart';
import '../../../shared/widgets/screen_header.dart';

class DriverTypeScreen extends ConsumerWidget {
  const DriverTypeScreen({super.key});

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    return FlowScaffold(
      child: Column(
        mainAxisSize: MainAxisSize.min,
        crossAxisAlignment: CrossAxisAlignment.stretch,
        children: [
          const ScreenHeader(
            title: 'What do you drive?',
            subtitle: 'Choose the vehicle you will use for rides.',
          ),
          const SizedBox(height: AppSpacing.xl),
          ChoiceCard(
            key: const Key('driver-okada'),
            icon: Icons.two_wheeler_rounded,
            title: 'Okada driver',
            subtitle: 'Motorcycle',
            onTap: () => ref.read(signupProvider.notifier).chooseDriver(DriverKind.okada),
          ),
          const SizedBox(height: AppSpacing.sm),
          ChoiceCard(
            key: const Key('driver-pragya'),
            icon: Icons.airport_shuttle_rounded,
            title: 'Pragya driver',
            subtitle: 'Three-wheeler',
            onTap: () => ref.read(signupProvider.notifier).chooseDriver(DriverKind.pragya),
          ),
          const SizedBox(height: AppSpacing.sm),
          const ChoiceCard(
            key: Key('driver-aboboyaa'),
            icon: Icons.agriculture_rounded,
            title: 'Aboboyaa driver',
            subtitle: 'Coming soon',
            enabled: false,
          ),
        ],
      ),
    );
  }
}
