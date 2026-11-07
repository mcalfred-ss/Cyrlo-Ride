import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';

import '../../../core/constants/app_colors.dart';
import '../../../core/theme/app_radii.dart';
import '../../../core/theme/app_spacing.dart';
import '../../../shared/ride_session/active_ride_request_controller.dart';
import '../../../shared/widgets/active_contact_card.dart';

class RiderJobsScreen extends ConsumerStatefulWidget {
  const RiderJobsScreen({super.key});

  @override
  ConsumerState<RiderJobsScreen> createState() => _RiderJobsScreenState();
}

class _RiderJobsScreenState extends ConsumerState<RiderJobsScreen> {
  @override
  void initState() {
    super.initState();
    WidgetsBinding.instance.addPostFrameCallback((_) {
      ref.read(activeRideRequestProvider.notifier).seedDemoRiderJobIfNeeded();
    });
  }

  @override
  Widget build(BuildContext context) {
    final active = ref.watch(activeRideRequestProvider);
    final theme = Theme.of(context);
    final live = active?.sharesContact == true;

    return SizedBox.expand(
      child: Padding(
        padding: const EdgeInsets.fromLTRB(20, 12, 20, 0),
        child: Column(
          crossAxisAlignment: CrossAxisAlignment.stretch,
          children: [
            Text(
              'Jobs',
              style: theme.textTheme.headlineSmall?.copyWith(
                color: AppColors.textPrimary,
                fontWeight: FontWeight.w800,
                letterSpacing: -0.4,
                height: 1.15,
              ),
            ),
            const SizedBox(height: 6),
            Text(
              'Pickup requests near you. Call the passenger to confirm where to meet.',
              style: theme.textTheme.bodyLarge?.copyWith(
                color: AppColors.textSecondary,
                fontWeight: FontWeight.w500,
                height: 1.35,
              ),
            ),
            const SizedBox(height: AppSpacing.lg),
            Row(
              children: [
                Text(
                  live ? 'Active pickup' : 'No active pickup',
                  style: theme.textTheme.titleSmall?.copyWith(
                    color: AppColors.textPrimary,
                    fontWeight: FontWeight.w800,
                  ),
                ),
                const Spacer(),
                Container(
                  padding: const EdgeInsets.symmetric(horizontal: 10, vertical: 5),
                  decoration: BoxDecoration(
                    color: live ? AppColors.brandLight : AppColors.field,
                    borderRadius: BorderRadius.circular(AppRadii.pill),
                  ),
                  child: Text(
                    live ? 'Live' : 'Idle',
                    style: theme.textTheme.labelMedium?.copyWith(
                      color: AppColors.darkGrey,
                      fontWeight: FontWeight.w800,
                    ),
                  ),
                ),
              ],
            ),
            const SizedBox(height: AppSpacing.sm),
            Expanded(
              child: live
                  ? ListView(
                      children: [
                        ActiveContactCard(
                          title: active!.passengerName == null
                              ? 'Passenger waiting'
                              : '${active.passengerName} is waiting',
                          subtitle: active.etaMinutes == null
                              ? 'Passenger number is shared for this pickup only. Destination is agreed when you arrive.'
                              : 'About ${active.etaMinutes} mins to their area. Number is shared for this pickup only.',
                          phoneE164: active.passengerPhoneE164,
                          contactLabel: 'Passenger number',
                          onCancel: () {
                            ref
                                .read(activeRideRequestProvider.notifier)
                                .markCancelled();
                          },
                          onComplete: () {
                            ref
                                .read(activeRideRequestProvider.notifier)
                                .markCompleted();
                          },
                        ),
                        const SizedBox(height: AppSpacing.md),
                        Text(
                          'After you arrive, ask where they’re going. Trip fare stays between you two.',
                          style: theme.textTheme.bodyMedium?.copyWith(
                            color: AppColors.textSecondary,
                            height: 1.4,
                          ),
                        ),
                      ],
                    )
                  : const _EmptyJobs(),
            ),
          ],
        ),
      ),
    );
  }
}

class _EmptyJobs extends StatelessWidget {
  const _EmptyJobs();

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
                Icons.work_outline_rounded,
                color: AppColors.darkGrey,
                size: 30,
              ),
            ),
            const SizedBox(height: AppSpacing.md),
            Text(
              'Waiting for requests',
              style: theme.textTheme.titleMedium?.copyWith(
                fontWeight: FontWeight.w800,
                color: AppColors.textPrimary,
              ),
            ),
            const SizedBox(height: 6),
            Text(
              'When a passenger requests you, their number will show here for the pickup.',
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
