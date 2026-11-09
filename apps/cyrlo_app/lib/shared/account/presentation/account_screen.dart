import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:url_launcher/url_launcher.dart';

import '../../../core/config/app_config.dart';
import '../../../core/constants/app_colors.dart';
import '../../../core/theme/app_radii.dart';
import '../../../core/theme/app_spacing.dart';
import '../../../core/theme/theme_mode_provider.dart';
import '../../../features/auth/application/signup_controller.dart';
import '../../../features/auth/application/signup_draft.dart';
import '../../../shared/ride_session/active_ride_request_controller.dart';
import '../../../shared/widgets/cyrlo_button.dart';

/// Polished account tab for passenger and rider.
class AccountScreen extends ConsumerWidget {
  const AccountScreen({super.key, required this.role});

  final RideRole role;

  String _formatDob(DateTime date) {
    final day = date.day.toString().padLeft(2, '0');
    final month = date.month.toString().padLeft(2, '0');
    return '$day/$month/${date.year}';
  }

  String _genderLabel(PassengerGender? gender) {
    return switch (gender) {
      PassengerGender.male => 'Male',
      PassengerGender.female => 'Female',
      null => '—',
    };
  }

  String _driverLabel(DriverKind? kind) {
    return switch (kind) {
      DriverKind.okada => 'Okada',
      DriverKind.pragya => 'Pragya',
      DriverKind.aboboyaa => 'Aboboyaa',
      null => '—',
    };
  }

  String _idTypeLabel(RiderIdType? type) {
    return switch (type) {
      RiderIdType.driversLicense => 'Driver’s license',
      RiderIdType.ghanaCard => 'Ghana Card',
      null => '—',
    };
  }

  Future<void> _confirmSignOut(BuildContext context, WidgetRef ref) async {
    final ok = await showDialog<bool>(
      context: context,
      builder: (context) => AlertDialog(
        backgroundColor: AppColors.surface,
        shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(24)),
        title: const Text('Sign out?'),
        content: const Text(
          'You’ll need to verify your number again to get back in.',
          style: TextStyle(height: 1.4),
        ),
        actions: [
          TextButton(
            onPressed: () => Navigator.of(context).pop(false),
            child: const Text('Cancel'),
          ),
          FilledButton(
            key: const Key('confirm-sign-out'),
            onPressed: () => Navigator.of(context).pop(true),
            child: const Text('Sign out'),
          ),
        ],
      ),
    );
    if (ok != true || !context.mounted) return;
    _clearSession(ref);
    ref.read(signupProvider.notifier).signOut();
  }

  Future<void> _confirmDeleteAccount(BuildContext context, WidgetRef ref) async {
    final ok = await showDialog<bool>(
      context: context,
      builder: (context) => AlertDialog(
        backgroundColor: AppColors.surface,
        shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(24)),
        title: const Text('Delete account?'),
        content: const Text(
          'This permanently removes your profile and ride data from this device. You can’t undo this.',
          style: TextStyle(height: 1.4),
        ),
        actions: [
          TextButton(
            onPressed: () => Navigator.of(context).pop(false),
            child: const Text('Cancel'),
          ),
          FilledButton(
            key: const Key('confirm-delete-account'),
            style: FilledButton.styleFrom(
              backgroundColor: AppColors.error,
              foregroundColor: AppColors.tomatoForeground,
            ),
            onPressed: () => Navigator.of(context).pop(true),
            child: const Text('Delete account'),
          ),
        ],
      ),
    );
    if (ok != true || !context.mounted) return;
    _clearSession(ref);
    ref.read(signupProvider.notifier).deleteAccount();
    ScaffoldMessenger.of(context).showSnackBar(
      const SnackBar(
        behavior: SnackBarBehavior.floating,
        backgroundColor: AppColors.darkGrey,
        content: Text(
          'Your account has been deleted.',
          style: TextStyle(fontWeight: FontWeight.w700),
        ),
      ),
    );
  }

  void _clearSession(WidgetRef ref) {
    ref.read(activeRideRequestProvider.notifier).clear();
  }

  void _comingSoon(BuildContext context, String label) {
    ScaffoldMessenger.of(context).showSnackBar(
      SnackBar(
        behavior: SnackBarBehavior.floating,
        backgroundColor: AppColors.darkGrey,
        content: Text(
          '$label coming soon.',
          style: const TextStyle(fontWeight: FontWeight.w700),
        ),
      ),
    );
  }

  Future<void> _openExternalUrl(BuildContext context, String url) async {
    final uri = Uri.parse(url);
    final ok = await launchUrl(uri, mode: LaunchMode.externalApplication);
    if (!ok && context.mounted) {
      ScaffoldMessenger.of(context).showSnackBar(
        SnackBar(
          behavior: SnackBarBehavior.floating,
          backgroundColor: AppColors.darkGrey,
          content: Text(
            'Could not open $url',
            style: const TextStyle(fontWeight: FontWeight.w700),
          ),
        ),
      );
    }
  }

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final draft = ref.watch(signupProvider);
    final themePreference = ref.watch(themePreferenceProvider);
    final theme = Theme.of(context);
    final isPassenger = role == RideRole.passenger;

    final name = isPassenger
        ? (draft.passengerName ?? 'Passenger')
        : (draft.riderName ?? 'Rider');
    final phone = draft.phoneE164 ?? '';
    final roleLabel = isPassenger ? 'Passenger' : 'Rider';
    final location =
        isPassenger ? draft.passengerLocation : draft.riderLocation;
    final dob =
        isPassenger ? draft.passengerDateOfBirth : draft.riderDateOfBirth;
    final gender = isPassenger ? draft.passengerGender : draft.riderGender;

    final first = (isPassenger
                ? draft.passengerFirstName
                : draft.riderFirstName)
            ?.trim() ??
        '';
    final last = (isPassenger
                ? draft.passengerLastName
                : draft.riderLastName)
            ?.trim() ??
        '';
    final initials = [
      if (first.isNotEmpty) first[0].toUpperCase(),
      if (last.isNotEmpty) last[0].toUpperCase(),
    ].join();

    return SizedBox.expand(
      child: Padding(
        padding: const EdgeInsets.fromLTRB(20, 12, 20, 0),
        child: Column(
          crossAxisAlignment: CrossAxisAlignment.stretch,
          children: [
            Text(
              'Account',
              style: theme.textTheme.headlineSmall?.copyWith(
                color: AppColors.textPrimary,
                fontWeight: FontWeight.w800,
                letterSpacing: -0.4,
                height: 1.15,
              ),
            ),
            const SizedBox(height: 6),
            Text(
              isPassenger
                  ? 'Your passenger profile and settings.'
                  : 'Your rider profile, vehicle, and settings.',
              style: theme.textTheme.bodyLarge?.copyWith(
                color: AppColors.textSecondary,
                fontWeight: FontWeight.w500,
                height: 1.35,
              ),
            ),
            const SizedBox(height: AppSpacing.lg),
            Expanded(
              child: ListView(
                children: [
                  _ProfileHeaderCard(
                    name: name,
                    phone: phone,
                    roleLabel: roleLabel,
                    initials: initials.isEmpty ? 'C' : initials,
                  ),
                  const SizedBox(height: AppSpacing.lg),
                  Text(
                    'Personal details',
                    style: theme.textTheme.titleSmall?.copyWith(
                      color: AppColors.textPrimary,
                      fontWeight: FontWeight.w800,
                    ),
                  ),
                  const SizedBox(height: AppSpacing.sm),
                  _AccountSectionCard(
                    children: [
                      _AccountDetailRow(
                        icon: Icons.place_rounded,
                        label: 'Location',
                        value: location ?? '—',
                      ),
                      _AccountDetailRow(
                        icon: Icons.cake_rounded,
                        label: 'Date of birth',
                        value: dob == null ? '—' : _formatDob(dob),
                      ),
                      _AccountDetailRow(
                        icon: Icons.person_rounded,
                        label: 'Gender',
                        value: _genderLabel(gender),
                        showDivider: false,
                      ),
                    ],
                  ),
                  if (!isPassenger) ...[
                    const SizedBox(height: AppSpacing.lg),
                    Text(
                      'Vehicle & documents',
                      style: theme.textTheme.titleSmall?.copyWith(
                        color: AppColors.textPrimary,
                        fontWeight: FontWeight.w800,
                      ),
                    ),
                    const SizedBox(height: AppSpacing.sm),
                    _AccountSectionCard(
                      children: [
                        _AccountDetailRow(
                          icon: Icons.two_wheeler_rounded,
                          label: 'Vehicle type',
                          value: _driverLabel(draft.driverKind),
                        ),
                        _AccountDetailRow(
                          icon: Icons.pin_rounded,
                          label: 'Vehicle number',
                          value: draft.riderVehicleNumber ?? '—',
                        ),
                        _AccountDetailRow(
                          icon: Icons.badge_rounded,
                          label: 'ID type',
                          value: _idTypeLabel(draft.riderIdType),
                        ),
                        _AccountDetailRow(
                          icon: Icons.verified_rounded,
                          label: 'Status',
                          value: draft.riderApproved
                              ? 'Approved'
                              : draft.applicationSubmitted
                                  ? 'Pending approval'
                                  : 'Incomplete',
                          showDivider: false,
                        ),
                      ],
                    ),
                  ],
                  const SizedBox(height: AppSpacing.lg),
                  Text(
                    'Appearance',
                    style: theme.textTheme.titleSmall?.copyWith(
                      color: AppColors.textPrimary,
                      fontWeight: FontWeight.w800,
                    ),
                  ),
                  const SizedBox(height: 4),
                  Text(
                    'Choose light, dark, or match your device.',
                    style: theme.textTheme.bodyMedium?.copyWith(
                      color: AppColors.textSecondary,
                      fontWeight: FontWeight.w500,
                    ),
                  ),
                  const SizedBox(height: AppSpacing.sm),
                  _ThemePreferencePicker(
                    value: themePreference,
                    onChanged: (preference) {
                      ref
                          .read(themePreferenceProvider.notifier)
                          .setPreference(preference);
                    },
                  ),
                  const SizedBox(height: AppSpacing.lg),
                  Text(
                    'Support',
                    style: theme.textTheme.titleSmall?.copyWith(
                      color: AppColors.textPrimary,
                      fontWeight: FontWeight.w800,
                    ),
                  ),
                  const SizedBox(height: AppSpacing.sm),
                  _AccountSectionCard(
                    children: [
                      _AccountActionRow(
                        icon: Icons.support_agent_rounded,
                        label: 'Help & support',
                        onTap: () => _comingSoon(context, 'Help & support'),
                      ),
                      _AccountActionRow(
                        icon: Icons.privacy_tip_outlined,
                        label: 'Privacy policy',
                        onTap: () => _openExternalUrl(
                          context,
                          AppConfig.privacyPolicyUrl,
                        ),
                      ),
                      _AccountActionRow(
                        icon: Icons.description_outlined,
                        label: 'Terms of use',
                        onTap: () => _openExternalUrl(
                          context,
                          AppConfig.termsOfServiceUrl,
                        ),
                        showDivider: false,
                      ),
                    ],
                  ),
                  const SizedBox(height: AppSpacing.xl),
                  CyrloButton(
                    key: const Key('sign-out'),
                    label: 'Sign out',
                    variant: CyrloButtonVariant.outlined,
                    onPressed: () => _confirmSignOut(context, ref),
                  ),
                  const SizedBox(height: AppSpacing.sm),
                  OutlinedButton(
                    key: const Key('delete-account'),
                    style: OutlinedButton.styleFrom(
                      foregroundColor: AppColors.error,
                      side: const BorderSide(color: AppColors.error),
                      minimumSize: const Size(
                        double.infinity,
                        AppSpacing.buttonHeight,
                      ),
                    ),
                    onPressed: () => _confirmDeleteAccount(context, ref),
                    child: Text(
                      'Delete account',
                      style: theme.textTheme.labelLarge?.copyWith(
                        fontWeight: FontWeight.w800,
                        color: AppColors.error,
                      ),
                    ),
                  ),
                  const SizedBox(height: AppSpacing.lg),
                ],
              ),
            ),
          ],
        ),
      ),
    );
  }
}

class _ThemePreferencePicker extends StatelessWidget {
  const _ThemePreferencePicker({
    required this.value,
    required this.onChanged,
  });

  final AppThemePreference value;
  final ValueChanged<AppThemePreference> onChanged;

  @override
  Widget build(BuildContext context) {
    return DecoratedBox(
      decoration: BoxDecoration(
        color: AppColors.surface,
        borderRadius: BorderRadius.circular(AppRadii.lg),
        border: Border.all(color: AppColors.border),
      ),
      child: Padding(
        padding: const EdgeInsets.all(6),
        child: Row(
          children: [
            for (final preference in AppThemePreference.values) ...[
              Expanded(
                child: _ThemePreferenceOption(
                  preference: preference,
                  selected: preference == value,
                  onTap: () => onChanged(preference),
                ),
              ),
            ],
          ],
        ),
      ),
    );
  }
}

class _ThemePreferenceOption extends StatelessWidget {
  const _ThemePreferenceOption({
    required this.preference,
    required this.selected,
    required this.onTap,
  });

  final AppThemePreference preference;
  final bool selected;
  final VoidCallback onTap;

  @override
  Widget build(BuildContext context) {
    final theme = Theme.of(context);
    return Material(
      color: selected ? AppColors.yellow : Colors.transparent,
      borderRadius: BorderRadius.circular(AppRadii.md),
      child: InkWell(
        key: Key('theme-${preference.name}'),
        onTap: onTap,
        borderRadius: BorderRadius.circular(AppRadii.md),
        child: Padding(
          padding: const EdgeInsets.symmetric(vertical: 12),
          child: Column(
            children: [
              Icon(
                preference.icon,
                size: 20,
                color: selected ? AppColors.darkGrey : AppColors.textPrimary,
              ),
              const SizedBox(height: 6),
              Text(
                preference.label,
                style: theme.textTheme.labelMedium?.copyWith(
                  color: selected ? AppColors.darkGrey : AppColors.textPrimary,
                  fontWeight: FontWeight.w800,
                ),
              ),
            ],
          ),
        ),
      ),
    );
  }
}

class _ProfileHeaderCard extends StatelessWidget {
  const _ProfileHeaderCard({
    required this.name,
    required this.phone,
    required this.roleLabel,
    required this.initials,
  });

  final String name;
  final String phone;
  final String roleLabel;
  final String initials;

  @override
  Widget build(BuildContext context) {
    final theme = Theme.of(context);
    return DecoratedBox(
      decoration: BoxDecoration(
        color: AppColors.surface,
        borderRadius: BorderRadius.circular(AppRadii.lg),
        border: Border.all(color: AppColors.border),
        boxShadow: [
          BoxShadow(
            color: AppColors.elevationShadow(lightAlpha: 0.05),
            blurRadius: 16,
            offset: const Offset(0, 8),
          ),
        ],
      ),
      child: Padding(
        padding: const EdgeInsets.all(AppSpacing.md),
        child: Row(
          children: [
            Container(
              width: 58,
              height: 58,
              alignment: Alignment.center,
              decoration: BoxDecoration(
                color: AppColors.yellow,
                borderRadius: BorderRadius.circular(18),
              ),
              child: Text(
                initials,
                style: theme.textTheme.titleLarge?.copyWith(
                  color: AppColors.darkGrey,
                  fontWeight: FontWeight.w800,
                ),
              ),
            ),
            const SizedBox(width: AppSpacing.md),
            Expanded(
              child: Column(
                crossAxisAlignment: CrossAxisAlignment.start,
                children: [
                  Text(
                    name,
                    style: theme.textTheme.titleMedium?.copyWith(
                      color: AppColors.textPrimary,
                      fontWeight: FontWeight.w800,
                    ),
                  ),
                  const SizedBox(height: 4),
                  Text(
                    phone.isEmpty ? 'No phone on file' : phone,
                    style: theme.textTheme.bodyMedium?.copyWith(
                      color: AppColors.textSecondary,
                      fontWeight: FontWeight.w600,
                    ),
                  ),
                  const SizedBox(height: 8),
                  Container(
                    padding: const EdgeInsets.symmetric(
                      horizontal: 10,
                      vertical: 5,
                    ),
                    decoration: BoxDecoration(
                      color: AppColors.brandLight,
                      borderRadius: BorderRadius.circular(AppRadii.pill),
                    ),
                    child: Text(
                      roleLabel,
                      style: theme.textTheme.labelMedium?.copyWith(
                        color: AppColors.onBrandLight,
                        fontWeight: FontWeight.w800,
                      ),
                    ),
                  ),
                ],
              ),
            ),
          ],
        ),
      ),
    );
  }
}

class _AccountSectionCard extends StatelessWidget {
  const _AccountSectionCard({required this.children});

  final List<Widget> children;

  @override
  Widget build(BuildContext context) {
    return DecoratedBox(
      decoration: BoxDecoration(
        color: AppColors.surface,
        borderRadius: BorderRadius.circular(AppRadii.lg),
        border: Border.all(color: AppColors.border),
      ),
      child: Padding(
        padding: const EdgeInsets.symmetric(horizontal: 14, vertical: 6),
        child: Column(children: children),
      ),
    );
  }
}

class _AccountDetailRow extends StatelessWidget {
  const _AccountDetailRow({
    required this.icon,
    required this.label,
    required this.value,
    this.showDivider = true,
  });

  final IconData icon;
  final String label;
  final String value;
  final bool showDivider;

  @override
  Widget build(BuildContext context) {
    final theme = Theme.of(context);
    return Column(
      children: [
        Padding(
          padding: const EdgeInsets.symmetric(vertical: 12),
          child: Row(
            children: [
              Container(
                width: 36,
                height: 36,
                decoration: BoxDecoration(
                  color: AppColors.field,
                  borderRadius: BorderRadius.circular(12),
                ),
                child: Icon(icon, size: 18, color: AppColors.textPrimary),
              ),
              const SizedBox(width: 12),
              Expanded(
                child: Column(
                  crossAxisAlignment: CrossAxisAlignment.start,
                  children: [
                    Text(
                      label,
                      style: theme.textTheme.labelMedium?.copyWith(
                        color: AppColors.textSecondary,
                        fontWeight: FontWeight.w700,
                      ),
                    ),
                    const SizedBox(height: 2),
                    Text(
                      value,
                      style: theme.textTheme.bodyLarge?.copyWith(
                        color: AppColors.textPrimary,
                        fontWeight: FontWeight.w700,
                      ),
                    ),
                  ],
                ),
              ),
            ],
          ),
        ),
        if (showDivider) const Divider(height: 1),
      ],
    );
  }
}

class _AccountActionRow extends StatelessWidget {
  const _AccountActionRow({
    required this.icon,
    required this.label,
    required this.onTap,
    this.showDivider = true,
  });

  final IconData icon;
  final String label;
  final VoidCallback onTap;
  final bool showDivider;

  @override
  Widget build(BuildContext context) {
    final theme = Theme.of(context);
    return Column(
      children: [
        InkWell(
          onTap: onTap,
          borderRadius: BorderRadius.circular(12),
          child: Padding(
            padding: const EdgeInsets.symmetric(vertical: 12),
            child: Row(
              children: [
                Container(
                  width: 36,
                  height: 36,
                  decoration: BoxDecoration(
                    color: AppColors.field,
                    borderRadius: BorderRadius.circular(12),
                  ),
                  child: Icon(icon, size: 18, color: AppColors.textPrimary),
                ),
                const SizedBox(width: 12),
                Expanded(
                  child: Text(
                    label,
                    style: theme.textTheme.bodyLarge?.copyWith(
                      color: AppColors.textPrimary,
                      fontWeight: FontWeight.w700,
                    ),
                  ),
                ),
                Icon(
                  Icons.chevron_right_rounded,
                  color: AppColors.textSecondary,
                ),
              ],
            ),
          ),
        ),
        if (showDivider) const Divider(height: 1),
      ],
    );
  }
}
