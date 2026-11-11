import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:go_router/go_router.dart';

import '../../../core/constants/app_colors.dart';
import '../../../core/errors/api_exception.dart';
import '../../../core/routing/app_routes.dart';
import '../../../core/theme/app_radii.dart';
import '../../../core/theme/app_spacing.dart';
import '../../../shared/ride_session/active_ride_request.dart';
import '../../../shared/ride_session/active_ride_request_controller.dart';
import '../../../shared/ride_session/end_trip_by_rider.dart';
import '../../../shared/ride_session/rider_accept_job.dart';
import '../../../shared/ride_session/rider_cancel_accepted_ride.dart';
import '../../../shared/widgets/active_contact_card.dart';
import '../../../shared/widgets/cyrlo_button.dart';
import '../../../shared/widgets/illustration_view.dart';
import '../../../shared/widgets/profile_avatar.dart';
import '../../../shared/widgets/skeleton.dart';
import '../../availability/application/rider_availability_provider.dart';
import 'rider_job_card.dart';

class RiderJobsScreen extends ConsumerWidget {
  const RiderJobsScreen({super.key});

  Future<void> _confirmCancel(
    BuildContext context,
    WidgetRef ref,
    ActiveRideRequest job,
  ) async {
    final ok = await showDialog<bool>(
      context: context,
      builder: (context) => AlertDialog(
        backgroundColor: AppColors.surface,
        shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(24)),
        title: const Text('Cancel this request?'),
        content: Text(
          'Decline ${job.displayFirstName}’s pickup request?',
          style: const TextStyle(height: 1.4),
        ),
        actions: [
          TextButton(
            onPressed: () => Navigator.of(context).pop(false),
            child: const Text('No'),
          ),
          FilledButton(
            key: const Key('confirm-cancel-job'),
            onPressed: () => Navigator.of(context).pop(true),
            child: const Text('Yes, cancel'),
          ),
        ],
      ),
    );
    if (ok != true) return;
    await ref.read(riderJobOffersProvider.notifier).decline(job.id);
  }

  Future<void> _confirmAccept(
    BuildContext context,
    WidgetRef ref,
    ActiveRideRequest job,
  ) async {
    final waitingOthers = ref
        .read(riderJobOffersProvider)
        .items
        .where((item) => item.id != job.id)
        .length;
    final ok = await showDialog<bool>(
      context: context,
      builder: (context) => AlertDialog(
        backgroundColor: AppColors.surface,
        shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(24)),
        title: Text('Accept ${job.displayFirstName}?'),
        content: Text(
          waitingOthers > 0
              ? '${job.etaLabel}. You’ll open the map for this pickup. '
                  'The other pending offer${waitingOthers == 1 ? '' : 's'} '
                  'will be released.'
              : '${job.etaLabel}. You’ll open the map and head to their pickup.',
          style: const TextStyle(height: 1.4),
        ),
        actions: [
          TextButton(
            onPressed: () => Navigator.of(context).pop(false),
            child: const Text('No'),
          ),
          FilledButton(
            key: const Key('confirm-accept-job'),
            onPressed: () => Navigator.of(context).pop(true),
            child: const Text('Yes, accept'),
          ),
        ],
      ),
    );
    if (ok != true || !context.mounted) return;

    final messenger = ScaffoldMessenger.of(context);
    final result = await acceptJobAndReleaseSiblings(ref, job.id);
    if (!context.mounted || result == null) return;
    if (result.bumpedCount > 0) {
      messenger.showSnackBar(
        SnackBar(
          behavior: SnackBarBehavior.floating,
          backgroundColor: AppColors.darkGrey,
          content: Text(
            result.bumpedCount == 1
                ? 'Accepted. The other pending offer was released.'
                : 'Accepted. ${result.bumpedCount} other pending offers were released.',
            style: const TextStyle(
              color: Colors.white,
              fontWeight: FontWeight.w700,
            ),
          ),
        ),
      );
    }
    context.go(AppRoutes.riderMap);
  }

  Future<void> _confirmGoOffline(BuildContext context, WidgetRef ref) async {
    final ok = await showDialog<bool>(
      context: context,
      builder: (context) => AlertDialog(
        backgroundColor: AppColors.surface,
        shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(24)),
        title: const Text('Go offline?'),
        content: const Text(
          'You won’t receive new pickup requests until you go online again.',
          style: TextStyle(height: 1.4),
        ),
        actions: [
          TextButton(
            onPressed: () => Navigator.of(context).pop(false),
            child: const Text('Stay online'),
          ),
          FilledButton(
            key: const Key('confirm-go-offline'),
            onPressed: () => Navigator.of(context).pop(true),
            child: const Text('Go offline'),
          ),
        ],
      ),
    );
    if (ok != true) return;
    ref.read(previewRiderJobProvider.notifier).clear();
    try {
      await ref.read(riderOnlineProvider.notifier).goOffline();
    } catch (error) {
      if (!context.mounted) return;
      ScaffoldMessenger.of(context).showSnackBar(
        SnackBar(
          behavior: SnackBarBehavior.floating,
          backgroundColor: AppColors.darkGrey,
          content: Text(
            '$error',
            style: const TextStyle(color: Colors.white, fontWeight: FontWeight.w700),
          ),
        ),
      );
    }
  }

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final offersState = ref.watch(riderJobOffersProvider);
    final offers = offersState.items;
    final active = ref.watch(activeRideRequestProvider);
    final online = ref.watch(riderOnlineProvider);
    final theme = Theme.of(context);
    final accepted = active?.isAccepted == true;

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
                        accepted
                            ? 'You’re on a pickup. Open the map if you need directions.'
                            : online
                                ? 'You’re online. Nearby pickup requests will show here.'
                                : 'Go online to start receiving pickup requests.',
                        style: theme.textTheme.bodyLarge?.copyWith(
                          color: AppColors.textSecondary,
                          fontWeight: FontWeight.w500,
                          height: 1.35,
                        ),
                      ),
                    ],
                  ),
                ),
                if (online && !accepted) ...[
                  const SizedBox(width: AppSpacing.sm),
                  TextButton(
                    key: const Key('go-offline'),
                    onPressed: () => _confirmGoOffline(context, ref),
                    style: TextButton.styleFrom(
                      foregroundColor: AppColors.textPrimary,
                      backgroundColor: AppColors.field,
                      padding: const EdgeInsets.symmetric(
                        horizontal: 12,
                        vertical: 10,
                      ),
                      shape: RoundedRectangleBorder(
                        borderRadius: BorderRadius.circular(AppRadii.pill),
                      ),
                    ),
                    child: const Text(
                      'Go offline',
                      style: TextStyle(fontWeight: FontWeight.w800),
                    ),
                  ),
                ],
              ],
            ),
            const SizedBox(height: AppSpacing.lg),
            if (!online && !accepted)
              const Expanded(child: _OfflineHome())
            else ...[
              Row(
                children: [
                  Text(
                    accepted
                        ? 'Active job'
                        : offers.isEmpty
                            ? 'No requests'
                            : 'Incoming',
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
                      color: accepted || offers.isNotEmpty
                          ? AppColors.yellow
                          : AppColors.field,
                      borderRadius: BorderRadius.circular(AppRadii.pill),
                    ),
                    child: Text(
                      accepted
                          ? 'On job'
                          : offers.isEmpty
                              ? 'Online'
                              : '${offers.length} waiting',
                      style: theme.textTheme.labelMedium?.copyWith(
                        color: accepted || offers.isNotEmpty
                            ? AppColors.darkGrey
                            : AppColors.textPrimary,
                        fontWeight: FontWeight.w800,
                      ),
                    ),
                  ),
                ],
              ),
              const SizedBox(height: AppSpacing.sm),
              Expanded(
                child: accepted
                    ? ListView(
                        children: [
                          _AcceptedJobBanner(job: active!),
                          const SizedBox(height: AppSpacing.sm),
                          ActiveContactCard(
                            title: '${active.displayFirstName} is waiting',
                            subtitle:
                                'Call if you need help finding them. Destination stays off the app.',
                            phoneE164: active.passengerPhoneE164,
                            contactLabel: 'Passenger number',
                            onCancel: () async {
                              final ok = await showDialog<bool>(
                                context: context,
                                builder: (context) => AlertDialog(
                                  backgroundColor: AppColors.surface,
                                  shape: RoundedRectangleBorder(
                                    borderRadius: BorderRadius.circular(24),
                                  ),
                                  title: const Text('Cancel this job?'),
                                  content: const Text(
                                    'End this pickup? The passenger will get an in-app notice and an SMS.',
                                    style: TextStyle(height: 1.4),
                                  ),
                                  actions: [
                                    TextButton(
                                      onPressed: () =>
                                          Navigator.of(context).pop(false),
                                      child: const Text('No'),
                                    ),
                                    FilledButton(
                                      key: const Key('confirm-cancel-accepted-job'),
                                      onPressed: () =>
                                          Navigator.of(context).pop(true),
                                      child: const Text('Yes, cancel'),
                                    ),
                                  ],
                                ),
                              );
                              if (ok != true || !context.mounted) return;
                              final result =
                                  await cancelAcceptedRideByRider(ref);
                              if (!context.mounted || !result.cancelled) return;
                              ScaffoldMessenger.of(context).showSnackBar(
                                SnackBar(
                                  behavior: SnackBarBehavior.floating,
                                  backgroundColor: AppColors.darkGrey,
                                  content: Text(
                                    result.passengerNotified
                                        ? 'Job cancelled. ${result.passengerFirstName ?? 'Passenger'} was notified by Cyrlo.'
                                        : 'Job cancelled on this device, but the server could not be reached.',
                                    style: const TextStyle(
                                      color: Colors.white,
                                      fontWeight: FontWeight.w700,
                                    ),
                                  ),
                                ),
                              );
                            },
                            completeLabel: 'End trip',
                            onComplete: () async {
                              final ok = await showDialog<bool>(
                                context: context,
                                builder: (context) => AlertDialog(
                                  backgroundColor: AppColors.surface,
                                  shape: RoundedRectangleBorder(
                                    borderRadius: BorderRadius.circular(24),
                                  ),
                                  title: const Text('End this trip?'),
                                  content: const Text(
                                    'Only end after you’ve dropped the passenger off. They’ll be asked to rate you.',
                                    style: TextStyle(height: 1.4),
                                  ),
                                  actions: [
                                    TextButton(
                                      onPressed: () =>
                                          Navigator.of(context).pop(false),
                                      child: const Text('Not yet'),
                                    ),
                                    FilledButton(
                                      key: const Key('confirm-end-trip'),
                                      onPressed: () =>
                                          Navigator.of(context).pop(true),
                                      child: const Text('End trip'),
                                    ),
                                  ],
                                ),
                              );
                              if (ok != true || !context.mounted) return;
                              final result = await endTripByRider(ref);
                              if (!context.mounted || !result.ended) return;
                              ScaffoldMessenger.of(context).showSnackBar(
                                SnackBar(
                                  behavior: SnackBarBehavior.floating,
                                  backgroundColor: AppColors.darkGrey,
                                  content: Text(
                                    'Trip ended. ${result.passengerFirstName ?? 'Passenger'} can rate you now.',
                                    style: const TextStyle(
                                      color: Colors.white,
                                      fontWeight: FontWeight.w700,
                                    ),
                                  ),
                                ),
                              );
                            },
                          ),
                          const SizedBox(height: AppSpacing.md),
                          CyrloButton(
                            key: const Key('open-rider-map'),
                            label: 'Open pickup map',
                            onPressed: () => context.go(AppRoutes.riderMap),
                          ),
                        ],
                      )
                    : offersState.isLoading
                        ? const SkeletonList(count: 3)
                        : offers.isEmpty
                        ? const _EmptyJobs()
                        : ListView.separated(
                            key: const Key('rider-jobs-list'),
                            itemCount: offers.length,
                            separatorBuilder: (context, index) =>
                                const SizedBox(height: AppSpacing.sm),
                            itemBuilder: (context, index) {
                              final job = offers[index];
                              return RiderJobCard(
                                key: Key('rider-job-${job.id}'),
                                job: job,
                                onAccept: () =>
                                    _confirmAccept(context, ref, job),
                                onCancel: () =>
                                    _confirmCancel(context, ref, job),
                                onOpenMap: () {
                                  ref
                                      .read(previewRiderJobProvider.notifier)
                                      .select(job);
                                  context.go(AppRoutes.riderMap);
                                },
                              );
                            },
                          ),
              ),
            ],
          ],
        ),
      ),
    );
  }
}

class _OfflineHome extends ConsumerStatefulWidget {
  const _OfflineHome();

  @override
  ConsumerState<_OfflineHome> createState() => _OfflineHomeState();
}

class _OfflineHomeState extends ConsumerState<_OfflineHome> {
  var _busy = false;

  Future<void> _goOnline() async {
    if (_busy) return;
    setState(() => _busy = true);
    try {
      await ref.read(riderOnlineProvider.notifier).goOnline();
    } catch (error) {
      if (!mounted) return;
      final message = _goOnlineErrorMessage(error);
      ScaffoldMessenger.of(context).showSnackBar(
        SnackBar(
          behavior: SnackBarBehavior.floating,
          backgroundColor: AppColors.yellow,
          content: Text(
            message,
            style: const TextStyle(
              color: AppColors.darkGrey,
              fontWeight: FontWeight.w700,
            ),
          ),
        ),
      );
    } finally {
      if (mounted) setState(() => _busy = false);
    }
  }

  @override
  Widget build(BuildContext context) {
    final theme = Theme.of(context);
    return Center(
      child: SingleChildScrollView(
        padding: const EdgeInsets.all(AppSpacing.lg),
        child: Column(
          mainAxisSize: MainAxisSize.min,
          children: [
            const IllustrationView(
              asset: AppIllustrations.roleRider,
              height: 180,
            ),
            const SizedBox(height: AppSpacing.lg),
            Text(
              'You’re offline',
              style: theme.textTheme.titleLarge?.copyWith(
                fontWeight: FontWeight.w800,
                color: AppColors.textPrimary,
              ),
            ),
            const SizedBox(height: 8),
            Text(
              'Turn on location, then tap Go online to take Pragya pickup requests near you.',
              textAlign: TextAlign.center,
              style: theme.textTheme.bodyLarge?.copyWith(
                color: AppColors.textSecondary,
                height: 1.4,
                fontWeight: FontWeight.w500,
              ),
            ),
            const SizedBox(height: AppSpacing.xl),
            CyrloButton(
              key: const Key('go-online'),
              label: _busy ? 'Going online…' : 'Go online',
              onPressed: _busy ? null : _goOnline,
            ),
          ],
        ),
      ),
    );
  }
}

String _goOnlineErrorMessage(Object error) {
  if (error is ApiException) {
    final reasons = error.details?['reasons'];
    if (reasons is List && reasons.isNotEmpty) {
      final codes = reasons.map((item) => '$item').toSet();
      if (codes.contains('NO_APPROVED_ACTIVE_ZONE')) {
        return 'Your zone isn’t active yet. Contact Cyrlo support.';
      }
      if (codes.contains('RIDER_NOT_APPROVED') ||
          codes.contains('NO_APPROVED_VEHICLE')) {
        return 'Your rider application still needs approval.';
      }
      if (codes.contains('NO_LOCATION') ||
          codes.contains('GPS_NOT_SHARING') ||
          codes.contains('GPS_NOT_FRESH')) {
        return 'Turn on location and try again.';
      }
    }
    return error.message;
  }
  return 'Could not go online. Try again.';
}

class _AcceptedJobBanner extends StatelessWidget {
  const _AcceptedJobBanner({required this.job});

  final ActiveRideRequest job;

  @override
  Widget build(BuildContext context) {
    final theme = Theme.of(context);
    final avatar = ProfileAvatars.assetFor(
      gender: job.passengerGender,
      seed: job.id,
    );

    return DecoratedBox(
      decoration: BoxDecoration(
        color: AppColors.brandLight,
        borderRadius: BorderRadius.circular(AppRadii.lg),
        border: Border.all(color: AppColors.border),
      ),
      child: Padding(
        padding: const EdgeInsets.all(AppSpacing.sm),
        child: Row(
          children: [
            ClipRRect(
              borderRadius: BorderRadius.circular(AppRadii.md),
              child: Image.asset(
                avatar,
                width: 56,
                height: 56,
                fit: BoxFit.cover,
              ),
            ),
            const SizedBox(width: AppSpacing.sm),
            Expanded(
              child: Column(
                crossAxisAlignment: CrossAxisAlignment.start,
                children: [
                  Text(
                    'Heading to ${job.displayFirstName}',
                    style: theme.textTheme.titleSmall?.copyWith(
                      fontWeight: FontWeight.w800,
                      color: AppColors.onBrandLight,
                    ),
                  ),
                  const SizedBox(height: 2),
                  Text(
                    job.etaLabel,
                    style: theme.textTheme.bodyMedium?.copyWith(
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
              child: Icon(
                Icons.work_outline_rounded,
                color: AppColors.onBrandLight,
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
              'When passengers request a ride, their cards will show up here.',
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
