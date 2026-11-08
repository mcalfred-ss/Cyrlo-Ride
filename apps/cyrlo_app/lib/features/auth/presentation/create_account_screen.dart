import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';

import '../../../core/constants/app_colors.dart';
import '../../../core/theme/app_spacing.dart';
import '../../../shared/widgets/cyrlo_button.dart';
import '../../../shared/widgets/flow_scaffold.dart';
import '../../../shared/widgets/ghana_phone_field.dart';
import '../../../shared/widgets/screen_header.dart';
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
    return FlowScaffold(
      child: Column(
        mainAxisSize: MainAxisSize.min,
        crossAxisAlignment: CrossAxisAlignment.stretch,
        children: [
          const ScreenHeader(
            title: 'Sign in',
            subtitle: 'We’ll text a code to this number.',
          ),
          const SizedBox(height: AppSpacing.xl),
          GhanaPhoneField(controller: _phoneController),
          if (_error != null) ...[
            const SizedBox(height: AppSpacing.sm),
            Text(
              _error!,
              style: Theme.of(context).textTheme.bodySmall?.copyWith(
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
