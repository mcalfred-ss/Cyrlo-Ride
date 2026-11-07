import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';

import '../../../core/constants/app_colors.dart';
import '../../../core/theme/app_radii.dart';
import '../../../core/theme/app_spacing.dart';
import '../application/passenger_rides_provider.dart';
import '../domain/passenger_ride.dart';
import 'ride_history_card.dart';

class PassengerRidesScreen extends ConsumerWidget {
  const PassengerRidesScreen({super.key});

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final rides = ref.watch(passengerRidesProvider);
    final ongoing = rides
        .where((ride) => ride.status == PassengerRideStatus.ongoing)
        .toList();
    final history = rides
        .where((ride) => ride.status != PassengerRideStatus.ongoing)
        .toList();
    final completed =
        history.where((ride) => ride.status == PassengerRideStatus.completed).length;
    final theme = Theme.of(context);

    return SizedBox.expand(
      child: Padding(
        padding: const EdgeInsets.fromLTRB(20, 12, 20, 0),
        child: Column(
          crossAxisAlignment: CrossAxisAlignment.stretch,
          children: [
            Text(
              'Your rides',
              style: theme.textTheme.headlineSmall?.copyWith(
                color: AppColors.textPrimary,
                fontWeight: FontWeight.w800,
                letterSpacing: -0.4,
                height: 1.15,
              ),
            ),
            const SizedBox(height: 6),
            Text(
              'Live trips and your ride history.',
              style: theme.textTheme.bodyLarge?.copyWith(
                color: AppColors.textSecondary,
                fontWeight: FontWeight.w500,
                height: 1.35,
              ),
            ),
            const SizedBox(height: AppSpacing.lg),
            Expanded(
              child: rides.isEmpty
                  ? const _EmptyRides()
                  : ListView(
                      key: const Key('rides-history-list'),
                      children: [
                        if (ongoing.isNotEmpty) ...[
                          Text(
                            'Ongoing',
                            style: theme.textTheme.titleSmall?.copyWith(
                              color: AppColors.textPrimary,
                              fontWeight: FontWeight.w800,
                            ),
                          ),
                          const SizedBox(height: AppSpacing.sm),
                          for (var i = 0; i < ongoing.length; i++) ...[
                            RideHistoryCard(
                              key: Key('ride-${ongoing[i].id}'),
                              ride: ongoing[i],
                            ),
                            if (i != ongoing.length - 1)
                              const SizedBox(height: AppSpacing.sm),
                          ],
                          const SizedBox(height: AppSpacing.lg),
                        ],
                        Row(
                          children: [
                            Text(
                              'Ride history',
                              style: theme.textTheme.titleSmall?.copyWith(
                                color: AppColors.textPrimary,
                                fontWeight: FontWeight.w800,
                              ),
                            ),
                            const Spacer(),
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
                                '$completed completed',
                                style: theme.textTheme.labelMedium?.copyWith(
                                  color: AppColors.darkGrey,
                                  fontWeight: FontWeight.w800,
                                ),
                              ),
                            ),
                          ],
                        ),
                        const SizedBox(height: AppSpacing.sm),
                        if (history.isEmpty)
                          const Padding(
                            padding: EdgeInsets.symmetric(vertical: 24),
                            child: _EmptyRides(),
                          )
                        else
                          for (var i = 0; i < history.length; i++) ...[
                            RideHistoryCard(
                              key: Key('ride-${history[i].id}'),
                              ride: history[i],
                            ),
                            if (i != history.length - 1)
                              const SizedBox(height: AppSpacing.sm),
                          ],
                        const SizedBox(height: AppSpacing.md),
                      ],
                    ),
            ),
          ],
        ),
      ),
    );
  }
}

class _EmptyRides extends StatelessWidget {
  const _EmptyRides();

  @override
  Widget build(BuildContext context) {
    final theme = Theme.of(context);
    return Center(
      child: Padding(
        padding: const EdgeInsets.all(AppSpacing.lg),
        child: Column(
          mainAxisSize: MainAxisSize.min,
          children: [
            Container(
              width: 64,
              height: 64,
              decoration: BoxDecoration(
                color: AppColors.brandLight,
                borderRadius: BorderRadius.circular(20),
              ),
              child: const Icon(
                Icons.history_rounded,
                color: AppColors.darkGrey,
                size: 30,
              ),
            ),
            const SizedBox(height: AppSpacing.md),
            Text(
              'No rides yet',
              style: theme.textTheme.titleMedium?.copyWith(
                fontWeight: FontWeight.w800,
                color: AppColors.textPrimary,
              ),
            ),
            const SizedBox(height: 6),
            Text(
              'When you take a Pragya or Okada, your trips will show up here.',
              textAlign: TextAlign.center,
              style: theme.textTheme.bodyMedium?.copyWith(
                color: AppColors.textSecondary,
                height: 1.4,
              ),
            ),
          ],
        ),
      ),
    );
  }
}
