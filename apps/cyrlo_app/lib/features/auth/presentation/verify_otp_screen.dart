import 'dart:async';

import 'package:flutter/material.dart';
import 'package:flutter/services.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';

import '../../../core/constants/app_colors.dart';
import '../../../core/theme/app_spacing.dart';
import '../../../core/utils/phone_numbers.dart';
import '../../../shared/widgets/cyrlo_button.dart';
import '../../../shared/widgets/flow_scaffold.dart';
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

  void _verify() {
    final ok = ref.read(signupProvider.notifier).verifyOtp(_codeController.text);
    setState(() => _error = ok ? null : 'Enter the 6-digit code.');
  }

  @override
  Widget build(BuildContext context) {
    final phone = ref.watch(signupProvider).phoneE164;
    final minutes = (_secondsLeft ~/ 60).toString();
    final seconds = (_secondsLeft % 60).toString().padLeft(2, '0');
    final waiting = _secondsLeft > 0;

    return FlowScaffold(
      child: ListView(
        children: [
          Align(
            alignment: Alignment.centerLeft,
            child: IconButton(
              onPressed: () => ref.read(signupProvider.notifier).editPhone(),
              icon: const Icon(Icons.arrow_back_rounded),
              color: AppColors.textPrimary,
            ),
          ),
          const SizedBox(height: AppSpacing.sm),
          Text(
            'Verify code',
            textAlign: TextAlign.center,
            style: Theme.of(context).textTheme.headlineSmall?.copyWith(
              fontWeight: FontWeight.w800,
              color: AppColors.textPrimary,
            ),
          ),
          const SizedBox(height: AppSpacing.xs),
          Text(
            'Enter the code sent to ${PhoneNumbers.formatGhanaDisplay(phone)}.',
            textAlign: TextAlign.center,
            style: Theme.of(context).textTheme.bodyLarge?.copyWith(
              color: AppColors.textSecondary,
              height: 1.4,
            ),
          ),
          const SizedBox(height: 36),
          _OtpBoxes(controller: _codeController),
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
                      text: waiting ? 'Resend in $minutes:$seconds' : 'Resend code',
                      style: TextStyle(
                        color: waiting ? AppColors.textSecondary : AppColors.yellow,
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
                child: Container(
                  margin: EdgeInsets.only(left: index == 0 ? 0 : 6),
                  alignment: Alignment.center,
                  decoration: BoxDecoration(
                    color: AppColors.field,
                    borderRadius: BorderRadius.circular(14),
                    border: Border.all(
                      color: active || filled ? AppColors.yellow : AppColors.border,
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
