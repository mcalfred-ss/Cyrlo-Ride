import 'dart:io';

import 'package:flutter/foundation.dart';
import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';

import '../../../core/constants/app_colors.dart';
import '../../../core/errors/api_exception.dart';
import '../../../core/media/document_pick_gateway.dart';
import '../../../core/theme/app_motion.dart';
import '../../../core/theme/app_radii.dart';
import '../../../core/theme/app_spacing.dart';
import '../../../features/auth/application/signup_controller.dart';
import '../../../shared/widgets/choice_card.dart';
import '../../../shared/widgets/cyrlo_button.dart';
import '../../../shared/widgets/cyrlo_text_field.dart';
import '../../../shared/widgets/flow_scaffold.dart';
import '../../../shared/widgets/screen_header.dart';
import '../data/rider_onboarding_models.dart';

enum _IdChoice { ghanaCard, driversLicence }

class RiderDocumentsScreen extends ConsumerStatefulWidget {
  const RiderDocumentsScreen({super.key});

  @override
  ConsumerState<RiderDocumentsScreen> createState() =>
      _RiderDocumentsScreenState();
}

class _RiderDocumentsScreenState extends ConsumerState<RiderDocumentsScreen> {
  final _ghanaCardController = TextEditingController();
  final _licenceController = TextEditingController();
  final _registrationController = TextEditingController();
  DateTime? _licenceExpiry;
  _IdChoice? _idChoice;

  final Map<RiderDocumentKind, String?> _paths = {
    RiderDocumentKind.ghanaCard: null,
    RiderDocumentKind.driversLicence: null,
    RiderDocumentKind.riderPhoto: null,
  };

  /// 0 = pick ID, 1 = ID details, 2 = vehicle + selfie
  var _step = 0;
  var _submitting = false;
  String? _error;

  static const _stepCount = 3;

  @override
  void dispose() {
    _ghanaCardController.dispose();
    _licenceController.dispose();
    _registrationController.dispose();
    super.dispose();
  }

  bool get _ghanaOk {
    final ghana = _ghanaCardController.text.trim().toUpperCase();
    final path = _paths[RiderDocumentKind.ghanaCard] ?? '';
    return RegExp(r'^GHA-\d{9}-\d$').hasMatch(ghana) && path.isNotEmpty;
  }

  bool get _licenceOk {
    final licence = _licenceController.text.trim();
    final path = _paths[RiderDocumentKind.driversLicence] ?? '';
    return licence.length >= 5 && _licenceExpiry != null && path.isNotEmpty;
  }

  bool get _idOk => switch (_idChoice) {
        _IdChoice.ghanaCard => _ghanaOk,
        _IdChoice.driversLicence => _licenceOk,
        null => false,
      };

  bool get _vehicleSelfieOk {
    final plate = _registrationController.text.trim();
    final path = _paths[RiderDocumentKind.riderPhoto] ?? '';
    return plate.length >= 2 && path.isNotEmpty;
  }

  String get _stepTitle => switch (_step) {
        0 => 'Choose ID',
        1 => _idChoice == _IdChoice.ghanaCard
            ? 'Ghana Card'
            : "Driver's licence",
        _ => 'Vehicle & selfie',
      };

  String get _stepSubtitle => switch (_step) {
        0 => 'Use either your Ghana Card or driver’s licence — one is enough.',
        1 => _idChoice == _IdChoice.ghanaCard
            ? 'Enter the number and upload a clear photo of the card.'
            : 'Enter licence details and upload a clear photo.',
        _ => 'Add your car number and a selfie, then submit for approval.',
      };

  Future<void> _pickLicenceExpiry() async {
    final now = DateTime.now();
    final initial =
        _licenceExpiry ?? DateTime(now.year + 1, now.month, now.day);
    final picked = await showDatePicker(
      context: context,
      initialDate:
          initial.isBefore(now) ? now.add(const Duration(days: 1)) : initial,
      firstDate: now,
      lastDate: DateTime(now.year + 20),
      helpText: "Driver's licence expiry",
    );
    if (picked == null) return;
    setState(() {
      _licenceExpiry = picked;
      _error = null;
    });
  }

  String _formatDate(DateTime date) {
    final day = date.day.toString().padLeft(2, '0');
    final month = date.month.toString().padLeft(2, '0');
    return '$day/$month/${date.year}';
  }

  Future<void> _pick(RiderDocumentKind kind) async {
    final gateway = ref.read(documentPickGatewayProvider);
    final path = kind == RiderDocumentKind.riderPhoto
        ? await gateway.pickFromCamera() ?? await gateway.pickFromGallery()
        : await gateway.pickFromGallery();
    if (!mounted || path == null) return;
    setState(() {
      _paths[kind] = path;
      _error = null;
    });
  }

  void _onBack() {
    if (_submitting) return;
    if (_step > 0) {
      setState(() {
        _step -= 1;
        _error = null;
        if (_step == 0) _idChoice = null;
      });
      return;
    }
    ref.read(signupProvider.notifier).clearRiderProfile();
  }

  void _selectId(_IdChoice choice) {
    setState(() {
      _idChoice = choice;
      _error = null;
      _step = 1;
    });
  }

  void _goNext() {
    setState(() {
      _error = null;
      if (_step == 0) {
        if (_idChoice == null) {
          _error = 'Choose Ghana Card or driver’s licence.';
          return;
        }
        _step = 1;
        return;
      }
      if (_step == 1) {
        if (!_idOk) {
          if (_idChoice == _IdChoice.ghanaCard) {
            final ghana = _ghanaCardController.text.trim().toUpperCase();
            _error = !RegExp(r'^GHA-\d{9}-\d$').hasMatch(ghana)
                ? 'Ghana Card must look like GHA-123456789-0.'
                : 'Upload your Ghana Card photo.';
          } else if (_licenceController.text.trim().length < 5) {
            _error = "Enter your driver's licence number.";
          } else if (_licenceExpiry == null) {
            _error = "Pick your driver's licence expiry date.";
          } else {
            _error = 'Upload your licence photo.';
          }
          return;
        }
        _step = 2;
      }
    });
  }

  Future<void> _submit() async {
    if (!_vehicleSelfieOk) {
      setState(() {
        _error = _registrationController.text.trim().length < 2
            ? 'Enter your vehicle / car number.'
            : 'Upload a selfie.';
      });
      return;
    }
    if (!_idOk) {
      setState(() {
        _step = _idChoice == null ? 0 : 1;
        _error = 'Finish your ID step first.';
      });
      return;
    }

    setState(() {
      _submitting = true;
      _error = null;
    });

    try {
      final useGhana = _idChoice == _IdChoice.ghanaCard;
      await ref.read(signupProvider.notifier).submitRiderOnboarding(
            registrationNumber: _registrationController.text,
            riderPhotoPath: _paths[RiderDocumentKind.riderPhoto]!,
            ghanaCardNumber:
                useGhana ? _ghanaCardController.text : null,
            ghanaCardPath:
                useGhana ? _paths[RiderDocumentKind.ghanaCard] : null,
            driversLicenceNumber:
                useGhana ? null : _licenceController.text,
            driversLicenceExpiry: useGhana ? null : _licenceExpiry,
            driversLicencePath: useGhana
                ? null
                : _paths[RiderDocumentKind.driversLicence],
          );
    } on ApiException catch (error) {
      if (!mounted) return;
      setState(() => _error = error.message);
    } catch (_) {
      if (!mounted) return;
      setState(() => _error = 'Could not submit. Check your connection.');
    } finally {
      if (mounted) setState(() => _submitting = false);
    }
  }

  @override
  Widget build(BuildContext context) {
    final isLast = _step == _stepCount - 1;
    final showContinue = _step > 0;
    return FlowScaffold(
      onBack: _submitting ? null : _onBack,
      footer: showContinue
          ? CyrloButton(
              key: Key(isLast ? 'rider-submit' : 'rider-docs-continue'),
              label: _submitting
                  ? 'Submitting…'
                  : (isLast ? 'Submit for approval' : 'Continue'),
              onPressed: _submitting
                  ? null
                  : () {
                      if (isLast) {
                        _submit();
                      } else {
                        _goNext();
                      }
                    },
            )
          : null,
      child: Column(
        mainAxisSize: MainAxisSize.min,
        crossAxisAlignment: CrossAxisAlignment.stretch,
        children: [
          _StepProgress(step: _step, total: _stepCount),
          const SizedBox(height: AppSpacing.md),
          ScreenHeader(
            title: _stepTitle,
            subtitle: _stepSubtitle,
          ),
          const SizedBox(height: AppSpacing.lg),
          AnimatedSwitcher(
            duration: AppMotion.normal,
            switchInCurve: AppMotion.standard,
            switchOutCurve: AppMotion.exit,
            child: KeyedSubtree(
              key: ValueKey('${_step}_${_idChoice?.name}'),
              child: switch (_step) {
                0 => _buildChooseStep(),
                1 => _idChoice == _IdChoice.ghanaCard
                    ? _buildGhanaStep()
                    : _buildLicenceStep(),
                _ => _buildVehicleSelfieStep(),
              },
            ),
          ),
          if (_error != null) ...[
            const SizedBox(height: AppSpacing.md),
            Text(
              _error!,
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

  Widget _buildChooseStep() {
    return Column(
      mainAxisSize: MainAxisSize.min,
      crossAxisAlignment: CrossAxisAlignment.stretch,
      children: [
        ChoiceCard(
          key: const Key('id-choose-ghana'),
          title: 'Ghana Card',
          subtitle: 'National ID',
          icon: Icons.badge_outlined,
          highlighted: true,
          onTap: () => _selectId(_IdChoice.ghanaCard),
        ),
        const SizedBox(height: AppSpacing.sm),
        ChoiceCard(
          key: const Key('id-choose-licence'),
          title: "Driver's licence",
          subtitle: 'Valid Ghana licence',
          icon: Icons.credit_card_outlined,
          onTap: () => _selectId(_IdChoice.driversLicence),
        ),
      ],
    );
  }

  Widget _buildGhanaStep() {
    return Column(
      mainAxisSize: MainAxisSize.min,
      crossAxisAlignment: CrossAxisAlignment.stretch,
      children: [
        CyrloTextField(
          fieldKey: const Key('rider-ghana-card'),
          controller: _ghanaCardController,
          label: 'Ghana Card number',
          hint: 'GHA-123456789-0',
          textInputAction: TextInputAction.done,
        ),
        const SizedBox(height: AppSpacing.sm),
        _DocTile(
          kind: RiderDocumentKind.ghanaCard,
          path: _paths[RiderDocumentKind.ghanaCard],
          onPick:
              _submitting ? null : () => _pick(RiderDocumentKind.ghanaCard),
        ),
      ],
    );
  }

  Widget _buildLicenceStep() {
    return Column(
      mainAxisSize: MainAxisSize.min,
      crossAxisAlignment: CrossAxisAlignment.stretch,
      children: [
        CyrloTextField(
          fieldKey: const Key('rider-licence-number'),
          controller: _licenceController,
          label: 'Licence number',
          textInputAction: TextInputAction.next,
        ),
        const SizedBox(height: AppSpacing.sm),
        Text(
          'Licence expiry',
          style: Theme.of(context).textTheme.labelLarge?.copyWith(
                color: AppColors.textPrimary,
                fontWeight: FontWeight.w800,
              ),
        ),
        const SizedBox(height: 8),
        Material(
          color: Colors.transparent,
          child: InkWell(
            key: const Key('rider-licence-expiry'),
            onTap: _submitting ? null : _pickLicenceExpiry,
            borderRadius: BorderRadius.circular(14),
            child: Ink(
              padding: const EdgeInsets.symmetric(horizontal: 16, vertical: 16),
              decoration: BoxDecoration(
                color: AppColors.field,
                borderRadius: BorderRadius.circular(14),
                border: Border.all(color: AppColors.border),
              ),
              child: Row(
                children: [
                  Expanded(
                    child: Text(
                      _licenceExpiry == null
                          ? 'Tap to choose date'
                          : _formatDate(_licenceExpiry!),
                      style: Theme.of(context).textTheme.bodyMedium?.copyWith(
                            color: _licenceExpiry == null
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
        const SizedBox(height: AppSpacing.sm),
        _DocTile(
          kind: RiderDocumentKind.driversLicence,
          path: _paths[RiderDocumentKind.driversLicence],
          onPick: _submitting
              ? null
              : () => _pick(RiderDocumentKind.driversLicence),
        ),
      ],
    );
  }

  Widget _buildVehicleSelfieStep() {
    return Column(
      mainAxisSize: MainAxisSize.min,
      crossAxisAlignment: CrossAxisAlignment.stretch,
      children: [
        CyrloTextField(
          fieldKey: const Key('rider-registration'),
          controller: _registrationController,
          label: 'Car number',
          hint: 'GR 1234-25',
          textInputAction: TextInputAction.done,
        ),
        const SizedBox(height: AppSpacing.md),
        _DocTile(
          kind: RiderDocumentKind.riderPhoto,
          path: _paths[RiderDocumentKind.riderPhoto],
          onPick:
              _submitting ? null : () => _pick(RiderDocumentKind.riderPhoto),
        ),
      ],
    );
  }
}

class _StepProgress extends StatelessWidget {
  const _StepProgress({required this.step, required this.total});

  final int step;
  final int total;

  @override
  Widget build(BuildContext context) {
    return Column(
      crossAxisAlignment: CrossAxisAlignment.stretch,
      children: [
        Text(
          'Step ${step + 1} of $total',
          style: Theme.of(context).textTheme.labelLarge?.copyWith(
                color: AppColors.textSecondary,
                fontWeight: FontWeight.w800,
              ),
        ),
        const SizedBox(height: 8),
        Row(
          children: List.generate(total, (index) {
            final done = index < step;
            final current = index == step;
            return Expanded(
              child: AnimatedContainer(
                duration: AppMotion.fast,
                curve: AppMotion.standard,
                height: 4,
                margin: EdgeInsets.only(left: index == 0 ? 0 : 6),
                decoration: BoxDecoration(
                  color: done || current ? AppColors.yellow : AppColors.border,
                  borderRadius: BorderRadius.circular(999),
                ),
              ),
            );
          }),
        ),
      ],
    );
  }
}

class _DocTile extends StatelessWidget {
  const _DocTile({
    required this.kind,
    required this.path,
    required this.onPick,
  });

  final RiderDocumentKind kind;
  final String? path;
  final VoidCallback? onPick;

  @override
  Widget build(BuildContext context) {
    final hasFile = path != null && path!.isNotEmpty;
    final keyName = switch (kind) {
      RiderDocumentKind.ghanaCard => 'upload-ghana-card',
      RiderDocumentKind.driversLicence => 'upload-drivers-licence',
      RiderDocumentKind.riderPhoto => 'upload-selfie',
      _ => 'doc-${kind.name}',
    };
    return Material(
      color: AppColors.field,
      borderRadius: BorderRadius.circular(AppRadii.md),
      child: InkWell(
        key: Key(keyName),
        onTap: onPick,
        borderRadius: BorderRadius.circular(AppRadii.md),
        child: Padding(
          padding: const EdgeInsets.all(AppSpacing.md),
          child: Row(
            children: [
              if (hasFile && !kIsWeb)
                ClipRRect(
                  borderRadius: BorderRadius.circular(8),
                  child: Image.file(
                    File(path!),
                    width: 48,
                    height: 48,
                    fit: BoxFit.cover,
                    errorBuilder: (_, __, ___) => const Icon(Icons.description),
                  ),
                )
              else
                Icon(
                  hasFile ? Icons.check_circle : Icons.upload_file_rounded,
                  color: hasFile ? AppColors.brand : AppColors.textSecondary,
                ),
              const SizedBox(width: AppSpacing.sm),
              Expanded(
                child: Column(
                  crossAxisAlignment: CrossAxisAlignment.start,
                  children: [
                    Text(
                      switch (kind) {
                        RiderDocumentKind.ghanaCard => 'Ghana Card photo',
                        RiderDocumentKind.driversLicence => 'Licence photo',
                        RiderDocumentKind.riderPhoto => 'Selfie',
                        _ => kind.label,
                      },
                      style: const TextStyle(fontWeight: FontWeight.w600),
                    ),
                    Text(
                      hasFile ? 'Selected' : 'Tap to upload',
                      style: TextStyle(
                        color: AppColors.textSecondary,
                        fontSize: 13,
                      ),
                    ),
                  ],
                ),
              ),
            ],
          ),
        ),
      ),
    );
  }
}
