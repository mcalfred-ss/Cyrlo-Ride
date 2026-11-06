import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';

import '../../../core/constants/app_colors.dart';
import '../../../core/theme/app_spacing.dart';
import '../../../features/auth/application/signup_controller.dart';
import '../../../features/auth/application/signup_draft.dart';
import '../../../shared/widgets/cyrlo_button.dart';
import '../../../shared/widgets/cyrlo_text_field.dart';
import '../../../shared/widgets/flow_scaffold.dart';

class RiderApplicationScreen extends ConsumerStatefulWidget {
  const RiderApplicationScreen({super.key});

  @override
  ConsumerState<RiderApplicationScreen> createState() => _RiderApplicationScreenState();
}

class _RiderApplicationScreenState extends ConsumerState<RiderApplicationScreen> {
  final _nameController = TextEditingController();
  String? _error;

  @override
  void dispose() {
    _nameController.dispose();
    super.dispose();
  }

  void _submit() {
    final ok = ref.read(signupProvider.notifier).submitRiderApplication(_nameController.text);
    setState(() => _error = ok ? null : 'Enter your full name.');
  }

  @override
  Widget build(BuildContext context) {
    final kind = ref.watch(signupProvider).driverKind;
    final vehicle = switch (kind) {
      DriverKind.okada => 'Okada',
      DriverKind.pragya => 'Pragya',
      DriverKind.aboboyaa || null => 'Vehicle',
    };

    return FlowScaffold(
      footer: CyrloButton(
        key: const Key('rider-submit'),
        label: 'Submit for approval',
        onPressed: _submit,
      ),
      child: ListView(
        children: [
          Text(
            'Apply to drive',
            style: Theme.of(context).textTheme.headlineSmall?.copyWith(
              fontWeight: FontWeight.w900,
            ),
          ),
          const SizedBox(height: AppSpacing.xs),
          Text(
            '$vehicle driver. We review this before you can go online.',
            style: Theme.of(context).textTheme.bodyLarge?.copyWith(
              color: AppColors.textSecondary,
              height: 1.4,
            ),
          ),
          const SizedBox(height: AppSpacing.xl),
          CyrloTextField(
            fieldKey: const Key('rider-name'),
            controller: _nameController,
            label: 'Full name',
            hint: 'Kwame Boateng',
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
