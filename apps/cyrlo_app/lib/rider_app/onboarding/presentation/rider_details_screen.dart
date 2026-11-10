import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';

import '../../../core/constants/app_colors.dart';
import '../../../core/theme/app_spacing.dart';
import '../../../features/auth/application/signup_controller.dart';
import '../../../shared/widgets/cyrlo_button.dart';
import '../../../shared/widgets/cyrlo_text_field.dart';
import '../../../shared/widgets/flow_scaffold.dart';
import '../../../shared/widgets/screen_header.dart';

class RiderDetailsScreen extends ConsumerStatefulWidget {
  const RiderDetailsScreen({super.key});

  @override
  ConsumerState<RiderDetailsScreen> createState() => _RiderDetailsScreenState();
}

class _RiderDetailsScreenState extends ConsumerState<RiderDetailsScreen> {
  final _firstNameController = TextEditingController();
  final _lastNameController = TextEditingController();
  final _licenceController = TextEditingController();
  final _ghanaCardController = TextEditingController();
  DateTime? _licenceExpiry;
  String? _error;

  @override
  void dispose() {
    _firstNameController.dispose();
    _lastNameController.dispose();
    _licenceController.dispose();
    _ghanaCardController.dispose();
    super.dispose();
  }

  Future<void> _pickLicenceExpiry() async {
    final now = DateTime.now();
    final initial = _licenceExpiry ?? DateTime(now.year + 1, now.month, now.day);
    final picked = await showDatePicker(
      context: context,
      initialDate: initial.isBefore(now) ? now.add(const Duration(days: 1)) : initial,
      firstDate: now,
      lastDate: DateTime(now.year + 20),
      helpText: "Driver's licence expiry",
    );
    if (picked == null) return;
    setState(() => _licenceExpiry = picked);
  }

  String _formatDate(DateTime date) {
    final day = date.day.toString().padLeft(2, '0');
    final month = date.month.toString().padLeft(2, '0');
    return '$day/$month/${date.year}';
  }

  void _continue() {
    final ok = ref.read(signupProvider.notifier).saveRiderDetails(
          firstName: _firstNameController.text,
          lastName: _lastNameController.text,
          driversLicenceNumber: _licenceController.text,
          driversLicenceExpiry: _licenceExpiry,
          ghanaCardNumber: _ghanaCardController.text,
        );
    setState(() {
      if (ok) {
        _error = null;
        return;
      }
      final ghana = _ghanaCardController.text.trim().toUpperCase();
      if (_firstNameController.text.trim().length < 2 ||
          _lastNameController.text.trim().length < 2) {
        _error = 'Enter your first and last name.';
      } else if (_licenceController.text.trim().length < 5) {
        _error = "Enter your driver's licence number.";
      } else if (_licenceExpiry == null) {
        _error = "Pick your driver's licence expiry date.";
      } else if (!RegExp(r'^GHA-\d{9}-\d$').hasMatch(ghana)) {
        _error = 'Ghana Card must look like GHA-123456789-0.';
      } else {
        _error = 'Complete all required fields.';
      }
    });
  }

  @override
  Widget build(BuildContext context) {
    return FlowScaffold(
      onBack: () => ref.read(signupProvider.notifier).clearDriverKind(),
      footer: CyrloButton(
        key: const Key('rider-details-continue'),
        label: 'Continue',
        onPressed: _continue,
      ),
      child: Column(
        mainAxisSize: MainAxisSize.min,
        crossAxisAlignment: CrossAxisAlignment.stretch,
        children: [
          const ScreenHeader(
            title: 'Rider details',
            subtitle:
                'We need your legal name, licence, and Ghana Card to verify you.',
          ),
          const SizedBox(height: AppSpacing.lg),
          CyrloTextField(
            key: const Key('rider-first-name'),
            controller: _firstNameController,
            label: 'First name',
            textInputAction: TextInputAction.next,
          ),
          const SizedBox(height: AppSpacing.sm),
          CyrloTextField(
            key: const Key('rider-last-name'),
            controller: _lastNameController,
            label: 'Last name',
            textInputAction: TextInputAction.next,
          ),
          const SizedBox(height: AppSpacing.sm),
          CyrloTextField(
            key: const Key('rider-licence-number'),
            controller: _licenceController,
            label: "Driver's licence number",
            textInputAction: TextInputAction.next,
          ),
          const SizedBox(height: AppSpacing.sm),
          InkWell(
            key: const Key('rider-licence-expiry'),
            onTap: _pickLicenceExpiry,
            borderRadius: BorderRadius.circular(12),
            child: InputDecorator(
              decoration: const InputDecoration(
                labelText: "Driver's licence expiry",
                border: OutlineInputBorder(),
              ),
              child: Text(
                _licenceExpiry == null
                    ? 'Tap to choose date'
                    : _formatDate(_licenceExpiry!),
                style: TextStyle(
                  color: _licenceExpiry == null
                      ? AppColors.textSecondary
                      : AppColors.textPrimary,
                ),
              ),
            ),
          ),
          const SizedBox(height: AppSpacing.sm),
          CyrloTextField(
            key: const Key('rider-ghana-card'),
            controller: _ghanaCardController,
            label: 'Ghana Card number',
            hint: 'GHA-123456789-0',
            textInputAction: TextInputAction.done,
          ),
          if (_error != null) ...[
            const SizedBox(height: AppSpacing.sm),
            Text(
              _error!,
              style: const TextStyle(color: AppColors.error),
            ),
          ],
        ],
      ),
    );
  }
}
