import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';

import '../../../core/theme/app_spacing.dart';
import '../../../shared/widgets/cyrlo_button.dart';
import '../../../shared/widgets/flow_scaffold.dart';
import '../../../shared/widgets/illustration_view.dart';
import '../../../shared/widgets/screen_header.dart';
import '../application/signup_controller.dart';

class WelcomeScreen extends ConsumerWidget {
  const WelcomeScreen({super.key});

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    return FlowScaffold(
      footer: CyrloButton(
        key: const Key('get-started'),
        label: 'Continue with phone number',
        onPressed: () => ref.read(signupProvider.notifier).finishWelcome(),
      ),
      child: const Column(
        mainAxisSize: MainAxisSize.min,
        children: [
          IllustrationView(asset: AppIllustrations.welcomeRide, height: 176),
          SizedBox(height: AppSpacing.lg),
          ScreenHeader(
            title: 'Welcome to Cyrlo',
            subtitle: 'Enter your Ghana phone number to get started.',
          ),
        ],
      ),
    );
  }
}
