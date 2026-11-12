import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';

import '../../../core/constants/app_colors.dart';
import '../../../core/errors/api_exception.dart';
import '../../../core/mapping/device_location_gateway.dart';
import '../../../core/mapping/mapping_providers.dart';
import '../../../core/theme/app_spacing.dart';
import '../../../features/auth/application/signup_controller.dart';
import '../../../features/auth/application/signup_draft.dart';
import '../../../shared/models/geo_point.dart';
import '../../../shared/widgets/cyrlo_button.dart';
import '../../../shared/widgets/cyrlo_text_field.dart';
import '../../../shared/widgets/flow_scaffold.dart';
import '../../../shared/widgets/screen_header.dart';

/// Edit name, location, DOB, and gender from the Account tab.
class EditPersonalDetailsScreen extends ConsumerStatefulWidget {
  const EditPersonalDetailsScreen({super.key, required this.role});

  final RideRole role;

  @override
  ConsumerState<EditPersonalDetailsScreen> createState() =>
      _EditPersonalDetailsScreenState();
}

class _EditPersonalDetailsScreenState
    extends ConsumerState<EditPersonalDetailsScreen> {
  late final TextEditingController _firstNameController;
  late final TextEditingController _lastNameController;
  late final TextEditingController _locationController;
  DateTime? _dateOfBirth;
  PassengerGender? _gender;
  GeoPoint? _locationPoint;
  var _locating = false;
  var _applyingLocation = false;
  var _saving = false;
  String? _error;

  bool get _isPassenger => widget.role == RideRole.passenger;

  @override
  void initState() {
    super.initState();
    final draft = ref.read(signupProvider);
    _firstNameController = TextEditingController(
      text: (_isPassenger ? draft.passengerFirstName : draft.riderFirstName) ??
          '',
    );
    _lastNameController = TextEditingController(
      text: (_isPassenger ? draft.passengerLastName : draft.riderLastName) ?? '',
    );
    _locationController = TextEditingController(
      text: (_isPassenger ? draft.passengerLocation : draft.riderLocation) ?? '',
    );
    _dateOfBirth =
        _isPassenger ? draft.passengerDateOfBirth : draft.riderDateOfBirth;
    _gender = _isPassenger ? draft.passengerGender : draft.riderGender;
    _locationPoint = _isPassenger
        ? draft.passengerLocationPoint
        : draft.riderLocationPoint;
    _locationController.addListener(_onLocationEdited);
  }

  @override
  void dispose() {
    _locationController.removeListener(_onLocationEdited);
    _firstNameController.dispose();
    _lastNameController.dispose();
    _locationController.dispose();
    super.dispose();
  }

  void _onLocationEdited() {
    if (_applyingLocation || _locationPoint == null) return;
    setState(() => _locationPoint = null);
  }

  Future<void> _pickDateOfBirth() async {
    final now = DateTime.now();
    final initial =
        _dateOfBirth ?? DateTime(now.year - 22, now.month, now.day);
    final picked = await showDatePicker(
      context: context,
      initialDate: initial,
      firstDate: DateTime(now.year - 100),
      lastDate: DateTime(now.year - 16, now.month, now.day),
      helpText: 'Date of birth',
    );
    if (picked == null) return;
    setState(() => _dateOfBirth = picked);
  }

  String _formatDate(DateTime date) {
    final day = date.day.toString().padLeft(2, '0');
    final month = date.month.toString().padLeft(2, '0');
    return '$day/$month/${date.year}';
  }

  Future<void> _useMyLocation() async {
    setState(() {
      _locating = true;
      _error = null;
    });
    final result = await ref.read(deviceLocationGatewayProvider).current();
    if (!mounted) return;
    if (!result.hasFix || result.point == null) {
      setState(() {
        _locating = false;
        _error = switch (result.status) {
          DeviceLocationStatus.denied =>
            'Allow location access, or type your area instead.',
          DeviceLocationStatus.serviceDisabled =>
            'Turn on location services, or type your area instead.',
          _ => 'Could not get your location. Type your area instead.',
        };
      });
      return;
    }
    final point = result.point!;
    var label =
        'Current location (${point.latitude.toStringAsFixed(4)}, ${point.longitude.toStringAsFixed(4)})';
    try {
      final hit = await ref.read(placeLookupGatewayProvider).reverse(point);
      final resolved = hit?.address?.trim().isNotEmpty == true
          ? hit!.address!.trim()
          : hit?.label.trim();
      if (resolved != null && resolved.isNotEmpty) {
        label = resolved;
      }
    } catch (_) {
      // Keep the GPS label when reverse lookup is unavailable.
    }
    if (!mounted) return;
    _applyingLocation = true;
    _locationController.text = label;
    _applyingLocation = false;
    setState(() {
      _locationPoint = point;
      _locating = false;
    });
  }

  Future<void> _save() async {
    if (_saving) return;
    setState(() {
      _saving = true;
      _error = null;
    });
    try {
      final ok = _isPassenger
          ? await ref.read(signupProvider.notifier).savePassengerDetails(
                firstName: _firstNameController.text,
                lastName: _lastNameController.text,
                dateOfBirth: _dateOfBirth,
                gender: _gender,
                location: _locationController.text,
                locationPoint: _locationPoint,
              )
          : ref.read(signupProvider.notifier).saveRiderPersonalDetails(
                firstName: _firstNameController.text,
                lastName: _lastNameController.text,
                dateOfBirth: _dateOfBirth,
                gender: _gender,
                location: _locationController.text,
                locationPoint: _locationPoint,
              );
      if (!mounted) return;
      if (!ok) {
        setState(() {
          _saving = false;
          if (_firstNameController.text.trim().length < 2) {
            _error = 'Enter your first name.';
          } else if (_lastNameController.text.trim().length < 2) {
            _error = 'Enter your last name.';
          } else if (_dateOfBirth == null) {
            _error = 'Select your date of birth.';
          } else if (_gender == null) {
            _error = 'Select your gender.';
          } else if (_locationController.text.trim().length < 2) {
            _error = 'Type your location or use my location.';
          } else {
            _error = 'You must be at least 16 years old.';
          }
        });
        return;
      }
      Navigator.of(context).pop(true);
    } catch (error) {
      if (!mounted) return;
      setState(() {
        _saving = false;
        _error = error is ApiException
            ? error.message
            : 'Could not save your details. Try again.';
      });
    }
  }

  @override
  Widget build(BuildContext context) {
    return FlowScaffold(
      onBack: () => Navigator.of(context).pop(),
      footer: CyrloButton(
        key: const Key('save-personal-details'),
        label: _saving ? 'Saving…' : 'Save changes',
        onPressed: (_locating || _saving) ? null : _save,
      ),
      child: Column(
        mainAxisSize: MainAxisSize.min,
        crossAxisAlignment: CrossAxisAlignment.stretch,
        children: [
          const ScreenHeader(
            title: 'Edit personal details',
            subtitle: 'Update how you appear in Cyrlo Ride.',
          ),
          const SizedBox(height: AppSpacing.xl),
          CyrloTextField(
            fieldKey: const Key('edit-first-name'),
            controller: _firstNameController,
            label: 'First name',
            hint: 'Ama',
            textInputAction: TextInputAction.next,
          ),
          const SizedBox(height: AppSpacing.md),
          CyrloTextField(
            fieldKey: const Key('edit-last-name'),
            controller: _lastNameController,
            label: 'Last name',
            hint: 'Mensah',
            textInputAction: TextInputAction.next,
          ),
          const SizedBox(height: AppSpacing.md),
          CyrloTextField(
            fieldKey: const Key('edit-location'),
            controller: _locationController,
            label: 'Location',
            hint: 'Type your area, e.g. Accra',
            textInputAction: TextInputAction.done,
          ),
          const SizedBox(height: AppSpacing.sm),
          Align(
            alignment: Alignment.centerLeft,
            child: TextButton.icon(
              key: const Key('edit-use-my-location'),
              onPressed: _locating ? null : _useMyLocation,
              icon: _locating
                  ? const SizedBox(
                      width: 16,
                      height: 16,
                      child: CircularProgressIndicator(strokeWidth: 2),
                    )
                  : const Icon(Icons.my_location_rounded, size: 18),
              label: Text(_locating ? 'Getting location...' : 'Use my location'),
              style: TextButton.styleFrom(
                foregroundColor: AppColors.onBrandSoft,
                textStyle: const TextStyle(fontWeight: FontWeight.w800),
              ),
            ),
          ),
          const SizedBox(height: AppSpacing.md),
          Text(
            'Date of birth',
            style: Theme.of(context).textTheme.labelLarge?.copyWith(
                  color: AppColors.textPrimary,
                  fontWeight: FontWeight.w800,
                ),
          ),
          const SizedBox(height: 8),
          Material(
            color: Colors.transparent,
            child: InkWell(
              key: const Key('edit-dob'),
              onTap: _pickDateOfBirth,
              borderRadius: BorderRadius.circular(14),
              child: Ink(
                padding:
                    const EdgeInsets.symmetric(horizontal: 16, vertical: 16),
                decoration: BoxDecoration(
                  color: AppColors.field,
                  borderRadius: BorderRadius.circular(14),
                  border: Border.all(color: AppColors.border),
                ),
                child: Row(
                  children: [
                    Expanded(
                      child: Text(
                        _dateOfBirth == null
                            ? 'Select date'
                            : _formatDate(_dateOfBirth!),
                        style: Theme.of(context).textTheme.bodyMedium?.copyWith(
                              color: _dateOfBirth == null
                                  ? AppColors.textSecondary
                                  : AppColors.textPrimary,
                              fontWeight: FontWeight.w700,
                            ),
                      ),
                    ),
                    Icon(
                      Icons.calendar_today_rounded,
                      size: 18,
                      color: AppColors.textSecondary,
                    ),
                  ],
                ),
              ),
            ),
          ),
          const SizedBox(height: AppSpacing.md),
          Text(
            'Gender',
            style: Theme.of(context).textTheme.labelLarge?.copyWith(
                  color: AppColors.textPrimary,
                  fontWeight: FontWeight.w800,
                ),
          ),
          const SizedBox(height: 8),
          Wrap(
            spacing: 8,
            runSpacing: 8,
            children: [
              _GenderChip(
                key: const Key('edit-gender-male'),
                label: 'Male',
                selected: _gender == PassengerGender.male,
                onTap: () => setState(() => _gender = PassengerGender.male),
              ),
              _GenderChip(
                key: const Key('edit-gender-female'),
                label: 'Female',
                selected: _gender == PassengerGender.female,
                onTap: () => setState(() => _gender = PassengerGender.female),
              ),
            ],
          ),
          if (_error != null) ...[
            const SizedBox(height: AppSpacing.sm),
            Text(
              _error!,
              textAlign: TextAlign.center,
              style: const TextStyle(
                color: AppColors.error,
                fontWeight: FontWeight.w700,
              ),
            ),
          ],
        ],
      ),
    );
  }
}

class _GenderChip extends StatelessWidget {
  const _GenderChip({
    super.key,
    required this.label,
    required this.selected,
    required this.onTap,
  });

  final String label;
  final bool selected;
  final VoidCallback onTap;

  @override
  Widget build(BuildContext context) {
    return Material(
      color: selected ? AppColors.yellow : AppColors.field,
      borderRadius: BorderRadius.circular(999),
      child: InkWell(
        onTap: onTap,
        borderRadius: BorderRadius.circular(999),
        child: Padding(
          padding: const EdgeInsets.symmetric(horizontal: 16, vertical: 10),
          child: Text(
            label,
            style: TextStyle(
              color: selected ? AppColors.darkGrey : AppColors.textPrimary,
              fontWeight: FontWeight.w800,
            ),
          ),
        ),
      ),
    );
  }
}
