import 'dart:io';

import 'package:flutter/foundation.dart';
import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';

import '../../../core/constants/app_colors.dart';
import '../../../core/media/document_pick_gateway.dart';
import '../../../core/theme/app_radii.dart';
import '../../../core/theme/app_spacing.dart';
import '../../../features/auth/application/signup_controller.dart';
import '../../../features/auth/application/signup_draft.dart';
import '../../../shared/widgets/cyrlo_button.dart';
import '../../../shared/widgets/cyrlo_text_field.dart';
import '../../../shared/widgets/flow_scaffold.dart';
import '../../../shared/widgets/screen_header.dart';

class RiderDocumentsScreen extends ConsumerStatefulWidget {
  const RiderDocumentsScreen({super.key});

  @override
  ConsumerState<RiderDocumentsScreen> createState() => _RiderDocumentsScreenState();
}

class _RiderDocumentsScreenState extends ConsumerState<RiderDocumentsScreen> {
  final _vehicleController = TextEditingController();
  RiderIdType? _idType;
  String? _idFrontPath;
  String? _selfiePath;
  String? _error;

  @override
  void dispose() {
    _vehicleController.dispose();
    super.dispose();
  }

  Future<void> _pickIdFront() async {
    final path = await ref.read(documentPickGatewayProvider).pickFromGallery();
    if (!mounted || path == null) return;
    setState(() {
      _idFrontPath = path;
      _error = null;
    });
  }

  Future<void> _pickSelfie() async {
    final gateway = ref.read(documentPickGatewayProvider);
    final path = await gateway.pickFromCamera() ?? await gateway.pickFromGallery();
    if (!mounted || path == null) return;
    setState(() {
      _selfiePath = path;
      _error = null;
    });
  }

  void _submit() {
    final ok = ref.read(signupProvider.notifier).submitRiderDocuments(
      idType: _idType,
      idFrontPath: _idFrontPath,
      vehicleNumber: _vehicleController.text,
      selfiePath: _selfiePath,
    );
    setState(() {
      if (ok) {
        _error = null;
        return;
      }
      if (_idType == null) {
        _error = 'Choose driver’s license or Ghana Card.';
      } else if (_idFrontPath == null) {
        _error = 'Upload the front of your ID.';
      } else if (_vehicleController.text.trim().length < 3) {
        _error = 'Enter your vehicle / car number.';
      } else if (_selfiePath == null) {
        _error = 'Add a clear selfie of yourself.';
      } else {
        _error = 'Complete your details first.';
      }
    });
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
      child: Column(
        mainAxisSize: MainAxisSize.min,
        crossAxisAlignment: CrossAxisAlignment.stretch,
        children: [
          ScreenHeader(
            title: 'Verify your ID',
            subtitle:
                'Upload $vehicle papers so we can review you before you go online.',
          ),
          const SizedBox(height: AppSpacing.xl),
          Text(
            'ID type',
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
              _IdTypeChip(
                key: const Key('id-drivers-license'),
                label: 'Driver’s license',
                selected: _idType == RiderIdType.driversLicense,
                onTap: () => setState(() => _idType = RiderIdType.driversLicense),
              ),
              _IdTypeChip(
                key: const Key('id-ghana-card'),
                label: 'Ghana Card',
                selected: _idType == RiderIdType.ghanaCard,
                onTap: () => setState(() => _idType = RiderIdType.ghanaCard),
              ),
            ],
          ),
          const SizedBox(height: AppSpacing.md),
          _UploadTile(
            key: const Key('upload-id-front'),
            title: 'ID front',
            subtitle: _idType == RiderIdType.ghanaCard
                ? 'Clear photo of your Ghana Card front'
                : 'Clear photo of your license front',
            path: _idFrontPath,
            icon: Icons.badge_rounded,
            onTap: _pickIdFront,
          ),
          const SizedBox(height: AppSpacing.md),
          CyrloTextField(
            fieldKey: const Key('rider-vehicle-number'),
            controller: _vehicleController,
            label: 'Vehicle / car number',
            hint: 'GR 1234-25',
            textInputAction: TextInputAction.done,
          ),
          const SizedBox(height: AppSpacing.md),
          _UploadTile(
            key: const Key('upload-selfie'),
            title: 'Selfie',
            subtitle: 'Take a clear face photo of yourself',
            path: _selfiePath,
            icon: Icons.person_rounded,
            onTap: _pickSelfie,
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

class _IdTypeChip extends StatelessWidget {
  const _IdTypeChip({
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
      color: Colors.transparent,
      child: InkWell(
        onTap: onTap,
        borderRadius: BorderRadius.circular(999),
        child: Ink(
          padding: const EdgeInsets.symmetric(horizontal: 14, vertical: 10),
          decoration: BoxDecoration(
            color: selected ? AppColors.yellow : AppColors.field,
            borderRadius: BorderRadius.circular(999),
            border: Border.all(
              color: selected ? AppColors.yellow : AppColors.border,
            ),
          ),
          child: Text(
            label,
            style: Theme.of(context).textTheme.labelLarge?.copyWith(
              color: AppColors.darkGrey,
              fontWeight: FontWeight.w800,
            ),
          ),
        ),
      ),
    );
  }
}

class _UploadTile extends StatelessWidget {
  const _UploadTile({
    super.key,
    required this.title,
    required this.subtitle,
    required this.path,
    required this.icon,
    required this.onTap,
  });

  final String title;
  final String subtitle;
  final String? path;
  final IconData icon;
  final VoidCallback onTap;

  @override
  Widget build(BuildContext context) {
    final theme = Theme.of(context);
    final hasFile = path != null && path!.isNotEmpty;

    return Material(
      color: AppColors.field,
      borderRadius: BorderRadius.circular(AppRadii.lg),
      child: InkWell(
        onTap: onTap,
        borderRadius: BorderRadius.circular(AppRadii.lg),
        child: Ink(
          padding: const EdgeInsets.all(14),
          decoration: BoxDecoration(
            borderRadius: BorderRadius.circular(AppRadii.lg),
            border: Border.all(
              color: hasFile ? AppColors.yellow : AppColors.border,
              width: hasFile ? 1.6 : 1,
            ),
          ),
          child: Row(
            children: [
              ClipRRect(
                borderRadius: BorderRadius.circular(14),
                child: SizedBox(
                  width: 64,
                  height: 64,
                  child: hasFile
                      ? _Preview(path: path!)
                      : ColoredBox(
                          color: AppColors.surface,
                          child: Icon(icon, color: AppColors.darkGrey),
                        ),
                ),
              ),
              const SizedBox(width: 12),
              Expanded(
                child: Column(
                  crossAxisAlignment: CrossAxisAlignment.start,
                  children: [
                    Text(
                      title,
                      style: theme.textTheme.titleSmall?.copyWith(
                        color: AppColors.textPrimary,
                        fontWeight: FontWeight.w800,
                      ),
                    ),
                    const SizedBox(height: 2),
                    Text(
                      hasFile ? 'Photo added · tap to change' : subtitle,
                      style: theme.textTheme.bodyMedium?.copyWith(
                        color: AppColors.textSecondary,
                        fontWeight: FontWeight.w500,
                      ),
                    ),
                  ],
                ),
              ),
              Icon(
                hasFile ? Icons.check_circle_rounded : Icons.upload_rounded,
                color: AppColors.darkGrey,
              ),
            ],
          ),
        ),
      ),
    );
  }
}

class _Preview extends StatelessWidget {
  const _Preview({required this.path});

  final String path;

  @override
  Widget build(BuildContext context) {
    if (kIsWeb || path.startsWith('demo/')) {
      return ColoredBox(
        color: AppColors.brandLight,
        child: Icon(
          path.contains('selfie') ? Icons.person_rounded : Icons.badge_rounded,
          color: AppColors.darkGrey,
        ),
      );
    }

    return Image.file(
      File(path),
      fit: BoxFit.cover,
      errorBuilder: (context, error, stackTrace) => ColoredBox(
        color: AppColors.brandLight,
        child: const Icon(Icons.image_rounded, color: AppColors.darkGrey),
      ),
    );
  }
}
