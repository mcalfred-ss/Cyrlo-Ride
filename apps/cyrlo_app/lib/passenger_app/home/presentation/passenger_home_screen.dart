import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:go_router/go_router.dart';

import '../../../core/constants/app_colors.dart';
import '../../../core/routing/app_routes.dart';
import '../../../core/theme/app_radii.dart';
import '../../../core/theme/app_spacing.dart';
import '../../../features/auth/application/signup_controller.dart';
import '../../../shared/ride_session/active_ride_request_controller.dart';
import '../../../shared/ride_session/show_passenger_cancel_notice.dart';
import '../../../shared/widgets/active_contact_card.dart';
import '../../rides/presentation/rate_rider_sheet.dart';
import '../application/nearby_riders_provider.dart';
import '../application/passenger_notifications_provider.dart';
import '../../../shared/widgets/cyrlo_button.dart';
import 'live_booking_flow.dart';
import 'nearby_rider_card.dart';
import 'notification_bell_button.dart';
import 'passenger_notifications_sheet.dart';
import 'request_ride_flow.dart';

class PassengerHomeScreen extends ConsumerWidget {
  const PassengerHomeScreen({super.key});

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final draft = ref.watch(signupProvider);
    final riders = ref.watch(nearbyRidersProvider);
    final activeRequest = ref.watch(activeRideRequestProvider);
    final unreadCount = ref.watch(unreadNotificationCountProvider);
    final shareContact = activeRequest?.sharesContact == true;
    final firstName = draft.passengerFirstName?.trim();
    final greetingName =
        (firstName == null || firstName.isEmpty) ? 'there' : firstName;
    final availableCount = riders.where((rider) => rider.canRequest).length;
    final theme = Theme.of(context);

    listenForPassengerCancelNotice(ref, context);
    listenForPendingRideReview(ref, context);

    return SizedBox.expand(
      child: Padding(
        padding: const EdgeInsets.fromLTRB(20, 12, 20, 0),
        child: Column(
          crossAxisAlignment: CrossAxisAlignment.stretch,
          children: [
            Row(
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                Expanded(
                  child: Column(
                    crossAxisAlignment: CrossAxisAlignment.start,
                    children: [
                      Text(
                        'Hi, $greetingName',
                        style: theme.textTheme.headlineSmall?.copyWith(
                          color: AppColors.textPrimary,
                          fontWeight: FontWeight.w800,
                          letterSpacing: -0.4,
                          height: 1.15,
                        ),
                      ),
                      const SizedBox(height: 6),
                      Text(
                        riders.isEmpty
                            ? 'Request a ride — we match a nearby rider after payment'
                            : 'Riders near you right now',
                        style: theme.textTheme.bodyLarge?.copyWith(
                          color: AppColors.textSecondary,
                          fontWeight: FontWeight.w500,
                          height: 1.35,
                        ),
                      ),
                    ],
                  ),
                ),
                const SizedBox(width: AppSpacing.sm),
                NotificationBellButton(
                  unreadCount: unreadCount,
                  onPressed: () => showPassengerNotificationsSheet(context),
                ),
              ],
            ),
            const SizedBox(height: AppSpacing.lg),
            Row(
              children: [
                Text(
                  'Available nearby',
                  style: theme.textTheme.titleSmall?.copyWith(
                    color: AppColors.textPrimary,
                    fontWeight: FontWeight.w800,
                  ),
                ),
                const Spacer(),
                Container(
                  padding: const EdgeInsets.symmetric(horizontal: 10, vertical: 5),
                  decoration: BoxDecoration(
                    color: AppColors.brandLight,
                    borderRadius: BorderRadius.circular(AppRadii.pill),
                  ),
                  child: Text(
                    '$availableCount online',
                    style: theme.textTheme.labelMedium?.copyWith(
                      color: AppColors.onBrandLight,
                      fontWeight: FontWeight.w800,
                    ),
                  ),
                ),
              ],
            ),
            const SizedBox(height: AppSpacing.sm),
            Expanded(
              child: ListView(
                children: [
                  CyrloButton(
                    key: const Key('request-live-ride'),
                    label: 'Request a ride',
                    onPressed: () => startLiveBookingFlow(
                      context: context,
                      ref: ref,
                    ),
                  ),
                  const SizedBox(height: AppSpacing.md),
                  if (shareContact) ...[
                    ActiveContactCard(
                      title: '${activeRequest!.kindLabel} requested',
                      subtitle:
                          'Rider number is shared for this pickup. Open Map to mark where they should meet you. The rider ends the trip after drop-off.',
                      phoneE164: activeRequest.riderPhoneE164,
                      contactLabel: 'Rider number',
                      onCancel: () {
                        ref.read(activeRideRequestProvider.notifier).markCancelled();
                        ref.read(selectedNearbyRiderProvider.notifier).clear();
                      },
                    ),
                    const SizedBox(height: AppSpacing.md),
                  ],
                  if (riders.isEmpty)
                    Padding(
                      padding: const EdgeInsets.only(top: AppSpacing.sm),
                      child: Text(
                        'Live nearby markers are not available yet. Matching still finds a rider after you pay.',
                        style: theme.textTheme.bodyMedium?.copyWith(
                          color: AppColors.textSecondary,
                          height: 1.4,
                        ),
                      ),
                    ),
                  ...[
                    for (var i = 0; i < riders.length; i++) ...[
                      NearbyRiderCard(
                        key: Key('nearby-rider-${riders[i].id}'),
                        rider: riders[i],
                        onRequest: () {
                          startRequestRideFlow(
                            context: context,
                            ref: ref,
                            rider: riders[i],
                          );
                        },
                        onOpenMap: () {
                          ref
                              .read(selectedNearbyRiderProvider.notifier)
                              .select(riders[i]);
                          context.go(AppRoutes.passengerMap);
                        },
                        onOpenProfile: () {
                          context.push(
                            AppRoutes.passengerRiderDetailPath(riders[i].id),
                          );
                        },
                      ),
                      if (i != riders.length - 1)
                        const SizedBox(height: AppSpacing.sm),
                    ],
                  ],
                ],
              ),
            ),
          ],
        ),
      ),
    );
  }
}
