import 'dart:async';

import 'package:flutter/material.dart';
import 'package:flutter/services.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';

import '../../../core/constants/app_colors.dart';
import '../../../core/theme/app_motion.dart';
import '../../../core/theme/app_spacing.dart';
import '../../../core/utils/phone_numbers.dart';
import '../../../shared/widgets/cyrlo_button.dart';
import '../../../shared/widgets/flow_scaffold.dart';
import '../../../shared/widgets/screen_header.dart';
import '../../../shared/widgets/success_check_animation.dart';
import '../application/signup_controller.dart';

class VerifyOtpScreen extends ConsumerStatefulWidget {
  const VerifyOtpScreen({super.key});

  @override
  ConsumerState<VerifyOtpScreen> createState() => _VerifyOtpScreenState();
}

class _VerifyOtpScreenState extends ConsumerState<VerifyOtpScreen> {
  final _codeController = TextEditingController();
  Timer? _timer;
  var _secondsLeft = 60;
  String? _error;
  var _verified = false;

  @override
  void initState() {
    super.initState();
    _codeController.addListener(() => setState(() {}));
    _startTimer();
  }

  @override
  void dispose() {
    _timer?.cancel();
    _codeController.dispose();
    super.dispose();
  }

  void _startTimer() {
    _timer?.cancel();
    setState(() => _secondsLeft = 60);
    _timer = Timer.periodic(const Duration(seconds: 1), (timer) {
      if (!mounted) return;
      if (_secondsLeft <= 1) {
        timer.cancel();
        setState(() => _secondsLeft = 0);
      } else {
        setState(() => _secondsLeft -= 1);
      }
    });
  }

  Future<void> _verify() async {
    if (_verified) return;
    final code = _codeController.text;
    final ok = code.trim() == SignupController.testOtp;
    if (!ok) {
      setState(
        () => _error = 'Enter the test code ${SignupController.testOtp}.',
      );
      return;
    }

    setState(() {
      _error = null;
      _verified = true;
    });

    // Let the check animation play, then continue the signup flow.
    await Future<void>.delayed(const Duration(milliseconds: 1200));
    if (!mounted) return;
    ref.read(signupProvider.notifier).verifyOtp(code);
  }

  @override
  Widget build(BuildContext context) {
    final phone = ref.watch(signupProvider).phoneE164;
    final minutes = (_secondsLeft ~/ 60).toString();
    final seconds = (_secondsLeft % 60).toString().padLeft(2, '0');
    final waiting = _secondsLeft > 0;

    return FlowScaffold(
      child: AnimatedSwitcher(
        duration: AppMotion.normal,
        switchInCurve: AppMotion.standard,
        switchOutCurve: AppMotion.exit,
        child: _verified
            ? const Padding(
                key: ValueKey('otp-success'),
                padding: EdgeInsets.symmetric(vertical: 48),
                child: SuccessCheckAnimation(
                  key: Key('otp-success-check'),
                  label: 'Number verified',
                ),
              )
            : Column(
                key: const ValueKey('otp-form'),
                mainAxisSize: MainAxisSize.min,
                crossAxisAlignment: CrossAxisAlignment.stretch,
                children: [
                  Align(
                    alignment: Alignment.centerLeft,
                    child: IconButton(
                      onPressed: () =>
                          ref.read(signupProvider.notifier).editPhone(),
                      icon: const Icon(Icons.arrow_back_rounded),
                      color: AppColors.textPrimary,
                    ),
                  ),
                  const SizedBox(height: AppSpacing.sm),
                  ScreenHeader(
                    title: 'Verify code',
                    subtitle:
                        'Enter the code sent to ${PhoneNumbers.formatGhanaDisplay(phone)}.',
                  ),
                  const SizedBox(height: AppSpacing.xl),
                  _OtpBoxes(controller: _codeController),
                  const SizedBox(height: AppSpacing.sm),
                  Text(
                    'Test code ${SignupController.testOtp}',
                    textAlign: TextAlign.center,
                    style: Theme.of(context).textTheme.titleMedium?.copyWith(
                      color: AppColors.textPrimary,
                      fontWeight: FontWeight.w800,
                      letterSpacing: 1.2,
                    ),
                  ),
                  if (_error != null) ...[
                    const SizedBox(height: AppSpacing.sm),
                    Text(
                      _error!,
                      textAlign: TextAlign.center,
                      style: Theme.of(context).textTheme.bodySmall?.copyWith(
                        color: AppColors.error,
                        fontWeight: FontWeight.w700,
                      ),
                    ),
                  ],
                  const SizedBox(height: AppSpacing.lg),
                  Center(
                    child: TextButton(
                      key: const Key('resend-otp'),
                      onPressed: waiting ? null : _startTimer,
                      child: Text.rich(
                        TextSpan(
                          text: "Didn't receive the code? ",
                          style: Theme.of(context).textTheme.bodyMedium?.copyWith(
                            color: AppColors.textSecondary,
                            fontWeight: FontWeight.w600,
                          ),
                          children: [
                            TextSpan(
                              text: waiting
                                  ? 'Resend in $minutes:$seconds'
                                  : 'Resend code',
                              style: TextStyle(
                                color: waiting
                                    ? AppColors.textSecondary
                                    : AppColors.yellow,
                                fontWeight: FontWeight.w800,
                              ),
                            ),
                          ],
                        ),
                      ),
                    ),
                  ),
                  const SizedBox(height: AppSpacing.md),
                  CyrloButton(
                    key: const Key('verify-otp'),
                    label: 'Verify',
                    onPressed: _verify,
                  ),
                ],
              ),
      ),
    );
  }
}

class _OtpBoxes extends StatelessWidget {
  const _OtpBoxes({required this.controller});

  final TextEditingController controller;

  @override
  Widget build(BuildContext context) {
    final code = controller.text;
    return SizedBox(
      height: 56,
      child: Stack(
        alignment: Alignment.center,
        children: [
          Row(
            children: List.generate(6, (index) {
              final filled = index < code.length;
              final active = code.length == index;
              return Expanded(
                child: AnimatedContainer(
                  duration: AppMotion.fast,
                  curve: AppMotion.standard,
                  margin: EdgeInsets.only(left: index == 0 ? 0 : 6),
                  alignment: Alignment.center,
                  decoration: BoxDecoration(
                    color: AppColors.field,
                    borderRadius: BorderRadius.circular(14),
                    border: Border.all(
                      color: active || filled
                          ? AppColors.yellow
                          : AppColors.border,
                      width: active ? 1.6 : 1,
                    ),
                  ),
                  child: Text(
                    filled ? code[index] : '',
                    style: Theme.of(context).textTheme.titleLarge?.copyWith(
                      fontWeight: FontWeight.w800,
                      color: AppColors.textPrimary,
                    ),
                  ),
                ),
              );
            }),
          ),
          TextField(
            key: const Key('otp-input'),
            controller: controller,
            keyboardType: TextInputType.number,
            maxLength: 6,
            showCursor: false,
            enableInteractiveSelection: false,
            inputFormatters: [FilteringTextInputFormatter.digitsOnly],
            style: const TextStyle(color: Colors.transparent, fontSize: 1),
            decoration: const InputDecoration(
              counterText: '',
              filled: false,
              fillColor: Colors.transparent,
              border: InputBorder.none,
              enabledBorder: InputBorder.none,
              focusedBorder: InputBorder.none,
              contentPadding: EdgeInsets.zero,
            ),
          ),
        ],
      ),
    );
  }
}
