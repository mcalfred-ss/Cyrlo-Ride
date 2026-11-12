import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';

import '../../../core/constants/app_colors.dart';
import '../../../core/theme/app_spacing.dart';
import '../../../core/utils/phone_numbers.dart';
import '../../../shared/widgets/cyrlo_button.dart';
import '../../../shared/widgets/flow_scaffold.dart';
import '../../../shared/widgets/ghana_phone_field.dart';
import '../../../shared/widgets/screen_header.dart';
import '../application/auth_session.dart';
import '../application/signup_controller.dart';

class CreateAccountScreen extends ConsumerStatefulWidget {
  const CreateAccountScreen({super.key});

  @override
  ConsumerState<CreateAccountScreen> createState() => _CreateAccountScreenState();
}

class _CreateAccountScreenState extends ConsumerState<CreateAccountScreen> {
  final _phoneController = TextEditingController();
  String? _error;
  var _busy = false;
  var _returningHint = false;

  @override
  void initState() {
    super.initState();
    Future.microtask(_prefillLastPhone);
  }

  Future<void> _prefillLastPhone() async {
    final draftPhone = ref.read(signupProvider).phoneE164;
    final remembered =
        draftPhone ?? await ref.read(authSessionProvider.notifier).readLastPhoneE164();
    final national = PhoneNumbers.ghanaNationalDigits(remembered);
    if (!mounted || national == null || national.isEmpty) return;
    if (_phoneController.text.trim().isNotEmpty) return;
    setState(() {
      _phoneController.text = national;
      _returningHint = true;
    });
  }

  @override
  void dispose() {
    _phoneController.dispose();
    super.dispose();
  }

  Future<void> _submit() async {
    if (_busy) return;
    setState(() {
      _busy = true;
      _error = null;
    });
    final ok = await ref
        .read(signupProvider.notifier)
        .submitPhone(_phoneController.text);
    if (!mounted) return;
    setState(() {
      _busy = false;
      _error = ok ? null : 'Enter a valid Ghana phone number.';
    });
  }

  @override
  Widget build(BuildContext context) {
    final theme = Theme.of(context);
    return FlowScaffold(
      child: Column(
        mainAxisSize: MainAxisSize.min,
        crossAxisAlignment: CrossAxisAlignment.stretch,
        children: [
          ScreenHeader(
            title: _returningHint ? 'Confirm it’s you' : 'Your phone number',
            subtitle: _returningHint
                ? 'We’ll text a one-time code to this number.'
                : 'We’ll text you a one-time code.',
          ),
          const SizedBox(height: AppSpacing.xl),
          GhanaPhoneField(controller: _phoneController),
          if (_error != null) ...[
            const SizedBox(height: AppSpacing.sm),
            Text(
              _error!,
              style: theme.textTheme.bodySmall?.copyWith(
                color: AppColors.error,
                fontWeight: FontWeight.w700,
              ),
            ),
          ],
          const SizedBox(height: AppSpacing.xl),
          CyrloButton(
            key: const Key('create-account'),
            label: _busy ? 'Checking…' : 'Continue',
            onPressed: _busy ? null : _submit,
          ),
        ],
      ),
    );
  }
}
