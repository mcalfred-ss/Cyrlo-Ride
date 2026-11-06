import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';

import '../../../core/constants/app_colors.dart';
import '../../../core/theme/app_spacing.dart';
import '../../../features/auth/application/signup_controller.dart';
import '../../../features/auth/application/signup_draft.dart';
import '../../../shared/widgets/cyrlo_button.dart';
import '../../../shared/widgets/cyrlo_text_field.dart';
import '../../../shared/widgets/flow_scaffold.dart';
import '../../../shared/widgets/screen_header.dart';

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
      child: Column(
        mainAxisSize: MainAxisSize.min,
        crossAxisAlignment: CrossAxisAlignment.stretch,
        children: [
          ScreenHeader(
            title: 'Apply to drive',
            subtitle: '$vehicle driver. We review this before you can go online.',
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
            Text(
              _error!,
              textAlign: TextAlign.center,
              style: TextStyle(color: AppColors.error, fontWeight: FontWeight.w700),
            ),
          ],
          const SizedBox(height: AppSpacing.xl),
          CyrloButton(
            key: const Key('rider-submit'),
            label: 'Submit for approval',
            onPressed: _submit,
          ),
        ],
      ),
    );
  }
}
