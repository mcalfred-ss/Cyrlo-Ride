import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';

import '../../../core/constants/app_colors.dart';
import '../../../core/theme/app_spacing.dart';
import '../../../shared/widgets/cyrlo_button.dart';
import '../../../shared/widgets/cyrlo_text_field.dart';
import '../../../shared/widgets/flow_scaffold.dart';
import '../../../shared/widgets/screen_header.dart';
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
      child: Column(
        mainAxisSize: MainAxisSize.min,
        crossAxisAlignment: CrossAxisAlignment.stretch,
        children: [
          const ScreenHeader(
            title: 'Your details',
            subtitle: 'This is the name riders will see.',
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
            Text(
              _error!,
              textAlign: TextAlign.center,
              style: TextStyle(color: AppColors.error, fontWeight: FontWeight.w700),
            ),
          ],
          const SizedBox(height: AppSpacing.xl),
          CyrloButton(
            key: const Key('passenger-continue'),
            label: 'Continue',
            onPressed: _submit,
          ),
        ],
      ),
    );
  }
}
