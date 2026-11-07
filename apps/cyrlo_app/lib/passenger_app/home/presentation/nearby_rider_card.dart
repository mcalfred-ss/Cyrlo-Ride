import 'package:flutter/material.dart';

import '../../../core/constants/app_colors.dart';
import '../../../core/theme/app_radii.dart';
import '../../../core/theme/app_spacing.dart';
import '../../../shared/widgets/profile_avatar.dart';
import '../domain/nearby_rider.dart';

class NearbyRiderCard extends StatelessWidget {
  const NearbyRiderCard({
    super.key,
    required this.rider,
    required this.onRequest,
    required this.onOpenMap,
    required this.onOpenProfile,
  });

  final NearbyRider rider;
  final VoidCallback onRequest;
  final VoidCallback onOpenMap;
  final VoidCallback onOpenProfile;

  @override
  Widget build(BuildContext context) {
    final theme = Theme.of(context);
    final muted = !rider.canRequest;
    final avatar = ProfileAvatars.assetFor(
      gender: rider.gender,
      seed: rider.id,
    );

    return Opacity(
      opacity: muted ? 0.72 : 1,
      child: Material(
        color: AppColors.surface,
        borderRadius: BorderRadius.circular(AppRadii.lg),
        child: InkWell(
          key: Key('request-rider-${rider.id}'),
          onTap: rider.canRequest ? onRequest : null,
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
                  Material(
                    color: Colors.transparent,
                    child: InkWell(
                      key: Key('rider-avatar-${rider.id}'),
                      onTap: onOpenProfile,
                      borderRadius: BorderRadius.circular(AppRadii.md),
                      child: ClipRRect(
                        borderRadius: BorderRadius.circular(AppRadii.md),
                        child: Image.asset(
                          avatar,
                          width: 84,
                          height: 84,
                          fit: BoxFit.cover,
                          filterQuality: FilterQuality.high,
                          semanticLabel: '${rider.displayName} avatar',
                        ),
                      ),
                    ),
                  ),
                  const SizedBox(width: AppSpacing.sm),
                  Expanded(
                    child: Column(
                      crossAxisAlignment: CrossAxisAlignment.start,
                      children: [
                        Text(
                          rider.displayName,
                          style: theme.textTheme.titleMedium?.copyWith(
                            color: AppColors.textPrimary,
                            fontWeight: FontWeight.w800,
                          ),
                        ),
                        const SizedBox(height: 2),
                        Text(
                          rider.kindRiderLabel,
                          style: theme.textTheme.bodyMedium?.copyWith(
                            color: AppColors.textSecondary,
                            fontWeight: FontWeight.w600,
                          ),
                        ),
                        const SizedBox(height: 6),
                        Row(
                          children: [
                            const Icon(
                              Icons.star_rounded,
                              size: 16,
                              color: AppColors.brandDark,
                            ),
                            const SizedBox(width: 4),
                            Text(
                              rider.ratingLabel,
                              style: theme.textTheme.labelLarge?.copyWith(
                                color: AppColors.textPrimary,
                                fontWeight: FontWeight.w800,
                              ),
                            ),
                            const SizedBox(width: 4),
                            Flexible(
                              child: Text(
                                '(${rider.reviewCount})',
                                overflow: TextOverflow.ellipsis,
                                style: theme.textTheme.labelMedium?.copyWith(
                                  color: AppColors.textSecondary,
                                  fontWeight: FontWeight.w700,
                                ),
                              ),
                            ),
                          ],
                        ),
                        const SizedBox(height: 4),
                        Text(
                          rider.etaLabel,
                          style: theme.textTheme.labelMedium?.copyWith(
                            color: AppColors.textSecondary,
                            fontWeight: FontWeight.w600,
                          ),
                        ),
                        const SizedBox(height: 4),
                        Text(
                          rider.statusLabel,
                          style: theme.textTheme.labelLarge?.copyWith(
                            color: rider.busy
                                ? AppColors.tomato
                                : rider.canRequest
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
                      onTap: rider.canRequest ? onOpenMap : null,
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
