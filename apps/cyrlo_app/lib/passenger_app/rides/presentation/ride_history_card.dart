import 'package:flutter/material.dart';

import '../../../core/constants/app_colors.dart';
import '../../../core/theme/app_radii.dart';
import '../../../core/theme/app_spacing.dart';
import '../../../features/auth/application/signup_draft.dart';
import '../../../shared/widgets/illustration_view.dart';
import '../domain/passenger_ride.dart';

class RideHistoryCard extends StatelessWidget {
  const RideHistoryCard({super.key, required this.ride});

  final PassengerRide ride;

  String get _asset => switch (ride.kind) {
        DriverKind.okada => AppIllustrations.vehicleOkada,
        DriverKind.pragya => AppIllustrations.vehiclePragya,
        DriverKind.aboboyaa => AppIllustrations.vehicleAboboyaa,
      };

  Color get _statusColor => switch (ride.status) {
        PassengerRideStatus.completed => const Color(0xFF1F8A4C),
        PassengerRideStatus.cancelled => AppColors.tomato,
        PassengerRideStatus.ongoing => AppColors.onBrandLight,
      };

  Color get _statusBg => switch (ride.status) {
        PassengerRideStatus.completed => const Color(0xFFE7F6EE),
        PassengerRideStatus.cancelled => const Color(0xFFFDECEC),
        PassengerRideStatus.ongoing => AppColors.brandLight,
      };

  String get _whenLabel {
    final local = ride.occurredAt.toLocal();
    final now = DateTime.now();
    final sameDay =
        local.year == now.year && local.month == now.month && local.day == now.day;
    final yesterday = now.subtract(const Duration(days: 1));
    final isYesterday = local.year == yesterday.year &&
        local.month == yesterday.month &&
        local.day == yesterday.day;
    final time =
        '${local.hour.toString().padLeft(2, '0')}:${local.minute.toString().padLeft(2, '0')}';
    if (sameDay) return 'Today · $time';
    if (isYesterday) return 'Yesterday · $time';
    return '${local.day}/${local.month}/${local.year} · $time';
  }

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
        padding: const EdgeInsets.all(AppSpacing.sm),
        child: Row(
          crossAxisAlignment: CrossAxisAlignment.start,
          children: [
            ClipRRect(
              borderRadius: BorderRadius.circular(AppRadii.md),
              child: ColoredBox(
                color: Theme.of(context).brightness == Brightness.dark
                    ? Colors.transparent
                    : AppColors.illustrationNest,
                child: ThemedIllustrationImage(
                  asset: _asset,
                  width: 78,
                  height: 78,
                  fit: BoxFit.cover,
                  semanticLabel: '${ride.kindLabel} ride',
                ),
              ),
            ),
            const SizedBox(width: AppSpacing.sm),
            Expanded(
              child: Column(
                crossAxisAlignment: CrossAxisAlignment.start,
                children: [
                  Row(
                    children: [
                      Expanded(
                        child: Text(
                          ride.kindLabel,
                          style: theme.textTheme.titleMedium?.copyWith(
                            color: AppColors.textPrimary,
                            fontWeight: FontWeight.w800,
                          ),
                        ),
                      ),
                      Container(
                        padding: const EdgeInsets.symmetric(
                          horizontal: 8,
                          vertical: 4,
                        ),
                        decoration: BoxDecoration(
                          color: _statusBg,
                          borderRadius: BorderRadius.circular(AppRadii.pill),
                        ),
                        child: Text(
                          ride.statusLabel,
                          style: theme.textTheme.labelSmall?.copyWith(
                            color: _statusColor,
                            fontWeight: FontWeight.w800,
                          ),
                        ),
                      ),
                    ],
                  ),
                  const SizedBox(height: 6),
                  Text(
                    'Pickup',
                    style: theme.textTheme.labelMedium?.copyWith(
                      color: AppColors.textSecondary,
                      fontWeight: FontWeight.w700,
                    ),
                  ),
                  const SizedBox(height: 2),
                  Text(
                    ride.pickupLabel,
                    maxLines: 1,
                    overflow: TextOverflow.ellipsis,
                    style: theme.textTheme.bodyMedium?.copyWith(
                      color: AppColors.textPrimary,
                      fontWeight: FontWeight.w600,
                    ),
                  ),
                  const SizedBox(height: 8),
                  Text(
                    ride.durationLabel == null
                        ? _whenLabel
                        : '${ride.durationLabel} · $_whenLabel',
                    maxLines: 1,
                    overflow: TextOverflow.ellipsis,
                    style: theme.textTheme.labelMedium?.copyWith(
                      color: AppColors.textSecondary,
                      fontWeight: FontWeight.w600,
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
