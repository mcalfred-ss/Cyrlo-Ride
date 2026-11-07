import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:go_router/go_router.dart';

import '../../../core/constants/app_colors.dart';
import '../../../core/theme/app_radii.dart';
import '../../../core/theme/app_spacing.dart';
import '../../../shared/widgets/cyrlo_button.dart';
import '../../../shared/widgets/profile_avatar.dart';
import '../application/nearby_riders_provider.dart';
import '../domain/nearby_rider.dart';
import 'request_ride_flow.dart';

class PassengerRiderDetailScreen extends ConsumerWidget {
  const PassengerRiderDetailScreen({super.key, required this.riderId});

  final String riderId;

  String _formatReviewDate(DateTime date) {
    final day = date.day.toString().padLeft(2, '0');
    final month = date.month.toString().padLeft(2, '0');
    return '$day/$month/${date.year}';
  }

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final rider = ref.watch(nearbyRiderByIdProvider(riderId));
    final theme = Theme.of(context);

    if (rider == null) {
      return Scaffold(
        backgroundColor: AppColors.background,
        body: SafeArea(
          child: Padding(
            padding: const EdgeInsets.fromLTRB(20, 12, 20, 20),
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.stretch,
              children: [
                Align(
                  alignment: Alignment.centerLeft,
                  child: IconButton(
                    key: const Key('rider-detail-back'),
                    onPressed: () => context.pop(),
                    style: IconButton.styleFrom(
                      foregroundColor: AppColors.darkGrey,
                      backgroundColor: AppColors.field,
                    ),
                    icon: const Icon(Icons.arrow_back_rounded),
                  ),
                ),
                const Spacer(),
                Text(
                  'Rider not found',
                  textAlign: TextAlign.center,
                  style: theme.textTheme.titleMedium?.copyWith(
                    fontWeight: FontWeight.w800,
                  ),
                ),
                const Spacer(),
              ],
            ),
          ),
        ),
      );
    }

    final avatar = ProfileAvatars.assetFor(
      gender: rider.gender,
      seed: rider.id,
    );

    return Scaffold(
      backgroundColor: AppColors.background,
      body: SafeArea(
        child: Column(
          crossAxisAlignment: CrossAxisAlignment.stretch,
          children: [
            Padding(
              padding: const EdgeInsets.fromLTRB(12, 8, 20, 0),
              child: Align(
                alignment: Alignment.centerLeft,
                child: IconButton(
                  key: const Key('rider-detail-back'),
                  onPressed: () => context.pop(),
                  tooltip: 'Back',
                  style: IconButton.styleFrom(
                    foregroundColor: AppColors.darkGrey,
                    backgroundColor: AppColors.field,
                  ),
                  icon: const Icon(Icons.arrow_back_rounded),
                ),
              ),
            ),
            Expanded(
              child: ListView(
                padding: const EdgeInsets.fromLTRB(20, 8, 20, 24),
                children: [
                  Center(
                    child: ClipRRect(
                      borderRadius: BorderRadius.circular(28),
                      child: Image.asset(
                        avatar,
                        width: 120,
                        height: 120,
                        fit: BoxFit.cover,
                        filterQuality: FilterQuality.high,
                        semanticLabel: '${rider.displayName} avatar',
                      ),
                    ),
                  ),
                  const SizedBox(height: AppSpacing.md),
                  Text(
                    rider.displayName,
                    textAlign: TextAlign.center,
                    style: theme.textTheme.headlineSmall?.copyWith(
                      color: AppColors.textPrimary,
                      fontWeight: FontWeight.w800,
                      letterSpacing: -0.4,
                    ),
                  ),
                  const SizedBox(height: 4),
                  Text(
                    rider.kindRiderLabel,
                    textAlign: TextAlign.center,
                    style: theme.textTheme.titleMedium?.copyWith(
                      color: AppColors.textSecondary,
                      fontWeight: FontWeight.w700,
                    ),
                  ),
                  const SizedBox(height: AppSpacing.md),
                  DecoratedBox(
                    decoration: BoxDecoration(
                      color: AppColors.surface,
                      borderRadius: BorderRadius.circular(AppRadii.lg),
                      border: Border.all(color: AppColors.border),
                    ),
                    child: Padding(
                      padding: const EdgeInsets.symmetric(
                        horizontal: AppSpacing.md,
                        vertical: AppSpacing.sm + 4,
                      ),
                      child: Row(
                        children: [
                          Expanded(
                            child: _StatChip(
                              icon: Icons.star_rounded,
                              label: 'Rating',
                              value: rider.ratingLabel,
                            ),
                          ),
                          Container(
                            width: 1,
                            height: 36,
                            color: AppColors.border,
                          ),
                          Expanded(
                            child: _StatChip(
                              icon: Icons.reviews_outlined,
                              label: 'Reviews',
                              value: '${rider.reviewCount}',
                            ),
                          ),
                          Container(
                            width: 1,
                            height: 36,
                            color: AppColors.border,
                          ),
                          Expanded(
                            child: _StatChip(
                              icon: Icons.schedule_rounded,
                              label: 'ETA',
                              value: '${rider.etaMinutes}m',
                            ),
                          ),
                        ],
                      ),
                    ),
                  ),
                  const SizedBox(height: AppSpacing.lg),
                  Text(
                    'Ratings & reviews',
                    style: theme.textTheme.titleSmall?.copyWith(
                      color: AppColors.textPrimary,
                      fontWeight: FontWeight.w800,
                    ),
                  ),
                  const SizedBox(height: 4),
                  Text(
                    rider.reviewCountLabel,
                    style: theme.textTheme.bodyMedium?.copyWith(
                      color: AppColors.textSecondary,
                      fontWeight: FontWeight.w600,
                    ),
                  ),
                  const SizedBox(height: AppSpacing.sm),
                  if (rider.reviews.isEmpty)
                    DecoratedBox(
                      decoration: BoxDecoration(
                        color: AppColors.surface,
                        borderRadius: BorderRadius.circular(AppRadii.lg),
                        border: Border.all(color: AppColors.border),
                      ),
                      child: Padding(
                        padding: const EdgeInsets.all(AppSpacing.md),
                        child: Text(
                          'No reviews yet for this rider.',
                          style: theme.textTheme.bodyLarge?.copyWith(
                            color: AppColors.textSecondary,
                            fontWeight: FontWeight.w600,
                          ),
                        ),
                      ),
                    )
                  else
                    for (var i = 0; i < rider.reviews.length; i++) ...[
                      _ReviewCard(
                        review: rider.reviews[i],
                        dateLabel: _formatReviewDate(rider.reviews[i].occurredAt),
                      ),
                      if (i != rider.reviews.length - 1)
                        const SizedBox(height: AppSpacing.sm),
                    ],
                ],
              ),
            ),
            if (rider.canRequest)
              Padding(
                padding: const EdgeInsets.fromLTRB(20, 0, 20, 16),
                child: CyrloButton(
                  key: Key('detail-request-${rider.id}'),
                  label: 'Request ${rider.kindLabel}',
                  onPressed: () {
                    startRequestRideFlow(
                      context: context,
                      ref: ref,
                      rider: rider,
                    );
                  },
                ),
              ),
          ],
        ),
      ),
    );
  }
}

class _StatChip extends StatelessWidget {
  const _StatChip({
    required this.icon,
    required this.label,
    required this.value,
  });

  final IconData icon;
  final String label;
  final String value;

  @override
  Widget build(BuildContext context) {
    final theme = Theme.of(context);
    return Column(
      children: [
        Icon(icon, size: 18, color: AppColors.brandDark),
        const SizedBox(height: 4),
        Text(
          value,
          style: theme.textTheme.titleSmall?.copyWith(
            color: AppColors.textPrimary,
            fontWeight: FontWeight.w800,
          ),
        ),
        Text(
          label,
          style: theme.textTheme.labelSmall?.copyWith(
            color: AppColors.textSecondary,
            fontWeight: FontWeight.w700,
          ),
        ),
      ],
    );
  }
}

class _ReviewCard extends StatelessWidget {
  const _ReviewCard({
    required this.review,
    required this.dateLabel,
  });

  final RiderReview review;
  final String dateLabel;

  @override
  Widget build(BuildContext context) {
    final theme = Theme.of(context);
    return DecoratedBox(
      decoration: BoxDecoration(
        color: AppColors.surface,
        borderRadius: BorderRadius.circular(AppRadii.lg),
        border: Border.all(color: AppColors.border),
      ),
      child: Padding(
        padding: const EdgeInsets.all(AppSpacing.md),
        child: Column(
          crossAxisAlignment: CrossAxisAlignment.start,
          children: [
            Row(
              children: [
                Expanded(
                  child: Text(
                    review.passengerName,
                    style: theme.textTheme.titleSmall?.copyWith(
                      color: AppColors.textPrimary,
                      fontWeight: FontWeight.w800,
                    ),
                  ),
                ),
                const Icon(
                  Icons.star_rounded,
                  size: 16,
                  color: AppColors.brandDark,
                ),
                const SizedBox(width: 4),
                Text(
                  review.rating.toStringAsFixed(0),
                  style: theme.textTheme.labelLarge?.copyWith(
                    color: AppColors.textPrimary,
                    fontWeight: FontWeight.w800,
                  ),
                ),
              ],
            ),
            const SizedBox(height: 4),
            Text(
              dateLabel,
              style: theme.textTheme.labelMedium?.copyWith(
                color: AppColors.textSecondary,
                fontWeight: FontWeight.w600,
              ),
            ),
            const SizedBox(height: 8),
            Text(
              review.comment,
              style: theme.textTheme.bodyLarge?.copyWith(
                color: AppColors.textPrimary,
                fontWeight: FontWeight.w500,
                height: 1.4,
              ),
            ),
          ],
        ),
      ),
    );
  }
}
