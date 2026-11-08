import 'package:cyrlo_maps/cyrlo_maps.dart';
import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:go_router/go_router.dart';

import '../../../core/constants/app_colors.dart';
import '../../../core/mapping/mapping_providers.dart';
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
import '../../../shared/widgets/profile_avatar.dart';

/// Rider map: preview a passenger before accept, or navigate after accepting.
class RiderMapScreen extends ConsumerStatefulWidget {
  const RiderMapScreen({super.key});

  @override
  ConsumerState<RiderMapScreen> createState() => _RiderMapScreenState();
}

class _RiderMapScreenState extends ConsumerState<RiderMapScreen> {
  final CyrloMapController _mapController = CyrloMapController();
  String? _focusedJobId;

  @override
  void dispose() {
    _mapController.dispose();
    super.dispose();
  }

  void _focusJob(ActiveRideRequest? job) {
    final point = job?.pickupPoint;
    if (job == null || point == null || job.id == _focusedJobId) return;
    _focusedJobId = job.id;
    WidgetsBinding.instance.addPostFrameCallback((_) {
      if (!mounted) return;
      _mapController.move(point.toMapCoordinate(), 15);
    });
  }

  Future<void> _confirmAccept(ActiveRideRequest job) async {
    final waitingOthers =
        ref.read(riderJobOffersProvider).where((item) => item.id != job.id).length;
    final ok = await showDialog<bool>(
      context: context,
      builder: (context) => AlertDialog(
        backgroundColor: AppColors.surface,
        shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(24)),
        title: Text('Accept ${job.displayFirstName}?'),
        content: Text(
          waitingOthers > 0
              ? '${job.etaLabel}. You’ll head to this pickup. '
                  'Other waiting passengers will be told you’re busy (in-app + SMS).'
              : '${job.etaLabel}. You’ll head to their pickup from here.',
          style: const TextStyle(height: 1.4),
        ),
        actions: [
          TextButton(
            onPressed: () => Navigator.of(context).pop(false),
            child: const Text('No'),
          ),
          FilledButton(
            key: const Key('confirm-accept-job-map'),
            onPressed: () => Navigator.of(context).pop(true),
            child: const Text('Yes, accept'),
          ),
        ],
      ),
    );
    if (ok != true || !mounted) return;
    final messenger = ScaffoldMessenger.of(context);
    final result = await acceptJobAndReleaseSiblings(ref, job.id);
    if (!mounted || result == null) return;
    if (result.bumpedCount > 0) {
      messenger.showSnackBar(
        SnackBar(
          behavior: SnackBarBehavior.floating,
          backgroundColor: AppColors.darkGrey,
          content: Text(
            result.bumpedCount == 1
                ? 'Accepted. The other waiting passenger was told you’re busy.'
                : 'Accepted. ${result.bumpedCount} other waiting passengers were told you’re busy.',
            style: const TextStyle(
              color: Colors.white,
              fontWeight: FontWeight.w700,
            ),
          ),
        ),
      );
    }
  }

  @override
  Widget build(BuildContext context) {
    final acceptedJob = ref.watch(activeRideRequestProvider);
    final previewJob = ref.watch(previewRiderJobProvider);
    final project = ref.watch(passengerMapProjectProvider);
    final token = ref.watch(mapAccessTokenProvider).valueOrNull ?? '';
    final theme = Theme.of(context);

    final job = (acceptedJob?.isAccepted == true) ? acceptedJob : previewJob;
    final isPreview = acceptedJob?.isAccepted != true && previewJob != null;

    ref.listen(activeRideRequestProvider, (previous, next) {
      _focusedJobId = null;
      _focusJob(next?.isAccepted == true ? next : previewJob);
    });
    ref.listen(previewRiderJobProvider, (previous, next) {
      _focusedJobId = null;
      _focusJob(acceptedJob?.isAccepted == true ? acceptedJob : next);
    });
    _focusJob(job);

    if (job == null) {
      return SizedBox.expand(
        child: Padding(
          padding: const EdgeInsets.fromLTRB(20, 12, 20, 0),
          child: Column(
            crossAxisAlignment: CrossAxisAlignment.stretch,
            children: [
              Text(
                'Pickup map',
                style: theme.textTheme.headlineSmall?.copyWith(
                  fontWeight: FontWeight.w800,
                  letterSpacing: -0.4,
                ),
              ),
              const SizedBox(height: 6),
              Text(
                'Open a request’s map button to preview the passenger, or accept a job first.',
                style: theme.textTheme.bodyLarge?.copyWith(
                  color: AppColors.textSecondary,
                  fontWeight: FontWeight.w500,
                ),
              ),
              const Spacer(),
              FilledButton(
                onPressed: () => context.go(AppRoutes.riderJobs),
                child: const Text('Back to Jobs'),
              ),
              const SizedBox(height: AppSpacing.md),
            ],
          ),
        ),
      );
    }

    final avatar = ProfileAvatars.assetFor(
      gender: job.passengerGender,
      seed: job.id,
    );

    return Scaffold(
      body: Stack(
        fit: StackFit.expand,
        children: [
          CyrloMapView(
            project: project,
            accessToken: token,
            isDark: Theme.of(context).brightness == Brightness.dark,
            controller: _mapController,
            markers: [
              if (job.pickupPoint != null)
                MapMarker(
                  id: 'passenger-pickup',
                  point: job.pickupPoint!.toMapCoordinate(),
                  child: ClipOval(
                    child: Image.asset(
                      avatar,
                      width: 40,
                      height: 40,
                      fit: BoxFit.cover,
                    ),
                  ),
                ),
            ],
          ),
          SafeArea(
            child: Padding(
              padding: const EdgeInsets.all(AppSpacing.md),
              child: Column(
                crossAxisAlignment: CrossAxisAlignment.stretch,
                children: [
                  Material(
                    color: theme.colorScheme.surface.withValues(alpha: 0.96),
                    borderRadius: BorderRadius.circular(AppRadii.md),
                    child: Padding(
                      padding: const EdgeInsets.all(AppSpacing.md),
                      child: Row(
                        children: [
                          ClipRRect(
                            borderRadius: BorderRadius.circular(14),
                            child: Image.asset(
                              avatar,
                              width: 48,
                              height: 48,
                              fit: BoxFit.cover,
                            ),
                          ),
                          const SizedBox(width: AppSpacing.sm),
                          Expanded(
                            child: Column(
                              crossAxisAlignment: CrossAxisAlignment.start,
                              children: [
                                Text(
                                  isPreview
                                      ? 'Preview · ${job.displayFirstName}'
                                      : 'Pickup · ${job.displayFirstName}',
                                  style: theme.textTheme.titleMedium?.copyWith(
                                    fontWeight: FontWeight.w800,
                                  ),
                                ),
                                const SizedBox(height: 2),
                                Text(
                                  isPreview
                                      ? '${job.etaLabel}. Check the pin, then accept if you want the job.'
                                      : '${job.etaLabel}. Call if you need help finding them.',
                                  style: theme.textTheme.bodyMedium?.copyWith(
                                    color: AppColors.inkDim,
                                    height: 1.35,
                                  ),
                                ),
                              ],
                            ),
                          ),
                        ],
                      ),
                    ),
                  ),
                  const SizedBox(height: AppSpacing.sm),
                  if (isPreview) ...[
                    Row(
                      children: [
                        Expanded(
                          child: CyrloButton(
                            key: const Key('preview-back-jobs'),
                            label: 'Back',
                            variant: CyrloButtonVariant.outlined,
                            onPressed: () {
                              ref
                                  .read(previewRiderJobProvider.notifier)
                                  .clear();
                              context.go(AppRoutes.riderJobs);
                            },
                          ),
                        ),
                        const SizedBox(width: AppSpacing.sm),
                        Expanded(
                          child: CyrloButton(
                            key: Key('preview-accept-${job.id}'),
                            label: 'Accept',
                            onPressed: () => _confirmAccept(job),
                          ),
                        ),
                      ],
                    ),
                  ] else
                    ActiveContactCard(
                      title: 'Passenger number',
                      subtitle: 'Shared only while this pickup is active.',
                      phoneE164: job.passengerPhoneE164,
                      contactLabel: job.displayFirstName,
                      onCancel: () async {
                        final messenger = ScaffoldMessenger.of(context);
                        final router = GoRouter.of(context);
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
                                key: const Key('confirm-cancel-accepted-job-map'),
                                onPressed: () =>
                                    Navigator.of(context).pop(true),
                                child: const Text('Yes, cancel'),
                              ),
                            ],
                          ),
                        );
                        if (ok != true || !mounted) return;
                        final result = await cancelAcceptedRideByRider(ref);
                        if (!mounted || !result.cancelled) return;
                        messenger.showSnackBar(
                          SnackBar(
                            behavior: SnackBarBehavior.floating,
                            backgroundColor: AppColors.darkGrey,
                            content: Text(
                              result.smsSent
                                  ? 'Job cancelled. Passenger notified in-app and by SMS.'
                                  : 'Job cancelled. In-app notice sent; SMS could not be sent.',
                              style: const TextStyle(
                                color: Colors.white,
                                fontWeight: FontWeight.w700,
                              ),
                            ),
                          ),
                        );
                        router.go(AppRoutes.riderJobs);
                      },
                      completeLabel: 'End trip',
                      onComplete: () async {
                        final messenger = ScaffoldMessenger.of(context);
                        final router = GoRouter.of(context);
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
                                key: const Key('confirm-end-trip-map'),
                                onPressed: () =>
                                    Navigator.of(context).pop(true),
                                child: const Text('End trip'),
                              ),
                            ],
                          ),
                        );
                        if (ok != true || !mounted) return;
                        final result = endTripByRider(ref);
                        if (!mounted || !result.ended) return;
                        messenger.showSnackBar(
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
                        router.go(AppRoutes.riderJobs);
                      },
                    ),
                ],
              ),
            ),
          ),
        ],
      ),
    );
  }
}
