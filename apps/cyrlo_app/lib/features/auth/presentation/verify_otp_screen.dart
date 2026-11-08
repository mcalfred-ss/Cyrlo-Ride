import 'dart:async';

import 'package:dio/dio.dart';
import 'package:flutter/material.dart';
import 'package:flutter/services.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';

import '../../../core/constants/app_colors.dart';
import '../../../core/errors/api_exception.dart';
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
  var _busy = false;
  var _sending = false;

  @override
  void initState() {
    super.initState();
    _codeController.addListener(() => setState(() {}));
    WidgetsBinding.instance.addPostFrameCallback((_) => _requestCode());
  }

  @override
  void dispose() {
    _timer?.cancel();
    _codeController.dispose();
    super.dispose();
  }

  void _startTimer([int seconds = 60]) {
    _timer?.cancel();
    setState(() => _secondsLeft = seconds);
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

  Future<void> _requestCode() async {
    if (_sending || _verified) return;
    setState(() {
      _sending = true;
      _error = null;
    });
    try {
      final result = await ref.read(signupProvider.notifier).requestOtp();
      if (!mounted) return;
      _startTimer(result.resendAfter.clamp(15, 300));
    } catch (error) {
      if (!mounted) return;
      final api = _asApi(error);
      final wait = api?.resendAfterSeconds;
      if (wait != null && wait > 0) {
        _startTimer(wait.clamp(1, 300));
      }
      setState(() => _error = _messageFor(error));
    } finally {
      if (mounted) setState(() => _sending = false);
    }
  }

  Future<void> _verify() async {
    if (_verified || _busy) return;
    final code = _codeController.text.trim();
    if (code.length != 6) {
      setState(() => _error = 'Enter the 6-digit code from SMS.');
      return;
    }

    setState(() {
      _busy = true;
      _error = null;
    });

    try {
      await ref.read(signupProvider.notifier).verifyOtp(code);
      if (!mounted) return;
      setState(() => _verified = true);
      await Future<void>.delayed(const Duration(milliseconds: 1200));
      if (!mounted) return;
      // Router reacts to otpVerified on signupProvider.
    } catch (error) {
      if (!mounted) return;
      setState(() => _error = _messageFor(error));
    } finally {
      if (mounted) setState(() => _busy = false);
    }
  }

  ApiException? _asApi(Object error) {
    if (error is ApiException) return error;
    if (error is DioException && error.error is ApiException) {
      return error.error! as ApiException;
    }
    if (error is DioException) {
      return ApiException.fromJson(
        error.response?.data,
        statusCode: error.response?.statusCode,
      );
    }
    return null;
  }

  String _messageFor(Object error) {
    return _asApi(error)?.message ??
        'Could not reach Cyrlo Ride. Check your connection.';
  }

  @override
  Widget build(BuildContext context) {
    final phone = ref.watch(signupProvider).phoneE164;
    final minutes = (_secondsLeft ~/ 60).toString();
    final seconds = (_secondsLeft % 60).toString().padLeft(2, '0');
    final waiting = _secondsLeft > 0 || _sending;

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
                      onPressed: _busy
                          ? null
                          : () => ref.read(signupProvider.notifier).clearRole(),
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
                  if (_sending) ...[
                    const SizedBox(height: AppSpacing.sm),
                    Text(
                      'Sending code…',
                      textAlign: TextAlign.center,
                      style: Theme.of(context).textTheme.bodyMedium?.copyWith(
                            color: AppColors.textSecondary,
                            fontWeight: FontWeight.w600,
                          ),
                    ),
                  ],
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
                      onPressed: waiting ? null : _requestCode,
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
                                  ? (_sending
                                      ? 'Sending…'
                                      : 'Resend in $minutes:$seconds')
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
                    label: _busy ? 'Verifying…' : 'Verify',
                    onPressed: _busy || _sending ? null : _verify,
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
