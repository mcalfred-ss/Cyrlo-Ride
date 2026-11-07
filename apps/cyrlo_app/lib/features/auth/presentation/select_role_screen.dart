import 'dart:math' as math;

import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';

import '../../../core/constants/app_colors.dart';
import '../../../core/theme/app_motion.dart';
import '../../../core/theme/app_spacing.dart';
import '../../../shared/widgets/cyrlo_button.dart';
import '../../../shared/widgets/flow_scaffold.dart';
import '../../../shared/widgets/illustration_view.dart';
import '../../../shared/widgets/screen_header.dart';
import '../application/signup_controller.dart';
import '../application/signup_draft.dart';

class SelectRoleScreen extends ConsumerStatefulWidget {
  const SelectRoleScreen({super.key});

  @override
  ConsumerState<SelectRoleScreen> createState() => _SelectRoleScreenState();
}

class _SelectRoleScreenState extends ConsumerState<SelectRoleScreen> {
  late final PageController _controller;
  var _page = 0;

  static const _roles = [
    (
      key: Key('role-passenger'),
      role: RideRole.passenger,
      asset: AppIllustrations.rolePassenger,
      title: 'Passenger',
      subtitle: 'Request a Pragya and follow your ride live.',
    ),
    (
      key: Key('role-rider'),
      role: RideRole.rider,
      asset: AppIllustrations.roleRider,
      title: 'Rider',
      subtitle: 'Drive a Pragya and take requests after approval.',
    ),
  ];

  @override
  void initState() {
    super.initState();
    _controller = PageController(viewportFraction: 0.62);
  }

  @override
  void dispose() {
    _controller.dispose();
    super.dispose();
  }

  void _selectCurrent() {
    ref.read(signupProvider.notifier).chooseRole(_roles[_page].role);
  }

  @override
  Widget build(BuildContext context) {
    final current = _roles[_page];
    return FlowScaffold(
      scrollable: false,
      footer: CyrloButton(
        key: const Key('continue-role'),
        label: 'Continue as ${current.title}',
        onPressed: _selectCurrent,
      ),
      child: Column(
        children: [
          const SizedBox(height: AppSpacing.lg),
          const ScreenHeader(
            title: 'How will you ride?',
            subtitle: 'Slide left or right, then continue.',
          ),
          const SizedBox(height: AppSpacing.lg),
          Expanded(
            child: PageView.builder(
              controller: _controller,
              itemCount: _roles.length,
              onPageChanged: (value) => setState(() => _page = value),
              itemBuilder: (context, index) {
                final item = _roles[index];
                final selected = index == _page;
                return LayoutBuilder(
                  builder: (context, constraints) {
                    final maxHeight = math.max(0.0, constraints.maxHeight - 8);
                    final width = math.min(
                      constraints.maxWidth * 0.92,
                      maxHeight * 0.72,
                    );
                    final height = math.min(maxHeight, width / 0.72);
                    return Center(
                      child: AnimatedScale(
                        scale: selected ? 1 : 0.92,
                        duration: AppMotion.normal,
                        curve: AppMotion.standard,
                        child: SizedBox(
                          width: width,
                          height: height,
                          child: _RolePortraitCard(
                            cardKey: item.key,
                            asset: item.asset,
                            title: item.title,
                            selected: selected,
                            onTap: () {
                              _controller.animateToPage(
                                index,
                                duration: AppMotion.normal,
                                curve: AppMotion.standard,
                              );
                              ref.read(signupProvider.notifier).chooseRole(item.role);
                            },
                          ),
                        ),
                      ),
                    );
                  },
                );
              },
            ),
          ),
          const SizedBox(height: AppSpacing.sm),
          Row(
            mainAxisAlignment: MainAxisAlignment.center,
            children: List.generate(_roles.length, (index) {
              final active = index == _page;
              return AnimatedContainer(
                duration: AppMotion.fast,
                margin: const EdgeInsets.symmetric(horizontal: 4),
                width: active ? 18 : 8,
                height: 8,
                decoration: BoxDecoration(
                  color: active ? AppColors.yellow : AppColors.border,
                  borderRadius: BorderRadius.circular(99),
                ),
              );
            }),
          ),
          const SizedBox(height: AppSpacing.sm),
          AnimatedSwitcher(
            duration: AppMotion.normal,
            switchInCurve: AppMotion.standard,
            switchOutCurve: AppMotion.exit,
            child: Padding(
              key: ValueKey(current.subtitle),
              padding: const EdgeInsets.symmetric(horizontal: 12),
              child: Text(
                current.subtitle,
                textAlign: TextAlign.center,
                style: Theme.of(context).textTheme.bodyMedium?.copyWith(
                  color: AppColors.textSecondary,
                  height: 1.35,
                  fontWeight: FontWeight.w600,
                ),
              ),
            ),
          ),
        ],
      ),
    );
  }
}

class _RolePortraitCard extends StatelessWidget {
  const _RolePortraitCard({
    required this.cardKey,
    required this.asset,
    required this.title,
    required this.selected,
    required this.onTap,
  });

  final Key cardKey;
  final String asset;
  final String title;
  final bool selected;
  final VoidCallback onTap;

  @override
  Widget build(BuildContext context) {
    return Material(
      color: Colors.transparent,
      child: InkWell(
        key: cardKey,
        onTap: onTap,
        borderRadius: BorderRadius.circular(22),
        child: Ink(
          decoration: BoxDecoration(
            color: AppColors.surface,
            borderRadius: BorderRadius.circular(22),
            border: Border.all(
              color: selected ? AppColors.yellow : AppColors.border,
              width: selected ? 2 : 1,
            ),
            boxShadow: [
              BoxShadow(
                color: AppColors.elevationShadow(lightAlpha: selected ? 0.12 : 0.06),
                blurRadius: selected ? 20 : 12,
                offset: const Offset(0, 8),
              ),
            ],
          ),
          child: Column(
            crossAxisAlignment: CrossAxisAlignment.stretch,
            children: [
              Expanded(
                child: ClipRRect(
                  borderRadius: const BorderRadius.vertical(top: Radius.circular(20)),
                  child: ColoredBox(
                    color: Theme.of(context).brightness == Brightness.dark
                        ? Colors.transparent
                        : AppColors.illustrationNest,
                    child: ThemedIllustrationImage(
                      asset: asset,
                      fit: BoxFit.cover,
                      alignment: Alignment.center,
                    ),
                  ),
                ),
              ),
              Padding(
                padding: const EdgeInsets.fromLTRB(10, 12, 10, 14),
                child: Text(
                  title,
                  textAlign: TextAlign.center,
                  style: Theme.of(context).textTheme.titleMedium?.copyWith(
                    fontWeight: FontWeight.w900,
                  ),
                ),
              ),
            ],
          ),
        ),
      ),
    );
  }
}
