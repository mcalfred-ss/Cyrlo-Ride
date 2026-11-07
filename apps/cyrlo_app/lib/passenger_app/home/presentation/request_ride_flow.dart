import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:go_router/go_router.dart';

import '../../../core/constants/app_colors.dart';
import '../../../core/routing/app_routes.dart';
import '../../../core/theme/app_radii.dart';
import '../../../core/theme/app_spacing.dart';
import '../../../core/utils/phone_numbers.dart';
import '../../../features/auth/application/signup_controller.dart';
import '../../../features/auth/application/signup_draft.dart';
import '../../../shared/ride_session/active_ride_request_controller.dart';
import '../../../shared/widgets/cyrlo_button.dart';
import '../../../shared/widgets/ghana_phone_field.dart';
import '../../../shared/widgets/illustration_view.dart';
import '../application/nearby_riders_provider.dart';
import '../application/ride_request_fee.dart';
import '../domain/nearby_rider.dart';

Future<void> startRequestRideFlow({
  required BuildContext context,
  required WidgetRef ref,
  required NearbyRider rider,
}) async {
  if (!rider.canRequest) return;

  final wantsRequest = await showDialog<bool>(
    context: context,
    barrierDismissible: true,
    builder: (context) => _RequestRideConfirmDialog(rider: rider),
  );
  if (wantsRequest != true || !context.mounted) return;

  final contactPhone = await showModalBottomSheet<String>(
    context: context,
    isScrollControlled: true,
    backgroundColor: Colors.transparent,
    barrierColor: Colors.black.withValues(alpha: 0.35),
    builder: (context) => const _ContactNumberSheet(),
  );
  if (contactPhone == null || contactPhone.isEmpty || !context.mounted) return;

  final paid = await showModalBottomSheet<bool>(
    context: context,
    isScrollControlled: true,
    backgroundColor: Colors.transparent,
    barrierColor: Colors.black.withValues(alpha: 0.35),
    builder: (context) => _RequestFeeSheet(rider: rider),
  );
  if (paid != true || !context.mounted) return;

  final started = ref.read(activeRideRequestProvider.notifier).startFromNearbyRider(
        rider,
        contactPhoneE164: contactPhone,
      );
  ref.read(selectedNearbyRiderProvider.notifier).select(rider);

  ScaffoldMessenger.of(context).showSnackBar(
    SnackBar(
      behavior: SnackBarBehavior.floating,
      backgroundColor: AppColors.darkGrey,
      content: Text(
        started
            ? '${rider.kindLabel} requested. Rider number is now shared — set your pickup.'
            : '${rider.kindLabel} requested. Set your pickup so they can find you.',
        style: const TextStyle(
          color: Colors.white,
          fontWeight: FontWeight.w700,
        ),
      ),
    ),
  );

  context.go(AppRoutes.passengerMap);
}

class _RequestRideConfirmDialog extends StatelessWidget {
  const _RequestRideConfirmDialog({required this.rider});

  final NearbyRider rider;

  String get _asset => switch (rider.kind) {
        DriverKind.okada => AppIllustrations.vehicleOkada,
        DriverKind.pragya => AppIllustrations.vehiclePragya,
        DriverKind.aboboyaa => AppIllustrations.vehicleAboboyaa,
      };

  @override
  Widget build(BuildContext context) {
    final theme = Theme.of(context);

    return Dialog(
      backgroundColor: AppColors.surface,
      shape: RoundedRectangleBorder(
        borderRadius: BorderRadius.circular(24),
      ),
      insetPadding: const EdgeInsets.symmetric(horizontal: 28, vertical: 24),
      child: Padding(
        padding: const EdgeInsets.fromLTRB(20, 20, 20, 16),
        child: Column(
          mainAxisSize: MainAxisSize.min,
          children: [
            ClipRRect(
              borderRadius: BorderRadius.circular(AppRadii.md),
              child: ColoredBox(
                color: Theme.of(context).brightness == Brightness.dark
                    ? Colors.transparent
                    : AppColors.illustrationNest,
                child: ThemedIllustrationImage(
                  asset: _asset,
                  width: 88,
                  height: 88,
                  fit: BoxFit.cover,
                ),
              ),
            ),
            const SizedBox(height: AppSpacing.md),
            Text(
              'Request ${rider.displayName}?',
              textAlign: TextAlign.center,
              style: theme.textTheme.titleLarge?.copyWith(
                color: AppColors.textPrimary,
                fontWeight: FontWeight.w800,
              ),
            ),
            const SizedBox(height: 4),
            Text(
              rider.kindRiderLabel,
              textAlign: TextAlign.center,
              style: theme.textTheme.bodyMedium?.copyWith(
                color: AppColors.textSecondary,
                fontWeight: FontWeight.w700,
              ),
            ),
            const SizedBox(height: 8),
            Text(
              '${rider.etaLabel}. They’ll come to your pickup. You’ll tell them where you’re going when they arrive.',
              textAlign: TextAlign.center,
              style: theme.textTheme.bodyMedium?.copyWith(
                color: AppColors.textSecondary,
                height: 1.4,
                fontWeight: FontWeight.w500,
              ),
            ),
            const SizedBox(height: AppSpacing.lg),
            Row(
              children: [
                Expanded(
                  child: CyrloButton(
                    key: const Key('request-ride-no'),
                    label: 'No',
                    variant: CyrloButtonVariant.outlined,
                    onPressed: () => Navigator.of(context).pop(false),
                  ),
                ),
                const SizedBox(width: AppSpacing.sm),
                Expanded(
                  child: CyrloButton(
                    key: const Key('request-ride-yes'),
                    label: 'Request',
                    onPressed: () => Navigator.of(context).pop(true),
                  ),
                ),
              ],
            ),
          ],
        ),
      ),
    );
  }
}

class _ContactNumberSheet extends ConsumerStatefulWidget {
  const _ContactNumberSheet();

  @override
  ConsumerState<_ContactNumberSheet> createState() => _ContactNumberSheetState();
}

class _ContactNumberSheetState extends ConsumerState<_ContactNumberSheet> {
  final _phoneController = TextEditingController();
  var _useSignupNumber = true;
  String? _error;

  @override
  void dispose() {
    _phoneController.dispose();
    super.dispose();
  }

  void _selectUseMyNumber() {
    setState(() {
      _useSignupNumber = true;
      _error = null;
      _phoneController.clear();
    });
  }

  void _selectTypeNumber() {
    setState(() {
      _useSignupNumber = false;
      _error = null;
    });
  }

  void _continue() {
    final signupPhone = ref.read(signupProvider).phoneE164;
    if (_useSignupNumber) {
      if (signupPhone == null || signupPhone.isEmpty) {
        setState(() => _error = 'No signup number found. Type a number instead.');
        return;
      }
      Navigator.of(context).pop(signupPhone);
      return;
    }

    final typed = PhoneNumbers.normalizeGhanaToE164(_phoneController.text);
    if (typed == null) {
      setState(() => _error = 'Enter a valid Ghana number the rider can call.');
      return;
    }
    Navigator.of(context).pop(typed);
  }

  @override
  Widget build(BuildContext context) {
    final theme = Theme.of(context);
    final signupPhone = ref.watch(signupProvider).phoneE164;
    final signupDisplay = PhoneNumbers.formatGhanaDisplay(signupPhone);
    final bottomInset = MediaQuery.viewInsetsOf(context).bottom;

    return Padding(
      padding: EdgeInsets.only(bottom: bottomInset),
      child: Align(
        alignment: Alignment.bottomCenter,
        child: ConstrainedBox(
          constraints: const BoxConstraints(maxWidth: 520),
          child: Material(
            color: AppColors.surface,
            borderRadius: const BorderRadius.vertical(top: Radius.circular(28)),
            clipBehavior: Clip.antiAlias,
            child: SafeArea(
              top: false,
              child: SingleChildScrollView(
                padding: const EdgeInsets.fromLTRB(20, 10, 20, 20),
                child: Column(
                  mainAxisSize: MainAxisSize.min,
                  crossAxisAlignment: CrossAxisAlignment.stretch,
                  children: [
                    Center(
                      child: Container(
                        width: 42,
                        height: 4,
                        decoration: BoxDecoration(
                          color: AppColors.border,
                          borderRadius: BorderRadius.circular(AppRadii.pill),
                        ),
                      ),
                    ),
                    const SizedBox(height: 18),
                    Text(
                      'Number riders can call',
                      style: theme.textTheme.titleLarge?.copyWith(
                        color: AppColors.textPrimary,
                        fontWeight: FontWeight.w800,
                      ),
                    ),
                    const SizedBox(height: 6),
                    Text(
                      'Some people use more than one phone. Choose the number the rider should call for this pickup.',
                      style: theme.textTheme.bodyMedium?.copyWith(
                        color: AppColors.textSecondary,
                        height: 1.4,
                        fontWeight: FontWeight.w500,
                      ),
                    ),
                    const SizedBox(height: AppSpacing.md),
                    _ContactChoiceTile(
                      key: const Key('use-my-number'),
                      selected: _useSignupNumber,
                      title: 'Use my number',
                      subtitle: signupDisplay.isEmpty
                          ? 'Your signup number'
                          : signupDisplay,
                      icon: Icons.phone_iphone_rounded,
                      onTap: _selectUseMyNumber,
                    ),
                    const SizedBox(height: AppSpacing.sm),
                    _ContactChoiceTile(
                      key: const Key('type-another-number'),
                      selected: !_useSignupNumber,
                      title: 'Type another number',
                      subtitle: 'Use a different phone for this request',
                      icon: Icons.edit_rounded,
                      onTap: _selectTypeNumber,
                    ),
                    if (!_useSignupNumber) ...[
                      const SizedBox(height: AppSpacing.md),
                      GhanaPhoneField(
                        controller: _phoneController,
                        label: 'Call me on',
                        fieldKey: const Key('request-contact-phone'),
                      ),
                    ],
                    if (_error != null) ...[
                      const SizedBox(height: AppSpacing.sm),
                      Text(
                        _error!,
                        style: const TextStyle(
                          color: AppColors.error,
                          fontWeight: FontWeight.w700,
                        ),
                      ),
                    ],
                    const SizedBox(height: AppSpacing.lg),
                    CyrloButton(
                      key: const Key('confirm-contact-number'),
                      label: 'Continue',
                      onPressed: _continue,
                    ),
                    const SizedBox(height: AppSpacing.sm),
                    CyrloButton(
                      key: const Key('cancel-contact-number'),
                      label: 'Cancel',
                      variant: CyrloButtonVariant.outlined,
                      onPressed: () => Navigator.of(context).pop(),
                    ),
                  ],
                ),
              ),
            ),
          ),
        ),
      ),
    );
  }
}

class _ContactChoiceTile extends StatelessWidget {
  const _ContactChoiceTile({
    super.key,
    required this.selected,
    required this.title,
    required this.subtitle,
    required this.icon,
    required this.onTap,
  });

  final bool selected;
  final String title;
  final String subtitle;
  final IconData icon;
  final VoidCallback onTap;

  @override
  Widget build(BuildContext context) {
    final theme = Theme.of(context);
    return Material(
      color: selected ? AppColors.brandLight : AppColors.field,
      borderRadius: BorderRadius.circular(AppRadii.lg),
      child: InkWell(
        onTap: onTap,
        borderRadius: BorderRadius.circular(AppRadii.lg),
        child: Ink(
          padding: const EdgeInsets.all(14),
          decoration: BoxDecoration(
            borderRadius: BorderRadius.circular(AppRadii.lg),
            border: Border.all(
              color: selected ? AppColors.yellow : AppColors.border,
              width: selected ? 1.6 : 1,
            ),
          ),
          child: Row(
            children: [
              Container(
                width: 42,
                height: 42,
                decoration: BoxDecoration(
                  color: selected ? AppColors.yellow : AppColors.surface,
                  borderRadius: BorderRadius.circular(14),
                ),
                child: Icon(
                  icon,
                  color: selected ? AppColors.darkGrey : AppColors.textPrimary,
                  size: 20,
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
                      subtitle,
                      style: theme.textTheme.bodyMedium?.copyWith(
                        color: AppColors.textSecondary,
                        fontWeight: FontWeight.w500,
                      ),
                    ),
                  ],
                ),
              ),
              Icon(
                selected ? Icons.check_circle_rounded : Icons.circle_outlined,
                color: selected ? AppColors.onBrandLight : AppColors.textSecondary,
              ),
            ],
          ),
        ),
      ),
    );
  }
}

class _RequestFeeSheet extends StatefulWidget {
  const _RequestFeeSheet({required this.rider});

  final NearbyRider rider;

  @override
  State<_RequestFeeSheet> createState() => _RequestFeeSheetState();
}

class _RequestFeeSheetState extends State<_RequestFeeSheet> {
  var _paying = false;

  Future<void> _payAndRequest() async {
    if (_paying) return;
    setState(() => _paying = true);
    await Future<void>.delayed(const Duration(milliseconds: 700));
    if (!mounted) return;
    Navigator.of(context).pop(true);
  }

  @override
  Widget build(BuildContext context) {
    final theme = Theme.of(context);
    final rider = widget.rider;

    return Align(
      alignment: Alignment.bottomCenter,
      child: ConstrainedBox(
        constraints: const BoxConstraints(maxWidth: 520),
        child: Material(
          color: AppColors.surface,
          borderRadius: const BorderRadius.vertical(top: Radius.circular(28)),
          clipBehavior: Clip.antiAlias,
          child: SafeArea(
            top: false,
            child: Padding(
              padding: const EdgeInsets.fromLTRB(20, 10, 20, 20),
              child: Column(
                mainAxisSize: MainAxisSize.min,
                crossAxisAlignment: CrossAxisAlignment.stretch,
                children: [
                  Center(
                    child: Container(
                      width: 42,
                      height: 4,
                      decoration: BoxDecoration(
                        color: AppColors.border,
                        borderRadius: BorderRadius.circular(AppRadii.pill),
                      ),
                    ),
                  ),
                  const SizedBox(height: 18),
                  Text(
                    'Request fee',
                    style: theme.textTheme.titleLarge?.copyWith(
                      color: AppColors.textPrimary,
                      fontWeight: FontWeight.w800,
                    ),
                  ),
                  const SizedBox(height: 6),
                  Text(
                    'Pay ${RideRequestFee.label} to send your ${rider.kindLabel} request. Trip fare stays between you and the rider.',
                    style: theme.textTheme.bodyMedium?.copyWith(
                      color: AppColors.textSecondary,
                      height: 1.4,
                      fontWeight: FontWeight.w500,
                    ),
                  ),
                  const SizedBox(height: AppSpacing.md),
                  DecoratedBox(
                    decoration: BoxDecoration(
                      color: AppColors.brandLight,
                      borderRadius: BorderRadius.circular(AppRadii.lg),
                      border: Border.all(color: AppColors.border),
                    ),
                    child: Padding(
                      padding: const EdgeInsets.all(AppSpacing.md),
                      child: Row(
                        children: [
                          Container(
                            width: 48,
                            height: 48,
                            decoration: BoxDecoration(
                              color: AppColors.yellow,
                              borderRadius: BorderRadius.circular(14),
                            ),
                            child: const Icon(
                              Icons.payments_rounded,
                              color: AppColors.darkGrey,
                            ),
                          ),
                          const SizedBox(width: AppSpacing.sm),
                          Expanded(
                            child: Column(
                              crossAxisAlignment: CrossAxisAlignment.start,
                              children: [
                                Text(
                                  'Cyrlo request fee',
                                  style: theme.textTheme.titleSmall?.copyWith(
                                    color: AppColors.textPrimary,
                                    fontWeight: FontWeight.w800,
                                  ),
                                ),
                                const SizedBox(height: 2),
                                Text(
                                  'Required before requesting',
                                  style: theme.textTheme.bodyMedium?.copyWith(
                                    color: AppColors.textSecondary,
                                    fontWeight: FontWeight.w500,
                                  ),
                                ),
                              ],
                            ),
                          ),
                          Text(
                            RideRequestFee.label,
                            style: theme.textTheme.titleMedium?.copyWith(
                              color: AppColors.onBrandLight,
                              fontWeight: FontWeight.w800,
                            ),
                          ),
                        ],
                      ),
                    ),
                  ),
                  const SizedBox(height: AppSpacing.lg),
                  CyrloButton(
                    key: const Key('pay-request-fee'),
                    label: _paying
                        ? 'Processing...'
                        : 'Pay ${RideRequestFee.label} & request',
                    onPressed: _paying ? null : _payAndRequest,
                  ),
                  const SizedBox(height: AppSpacing.sm),
                  CyrloButton(
                    key: const Key('cancel-request-fee'),
                    label: 'Cancel',
                    variant: CyrloButtonVariant.outlined,
                    onPressed:
                        _paying ? null : () => Navigator.of(context).pop(false),
                  ),
                ],
              ),
            ),
          ),
        ),
      ),
    );
  }
}
