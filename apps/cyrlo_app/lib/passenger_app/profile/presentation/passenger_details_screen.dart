import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';

import '../../../core/constants/app_colors.dart';
import '../../../core/theme/app_spacing.dart';
import '../../../shared/widgets/cyrlo_button.dart';
import '../../../shared/widgets/cyrlo_text_field.dart';
import '../../../shared/widgets/flow_scaffold.dart';
import '../../../features/auth/application/signup_controller.dart';

class PassengerDetailsScreen extends ConsumerStatefulWidget {
  const PassengerDetailsScreen({super.key});

  @override
  ConsumerState<PassengerDetailsScreen> createState() => _PassengerDetailsScreenState();
}

class _PassengerDetailsScreenState extends ConsumerState<PassengerDetailsScreen> {
  final _nameController = TextEditingController();
  String? _error;

  @override
  void dispose() {
    _nameController.dispose();
    super.dispose();
  }

  void _submit() {
    final ok = ref.read(signupProvider.notifier).savePassengerDetails(_nameController.text);
    setState(() => _error = ok ? null : 'Enter your full name.');
  }

  @override
  Widget build(BuildContext context) {
    return FlowScaffold(
      footer: CyrloButton(
        key: const Key('passenger-continue'),
        label: 'Continue',
        onPressed: _submit,
      ),
      child: ListView(
        children: [
          Text(
            'Your details',
            style: Theme.of(context).textTheme.headlineSmall?.copyWith(
              fontWeight: FontWeight.w900,
            ),
          ),
          const SizedBox(height: AppSpacing.xs),
          Text(
            'This is the name riders will see.',
            style: Theme.of(context).textTheme.bodyLarge?.copyWith(
              color: AppColors.textSecondary,
            ),
          ),
          const SizedBox(height: AppSpacing.xl),
          CyrloTextField(
            fieldKey: const Key('passenger-name'),
            controller: _nameController,
            label: 'Full name',
            hint: 'Ama Mensah',
            textInputAction: TextInputAction.done,
          ),
          if (_error != null) ...[
            const SizedBox(height: AppSpacing.sm),
            Text(_error!, style: TextStyle(color: AppColors.error, fontWeight: FontWeight.w700)),
          ],
        ],
      ),
    );
  }
}
