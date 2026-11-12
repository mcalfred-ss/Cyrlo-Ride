import 'dart:math' as math;

import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';

import '../../../core/constants/app_colors.dart';
import '../../../core/theme/app_motion.dart';
import '../../../core/theme/app_spacing.dart';
import '../../../features/auth/application/signup_controller.dart';
import '../../../shared/widgets/choice_card.dart';
import '../../../shared/widgets/cyrlo_button.dart';
import '../../../shared/widgets/cyrlo_text_field.dart';
import '../../../shared/widgets/flow_scaffold.dart';
import '../../../shared/widgets/illustration_view.dart';
import '../../../shared/widgets/screen_header.dart';

/// Soft, skippable preference steps after passenger profile — before home.
class PassengerPreferencesScreen extends ConsumerStatefulWidget {
  const PassengerPreferencesScreen({super.key});

  @override
  ConsumerState<PassengerPreferencesScreen> createState() =>
      _PassengerPreferencesScreenState();
}

class _PassengerPreferencesScreenState
    extends ConsumerState<PassengerPreferencesScreen> {
  static const _stepCount = 5;

  late final TextEditingController _nameController;
  var _step = 0;
  var _showThanks = false;
  String? _getAround;
  String? _pragyaFrequency;
  String? _mattersMost;
  String? _frustration;

  @override
  void initState() {
    super.initState();
    final draft = ref.read(signupProvider);
    _nameController = TextEditingController(
      text: draft.passengerFirstName?.trim() ?? '',
    );
    _nameController.addListener(() => setState(() {}));
  }

  @override
  void dispose() {
    _nameController.dispose();
    super.dispose();
  }

  String get _title => switch (_step) {
        0 => 'What should we call you?',
        1 => 'How do you usually get around?',
        2 => 'How often do you use Pragya?',
        3 => 'What matters most when booking a ride?',
        _ => 'What frustrates you most about using Pragya?',
      };

  String get _subtitle => switch (_step) {
        0 => 'We’ll use this on your home screen.',
        1 => 'Pick the one that fits you best.',
        2 => 'Helps us show the right nearby options.',
        3 => 'We’ll prioritise what you care about.',
        _ => 'Tell us so we can improve Cyrlo Ride.',
      };

  bool get _canContinue => switch (_step) {
        0 => _nameController.text.trim().length >= 2,
        1 => _getAround != null,
        2 => _pragyaFrequency != null,
        3 => _mattersMost != null,
        _ => _frustration != null,
      };

  Future<void> _finish({required bool skipped}) async {
    await ref.read(signupProvider.notifier).completePassengerPreferences(
          skipped: skipped,
          preferredName: _nameController.text.trim().isEmpty
              ? null
              : _nameController.text.trim(),
          getAround: _getAround,
          okadaFrequency: _pragyaFrequency,
          mattersMost: _mattersMost,
          frustration: _frustration,
        );
  }

  void _continue() {
    if (!_canContinue) return;
    if (_step >= _stepCount - 1) {
      setState(() => _showThanks = true);
      return;
    }
    setState(() => _step += 1);
  }

  void _back() {
    if (_showThanks) {
      setState(() => _showThanks = false);
      return;
    }
    if (_step == 0) return;
    setState(() => _step -= 1);
  }

  @override
  Widget build(BuildContext context) {
    if (_showThanks) {
      return FlowScaffold(
        onBack: _back,
        footer: CyrloButton(
          key: const Key('passenger-prefs-thanks-continue'),
          label: 'Start riding',
          onPressed: () => _finish(skipped: false),
        ),
        child: const _ThanksStep(),
      );
    }

    return FlowScaffold(
      onBack: _step == 0 ? null : _back,
      footer: Column(
        crossAxisAlignment: CrossAxisAlignment.stretch,
        children: [
          CyrloButton(
            key: const Key('passenger-prefs-continue'),
            label: _step == _stepCount - 1 ? 'Finish' : 'Continue',
            onPressed: _canContinue ? _continue : null,
          ),
          const SizedBox(height: AppSpacing.sm),
          TextButton(
            key: const Key('passenger-prefs-skip'),
            onPressed: () => _finish(skipped: true),
            child: Text(
              'Skip for now',
              style: TextStyle(
                color: AppColors.textSecondary,
                fontWeight: FontWeight.w700,
              ),
            ),
          ),
        ],
      ),
      child: Column(
        mainAxisSize: MainAxisSize.min,
        crossAxisAlignment: CrossAxisAlignment.stretch,
        children: [
          _StepProgress(step: _step, total: _stepCount),
          const SizedBox(height: AppSpacing.md),
          ScreenHeader(title: _title, subtitle: _subtitle),
          const SizedBox(height: AppSpacing.lg),
          AnimatedSwitcher(
            duration: AppMotion.normal,
            switchInCurve: AppMotion.standard,
            switchOutCurve: AppMotion.exit,
            child: KeyedSubtree(
              key: ValueKey(_step),
              child: switch (_step) {
                0 => _NameStep(controller: _nameController),
                1 => _OptionsStep(
                    options: const [
                      (
                        id: 'pragya',
                        label: 'Pragya',
                        hint: 'Tricycle rides',
                        asset: AppIllustrations.vehiclePragya,
                      ),
                      (
                        id: 'taxi',
                        label: 'Taxi / ride-hailing',
                        hint: 'Car rides',
                        asset: AppIllustrations.rideOrDrive,
                      ),
                      (
                        id: 'trotro',
                        label: 'Tro-tro / bus',
                        hint: 'Shared transport',
                        asset: AppIllustrations.nearbyMap,
                      ),
                      (
                        id: 'other',
                        label: 'Walking / other',
                        hint: 'I mix it up',
                        asset: AppIllustrations.rolePassenger,
                      ),
                    ],
                    selected: _getAround,
                    onSelect: (id) => setState(() => _getAround = id),
                  ),
                2 => _OptionsStep(
                    options: const [
                      (
                        id: 'daily',
                        label: 'Daily',
                        hint: 'Part of my routine',
                        asset: AppIllustrations.vehiclePragya,
                      ),
                      (
                        id: 'few_week',
                        label: 'A few times a week',
                        hint: 'Regular but not every day',
                        asset: AppIllustrations.bookRide,
                      ),
                      (
                        id: 'occasionally',
                        label: 'Occasionally',
                        hint: 'When I need a quick ride',
                        asset: AppIllustrations.nearbyMap,
                      ),
                      (
                        id: 'rarely',
                        label: 'First time / rarely',
                        hint: 'Still getting used to it',
                        asset: AppIllustrations.welcomeRide,
                      ),
                    ],
                    selected: _pragyaFrequency,
                    onSelect: (id) => setState(() => _pragyaFrequency = id),
                  ),
                3 => _OptionsStep(
                    options: const [
                      (
                        id: 'fast_pickup',
                        label: 'Fast pickup',
                        hint: 'Get moving quickly',
                        asset: AppIllustrations.bookRide,
                      ),
                      (
                        id: 'fair_price',
                        label: 'Fair price',
                        hint: 'No surprise fares',
                        asset: AppIllustrations.nearbyMap,
                      ),
                      (
                        id: 'safety',
                        label: 'Safety',
                        hint: 'Feel secure on the trip',
                        asset: AppIllustrations.rolePassenger,
                      ),
                      (
                        id: 'friendly',
                        label: 'Friendly rider',
                        hint: 'Good experience matters',
                        asset: AppIllustrations.roleRider,
                      ),
                    ],
                    selected: _mattersMost,
                    onSelect: (id) => setState(() => _mattersMost = id),
                  ),
                _ => _OptionsStep(
                    options: const [
                      (
                        id: 'hard_to_find',
                        label: 'Hard to find a rider',
                        hint: 'Waiting too long',
                        asset: AppIllustrations.nearbyMap,
                      ),
                      (
                        id: 'price_arguments',
                        label: 'Price arguments',
                        hint: 'Negotiating fare',
                        asset: AppIllustrations.rideOrDrive,
                      ),
                      (
                        id: 'safety_worries',
                        label: 'Safety worries',
                        hint: 'Trust and comfort',
                        asset: AppIllustrations.rolePassenger,
                      ),
                      (
                        id: 'long_waits',
                        label: 'Long waits',
                        hint: 'Pickup takes forever',
                        asset: AppIllustrations.bookRide,
                      ),
                    ],
                    selected: _frustration,
                    onSelect: (id) => setState(() => _frustration = id),
                  ),
              },
            ),
          ),
        ],
      ),
    );
  }
}

class _NameStep extends StatelessWidget {
  const _NameStep({required this.controller});

  final TextEditingController controller;

  @override
  Widget build(BuildContext context) {
    return Column(
      children: [
        const IllustrationView(
          asset: AppIllustrations.rolePassenger,
          height: 140,
        ),
        const SizedBox(height: AppSpacing.md),
        CyrloTextField(
          key: const Key('passenger-prefs-name'),
          controller: controller,
          label: 'Preferred name',
          hint: 'e.g. Ama',
          textInputAction: TextInputAction.done,
        ),
      ],
    );
  }
}

class _OptionsStep extends StatelessWidget {
  const _OptionsStep({
    required this.options,
    required this.selected,
    required this.onSelect,
  });

  final List<({String id, String label, String hint, String asset})> options;
  final String? selected;
  final ValueChanged<String> onSelect;

  @override
  Widget build(BuildContext context) {
    return Column(
      children: [
        for (var i = 0; i < options.length; i++) ...[
          if (i > 0) const SizedBox(height: AppSpacing.sm),
          ChoiceCard(
            key: Key('passenger-prefs-option-${options[i].id}'),
            title: options[i].label,
            subtitle: options[i].hint,
            illustrationAsset: options[i].asset,
            highlighted: selected == options[i].id,
            onTap: () => onSelect(options[i].id),
          ),
        ],
      ],
    );
  }
}

class _ThanksStep extends StatefulWidget {
  const _ThanksStep();

  @override
  State<_ThanksStep> createState() => _ThanksStepState();
}

class _ThanksStepState extends State<_ThanksStep>
    with SingleTickerProviderStateMixin {
  late final AnimationController _confetti;

  @override
  void initState() {
    super.initState();
    _confetti = AnimationController(
      vsync: this,
      duration: const Duration(milliseconds: 2600),
    )..forward();
  }

  @override
  void dispose() {
    _confetti.dispose();
    super.dispose();
  }

  @override
  Widget build(BuildContext context) {
    return Stack(
      alignment: Alignment.center,
      children: [
        Positioned.fill(
          child: IgnorePointer(
            child: AnimatedBuilder(
              animation: _confetti,
              builder: (context, _) {
                return CustomPaint(
                  painter: _ConfettiPainter(progress: _confetti.value),
                );
              },
            ),
          ),
        ),
        Column(
          mainAxisSize: MainAxisSize.min,
          children: [
            TweenAnimationBuilder<double>(
              tween: Tween(begin: 0.88, end: 1),
              duration: AppMotion.page,
              curve: AppMotion.standard,
              builder: (context, scale, child) =>
                  Transform.scale(scale: scale, child: child),
              child: const IllustrationView(
                asset: AppIllustrations.welcomeRide,
                height: 200,
              ),
            ),
            const SizedBox(height: AppSpacing.lg),
            Text(
              'Thank you!',
              textAlign: TextAlign.center,
              style: Theme.of(context).textTheme.headlineSmall?.copyWith(
                    color: AppColors.textPrimary,
                    fontWeight: FontWeight.w800,
                    letterSpacing: -0.3,
                  ),
            ),
            const SizedBox(height: 8),
            Text(
              'You’re set. We’ll use this to make booking a Pragya feel smoother.',
              textAlign: TextAlign.center,
              style: Theme.of(context).textTheme.bodyLarge?.copyWith(
                    color: AppColors.textSecondary,
                    fontWeight: FontWeight.w500,
                    height: 1.35,
                  ),
            ),
          ],
        ),
      ],
    );
  }
}

class _ConfettiPainter extends CustomPainter {
  _ConfettiPainter({required this.progress});

  final double progress;

  static final _pieces = List.generate(42, (i) {
    final seed = math.Random(i * 97 + 11);
    return (
      x: seed.nextDouble(),
      delay: seed.nextDouble() * 0.35,
      speed: 0.55 + seed.nextDouble() * 0.7,
      size: 4.0 + seed.nextDouble() * 7,
      drift: (seed.nextDouble() - 0.5) * 0.35,
      spin: (seed.nextDouble() - 0.5) * math.pi * 4,
      color: [
        AppColors.yellow,
        AppColors.yellow.withValues(alpha: 0.85),
        Colors.white,
        const Color(0xFFFFC857),
        const Color(0xFFFF8A3D),
      ][i % 5],
    );
  });

  @override
  void paint(Canvas canvas, Size size) {
    final paint = Paint()..style = PaintingStyle.fill;
    for (final piece in _pieces) {
      final local = ((progress - piece.delay) / (1 - piece.delay)).clamp(0.0, 1.0);
      if (local <= 0) continue;
      final opacity = local < 0.75 ? 1.0 : (1 - ((local - 0.75) / 0.25));
      paint.color = piece.color.withValues(alpha: opacity.clamp(0.0, 1.0));
      final x = (piece.x + piece.drift * local) * size.width;
      final y = -20 + (local * piece.speed) * (size.height + 40);
      final rect = Rect.fromCenter(
        center: Offset(x, y),
        width: piece.size,
        height: piece.size * 0.55,
      );
      canvas.save();
      canvas.translate(rect.center.dx, rect.center.dy);
      canvas.rotate(piece.spin * local);
      canvas.drawRRect(
        RRect.fromRectAndRadius(
          Rect.fromCenter(
            center: Offset.zero,
            width: rect.width,
            height: rect.height,
          ),
          const Radius.circular(2),
        ),
        paint,
      );
      canvas.restore();
    }
  }

  @override
  bool shouldRepaint(covariant _ConfettiPainter oldDelegate) =>
      oldDelegate.progress != progress;
}

class _StepProgress extends StatelessWidget {
  const _StepProgress({required this.step, required this.total});

  final int step;
  final int total;

  @override
  Widget build(BuildContext context) {
    return Column(
      crossAxisAlignment: CrossAxisAlignment.stretch,
      children: [
        Text(
          'Step ${step + 1} of $total',
          style: Theme.of(context).textTheme.labelLarge?.copyWith(
                color: AppColors.textSecondary,
                fontWeight: FontWeight.w800,
              ),
        ),
        const SizedBox(height: 8),
        Row(
          children: List.generate(total, (index) {
            final active = index <= step;
            return Expanded(
              child: AnimatedContainer(
                duration: AppMotion.fast,
                curve: AppMotion.standard,
                height: 4,
                margin: EdgeInsets.only(left: index == 0 ? 0 : 6),
                decoration: BoxDecoration(
                  color: active ? AppColors.yellow : AppColors.border,
                  borderRadius: BorderRadius.circular(999),
                ),
              ),
            );
          }),
        ),
      ],
    );
  }
}
