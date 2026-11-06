import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';

import '../../../core/constants/app_colors.dart';
import '../../../core/theme/app_spacing.dart';
import '../../../shared/widgets/choice_card.dart';
import '../../../shared/widgets/cyrlo_button.dart';
import '../../../shared/widgets/flow_scaffold.dart';
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
    (Icons.two_wheeler_rounded, 'Book a ride', 'Request an okada with your pickup and destination.'),
    (Icons.map_rounded, 'See riders nearby', 'Follow the ride live once a rider accepts.'),
    (Icons.badge_rounded, 'Ride or drive', 'Use the same app as a passenger or a rider.'),
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
      footer: Column(
        children: [
          CyrloButton(
            label: last ? 'Get started' : 'Next',
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
        mainAxisSize: MainAxisSize.min,
        children: [
          SizedBox(
            height: 280,
            child: PageView.builder(
              controller: _controller,
              itemCount: _pages.length,
              onPageChanged: (value) => setState(() => _page = value),
              itemBuilder: (context, index) {
                final page = _pages[index];
                return Column(
                  mainAxisAlignment: MainAxisAlignment.center,
                  children: [
                    IconBadge(icon: page.$1),
                    const SizedBox(height: AppSpacing.lg),
                    ScreenHeader(title: page.$2, subtitle: page.$3),
                  ],
                );
              },
            ),
          ),
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
