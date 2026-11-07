import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';

import '../../../core/constants/app_colors.dart';
import '../../../core/theme/app_spacing.dart';
import '../../../shared/widgets/cyrlo_button.dart';
import '../../../shared/widgets/flow_scaffold.dart';
import '../../../shared/widgets/illustration_view.dart';
import '../../../shared/widgets/screen_header.dart';
import '../application/signup_controller.dart';

class OnboardingScreen extends ConsumerStatefulWidget {
  const OnboardingScreen({super.key});

  @override
  ConsumerState<OnboardingScreen> createState() => _OnboardingScreenState();
}

class _OnboardingScreenState extends ConsumerState<OnboardingScreen> {
  final _controller = PageController();
  var _page = 0;

  static const _pages = [
    (
      AppIllustrations.bookRide,
      'Request a Pragya',
      'Pay the request fee, set your pickup, and a nearby Pragya comes to you.',
    ),
    (
      AppIllustrations.nearbyMap,
      'Meet at pickup',
      'The rider finds you. Tell them where you’re going when they arrive.',
    ),
    (
      AppIllustrations.rideOrDrive,
      'Ride or drive',
      'Use the same app as a passenger or a rider.',
    ),
  ];

  @override
  void dispose() {
    _controller.dispose();
    super.dispose();
  }

  void _next() {
    if (_page == _pages.length - 1) {
      ref.read(signupProvider.notifier).finishOnboarding();
      return;
    }
    _controller.nextPage(duration: const Duration(milliseconds: 260), curve: Curves.easeOutCubic);
  }

  @override
  Widget build(BuildContext context) {
    final last = _page == _pages.length - 1;
    return FlowScaffold(
      scrollable: false,
      footer: Column(
        children: [
          CyrloButton(
            label: last ? 'Continue' : 'Next',
            onPressed: _next,
          ),
          if (!last)
            TextButton(
              key: const Key('skip-onboarding'),
              onPressed: () => ref.read(signupProvider.notifier).finishOnboarding(),
              child: const Text('Skip'),
            ),
        ],
      ),
      child: Column(
        children: [
          Expanded(
            child: PageView.builder(
              controller: _controller,
              itemCount: _pages.length,
              onPageChanged: (value) => setState(() => _page = value),
              itemBuilder: (context, index) {
                final page = _pages[index];
                return Padding(
                  padding: const EdgeInsets.symmetric(horizontal: 4),
                  child: Column(
                    mainAxisAlignment: MainAxisAlignment.center,
                    children: [
                      IllustrationView(asset: page.$1, height: 168),
                      const SizedBox(height: AppSpacing.lg),
                      ScreenHeader(title: page.$2, subtitle: page.$3),
                    ],
                  ),
                );
              },
            ),
          ),
          const SizedBox(height: AppSpacing.md),
          Row(
            mainAxisAlignment: MainAxisAlignment.center,
            children: List.generate(_pages.length, (index) {
              final active = index == _page;
              return AnimatedContainer(
                duration: const Duration(milliseconds: 180),
                margin: const EdgeInsets.symmetric(horizontal: 4),
                width: active ? 18 : 8,
                height: 8,
                decoration: BoxDecoration(
                  color: active ? AppColors.brand : AppColors.border,
                  borderRadius: BorderRadius.circular(99),
                ),
              );
            }),
          ),
        ],
      ),
    );
  }
}
