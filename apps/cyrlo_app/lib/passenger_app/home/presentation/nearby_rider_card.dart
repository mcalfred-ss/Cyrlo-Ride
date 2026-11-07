import 'package:flutter/material.dart';

import '../../../core/constants/app_colors.dart';
import '../../../core/theme/app_radii.dart';
import '../../../core/theme/app_spacing.dart';
import '../../../features/auth/application/signup_draft.dart';
import '../../../shared/widgets/illustration_view.dart';
import '../domain/nearby_rider.dart';

class NearbyRiderCard extends StatelessWidget {
  const NearbyRiderCard({
    super.key,
    required this.rider,
    required this.onRequest,
    required this.onOpenMap,
  });

  final NearbyRider rider;
  final VoidCallback onRequest;
  final VoidCallback onOpenMap;

  String get _asset => switch (rider.kind) {
        DriverKind.okada => AppIllustrations.vehicleOkada,
        DriverKind.pragya => AppIllustrations.vehiclePragya,
        DriverKind.aboboyaa => AppIllustrations.vehicleAboboyaa,
      };

  @override
  Widget build(BuildContext context) {
    final theme = Theme.of(context);
    final muted = !rider.available;

    return Opacity(
      opacity: muted ? 0.72 : 1,
      child: Material(
        color: AppColors.surface,
        borderRadius: BorderRadius.circular(AppRadii.lg),
        child: InkWell(
          key: Key('request-rider-${rider.id}'),
          onTap: rider.available ? onRequest : null,
          borderRadius: BorderRadius.circular(AppRadii.lg),
          child: Ink(
            decoration: BoxDecoration(
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
                crossAxisAlignment: CrossAxisAlignment.center,
                children: [
                  ClipRRect(
                    borderRadius: BorderRadius.circular(AppRadii.md),
                    child: ColoredBox(
                      color: AppColors.field,
                      child: Image.asset(
                        _asset,
                        width: 84,
                        height: 84,
                        fit: BoxFit.cover,
                        filterQuality: FilterQuality.high,
                        semanticLabel: '${rider.kindLabel} illustration',
                      ),
                    ),
                  ),
                  const SizedBox(width: AppSpacing.sm),
                  Expanded(
                    child: Column(
                      crossAxisAlignment: CrossAxisAlignment.start,
                      children: [
                        Text(
                          rider.kindLabel,
                          style: theme.textTheme.titleMedium?.copyWith(
                            color: AppColors.textPrimary,
                            fontWeight: FontWeight.w800,
                          ),
                        ),
                        const SizedBox(height: 4),
                        Text(
                          rider.etaLabel,
                          style: theme.textTheme.bodyMedium?.copyWith(
                            color: AppColors.textSecondary,
                            fontWeight: FontWeight.w600,
                          ),
                        ),
                        const SizedBox(height: 6),
                        Text(
                          rider.available ? 'Available nearby' : 'Coming soon',
                          style: theme.textTheme.labelLarge?.copyWith(
                            color: rider.available
                                ? AppColors.brandDark
                                : AppColors.textSecondary,
                            fontWeight: FontWeight.w800,
                          ),
                        ),
                      ],
                    ),
                  ),
                  const SizedBox(width: AppSpacing.xs),
                  Material(
                    color: AppColors.darkGrey,
                    shape: const CircleBorder(),
                    child: InkWell(
                      key: Key('open-map-${rider.id}'),
                      customBorder: const CircleBorder(),
                      onTap: rider.available ? onOpenMap : null,
                      child: const SizedBox(
                        width: 44,
                        height: 44,
                        child: Icon(
                          Icons.map_rounded,
                          color: AppColors.yellow,
                          size: 22,
                        ),
                      ),
                    ),
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
