import 'dart:io';

import 'package:flutter/foundation.dart';
import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';

import '../../../core/constants/app_colors.dart';
import '../../../core/errors/api_exception.dart';
import '../../../core/media/document_pick_gateway.dart';
import '../../../core/theme/app_radii.dart';
import '../../../core/theme/app_spacing.dart';
import '../../../features/auth/application/signup_controller.dart';
import '../../../shared/widgets/cyrlo_button.dart';
import '../../../shared/widgets/cyrlo_text_field.dart';
import '../../../shared/widgets/flow_scaffold.dart';
import '../../../shared/widgets/screen_header.dart';
import '../data/rider_onboarding_models.dart';

class RiderDocumentsScreen extends ConsumerStatefulWidget {
  const RiderDocumentsScreen({super.key});

  @override
  ConsumerState<RiderDocumentsScreen> createState() =>
      _RiderDocumentsScreenState();
}

class _RiderDocumentsScreenState extends ConsumerState<RiderDocumentsScreen> {
  final _registrationController = TextEditingController();
  final _makeController = TextEditingController();
  final _modelController = TextEditingController();
  final _colourController = TextEditingController();
  late final TextEditingController _capacityController;

  final Map<RiderDocumentKind, String?> _paths = {
    for (final kind in RiderDocumentKind.values) kind: null,
  };

  var _submitting = false;
  String? _error;

  @override
  void initState() {
    super.initState();
    final category = ref.read(signupProvider).vehicleCategory;
    _capacityController = TextEditingController(
      text: '${category?.defaultCapacity ?? 3}',
    );
  }

  @override
  void dispose() {
    _registrationController.dispose();
    _makeController.dispose();
    _modelController.dispose();
    _colourController.dispose();
    _capacityController.dispose();
    super.dispose();
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

  Future<void> _submit() async {
    final category = ref.read(signupProvider).vehicleCategory;
    final capacity = int.tryParse(_capacityController.text.trim());
    final maxCapacity = category?.maxCapacity ?? 4;
    final missing = RiderDocumentKind.values
        .where((kind) => (_paths[kind] ?? '').isEmpty)
        .toList();
    if (_registrationController.text.trim().length < 2 ||
        _makeController.text.trim().isEmpty ||
        _modelController.text.trim().isEmpty ||
        _colourController.text.trim().isEmpty ||
        capacity == null ||
        capacity < 1 ||
        capacity > maxCapacity ||
        missing.isNotEmpty) {
      setState(() {
        _error = missing.isNotEmpty
            ? 'Upload: ${missing.first.label}.'
            : 'Complete vehicle details and all documents.';
      });
      return;
    }

    setState(() {
      _submitting = true;
      _error = null;
    });

    try {
      await ref.read(signupProvider.notifier).submitRiderOnboarding(
            registrationNumber: _registrationController.text,
            make: _makeController.text,
            model: _modelController.text,
            colour: _colourController.text,
            capacity: capacity,
            ghanaCardPath: _paths[RiderDocumentKind.ghanaCard]!,
            driversLicencePath: _paths[RiderDocumentKind.driversLicence]!,
            riderPhotoPath: _paths[RiderDocumentKind.riderPhoto]!,
            vehiclePhotoPath: _paths[RiderDocumentKind.vehiclePhoto]!,
            vehicleRegistrationPath:
                _paths[RiderDocumentKind.vehicleRegistration]!,
            roadworthinessPath: _paths[RiderDocumentKind.roadworthiness]!,
            insurancePath: _paths[RiderDocumentKind.insurance]!,
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
    final category = ref.watch(signupProvider).vehicleCategory;
    final categoryLabel = category?.label ?? 'Vehicle';

    return FlowScaffold(
      onBack: _submitting
          ? null
          : () => ref.read(signupProvider.notifier).clearRiderProfile(),
      footer: CyrloButton(
        key: const Key('rider-submit'),
        label: _submitting ? 'Submitting…' : 'Submit for approval',
        onPressed: _submitting ? null : _submit,
      ),
      child: Column(
        mainAxisSize: MainAxisSize.min,
        crossAxisAlignment: CrossAxisAlignment.stretch,
        children: [
          ScreenHeader(
            title: 'Vehicle & documents',
            subtitle:
                'Upload required $categoryLabel photos and papers. Files go to secure storage.',
          ),
          const SizedBox(height: AppSpacing.lg),
          CyrloTextField(
            key: const Key('rider-registration'),
            controller: _registrationController,
            label: 'Registration number',
          ),
          const SizedBox(height: AppSpacing.sm),
          CyrloTextField(
            key: const Key('rider-make'),
            controller: _makeController,
            label: 'Make',
          ),
          const SizedBox(height: AppSpacing.sm),
          CyrloTextField(
            key: const Key('rider-model'),
            controller: _modelController,
            label: 'Model',
          ),
          const SizedBox(height: AppSpacing.sm),
          CyrloTextField(
            key: const Key('rider-colour'),
            controller: _colourController,
            label: 'Colour',
          ),
          const SizedBox(height: AppSpacing.sm),
          CyrloTextField(
            key: const Key('rider-capacity'),
            controller: _capacityController,
            label: 'Passenger capacity',
            keyboardType: TextInputType.number,
          ),
          const SizedBox(height: AppSpacing.lg),
          for (final kind in RiderDocumentKind.values) ...[
            _DocTile(
              kind: kind,
              path: _paths[kind],
              onPick: _submitting ? null : () => _pick(kind),
            ),
            const SizedBox(height: AppSpacing.sm),
          ],
          if (_error != null)
            Text(
              _error!,
              style: const TextStyle(color: AppColors.error),
            ),
        ],
      ),
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
    return Material(
      color: AppColors.field,
      borderRadius: BorderRadius.circular(AppRadii.md),
      child: InkWell(
        key: Key('doc-${kind.name}'),
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
                      kind.label,
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
