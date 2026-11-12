import 'dart:async';

import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:go_router/go_router.dart';

import '../../../core/constants/app_colors.dart';
import '../../../core/routing/app_routes.dart';
import '../../../core/theme/app_radii.dart';
import '../../../core/theme/app_spacing.dart';
import '../../../features/auth/application/signup_controller.dart';
import '../../../shared/ride_session/active_ride_request_controller.dart';
import '../../../shared/ride_session/passenger_cancel_ride.dart';
import '../../../shared/ride_session/show_passenger_cancel_notice.dart';
import '../../../shared/widgets/active_contact_card.dart';
import '../../../shared/widgets/cyrlo_button.dart';
import '../../../shared/widgets/illustration_view.dart';
import '../../../shared/widgets/skeleton.dart';
import '../../map/application/trip_pin_controller.dart';
import '../../rides/presentation/rate_rider_sheet.dart';
import '../application/nearby_riders_provider.dart';
import '../application/passenger_notifications_provider.dart';
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
    final ridersState = ref.watch(nearbyRidersProvider);
    final riders = ridersState.items;
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
                        ridersState.isLoading
                            ? 'Finding riders nearby…'
                            : ridersState.message ??
                                (availableCount > 0
                                    ? '$availableCount rider${availableCount == 1 ? '' : 's'} nearby'
                                    : riders.isEmpty
                                        ? 'Set your pickup on the map, then find a rider'
                                        : 'Tap a rider to request'),
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
                  onPressed: () {
                    unawaited(
                      ref.read(passengerNotificationsProvider.notifier).refresh(),
                    );
                    showPassengerNotificationsSheet(context);
                  },
                ),
              ],
            ),
            if (activeRequest == null) ...[
              const SizedBox(height: AppSpacing.md),
              CyrloButton(
                key: const Key('book-live-ride'),
                label: 'Book a Pragya',
                onPressed: () async {
                  var pickup = ref.read(tripPinProvider).pickup;
                  if (pickup == null || !pickup.isValid) {
                    await ref
                        .read(tripPinProvider.notifier)
                        .useCurrentLocationAsPickup();
                    pickup = ref.read(tripPinProvider).pickup;
                  }
                  if (!context.mounted) return;
                  if (pickup == null || !pickup.isValid) {
                    context.go(AppRoutes.passengerMap);
                    return;
                  }
                  await startLiveBookingFlow(
                    context: context,
                    ref: ref,
                    pickup: pickup,
                  );
                },
              ),
            ],
            if (shareContact) ...[
              const SizedBox(height: AppSpacing.md),
              ActiveContactCard(
                title: '${activeRequest!.kindLabel} requested',
                subtitle:
                    'Your rider’s number is shared for this pickup. Open Map to mark where they should meet you.',
                phoneE164: activeRequest.riderPhoneE164,
                contactLabel: 'Rider number',
                onCancel: () => cancelActiveRideWithFeedback(context, ref),
              ),
            ],
            if (!ridersState.isLoading && riders.isNotEmpty) ...[
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
                    padding: const EdgeInsets.symmetric(
                      horizontal: 10,
                      vertical: 5,
                    ),
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
            ],
            Expanded(
              child: ridersState.isLoading
                  ? const SkeletonList(count: 4)
                  : riders.isEmpty
                  ? const _EmptyNearbyState()
                  : ListView(
                      children: [
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
                                AppRoutes.passengerRiderDetailPath(
                                  riders[i].id,
                                ),
                              );
                            },
                          ),
                          if (i != riders.length - 1)
                            const SizedBox(height: AppSpacing.sm),
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

class _EmptyNearbyState extends StatelessWidget {
  const _EmptyNearbyState();

  @override
  Widget build(BuildContext context) {
    final theme = Theme.of(context);
    return Center(
      child: SingleChildScrollView(
        padding: const EdgeInsets.fromLTRB(8, 24, 8, 32),
        child: Column(
          mainAxisSize: MainAxisSize.min,
          children: [
            const IllustrationView(
              asset: AppIllustrations.nearbyMap,
              height: 200,
            ),
            const SizedBox(height: AppSpacing.lg),
            Text(
              'No Pragya nearby yet',
              textAlign: TextAlign.center,
              style: theme.textTheme.titleLarge?.copyWith(
                fontWeight: FontWeight.w800,
                color: AppColors.textPrimary,
              ),
            ),
            const SizedBox(height: 8),
            Text(
              'We’re onboarding Pragya riders in your area. When one comes online near you, they’ll show up here to request.',
              textAlign: TextAlign.center,
              style: theme.textTheme.bodyLarge?.copyWith(
                color: AppColors.textSecondary,
                height: 1.4,
                fontWeight: FontWeight.w500,
              ),
            ),
          ],
        ),
      ),
    );
  }
}
