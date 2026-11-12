import 'dart:async';

import 'package:cyrlo_maps/cyrlo_maps.dart';
import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:go_router/go_router.dart';

import '../../../core/constants/app_colors.dart';
import '../../../core/mapping/mapping_providers.dart';
import '../../../core/routing/app_routes.dart';
import '../../../core/theme/app_radii.dart';
import '../../../core/theme/app_spacing.dart';
import '../../../shared/models/geo_point.dart';
import '../../../shared/ride_session/active_ride_request.dart';
import '../../../shared/ride_session/active_ride_request_controller.dart';
import '../../../shared/ride_session/passenger_cancel_notice.dart';
import '../../../shared/widgets/active_contact_card.dart';
import '../../../shared/widgets/cyrlo_button.dart';
import '../../home/application/nearby_riders_provider.dart';
import '../../home/domain/nearby_rider.dart';
import '../../home/presentation/live_booking_flow.dart';
import '../../rides/presentation/rate_rider_sheet.dart';
import '../application/nearby_riders_map_motion.dart';
import '../application/passenger_trip_plan.dart';
import '../application/trip_pin_controller.dart';
import '../application/trip_pin_state.dart';
import 'bolt_rider_map_marker.dart';

/// Passenger map: pickup-only booking + nearby riders.
class PassengerMapScreen extends ConsumerStatefulWidget {
  const PassengerMapScreen({super.key});

  @override
  ConsumerState<PassengerMapScreen> createState() => _PassengerMapScreenState();
}

class _PassengerMapScreenState extends ConsumerState<PassengerMapScreen> {
  final CyrloMapController _mapController = CyrloMapController();
  String? _focusedRiderId;
  GeoPoint? _focusedPickup;
  var _fittedRiders = false;
  var _bootstrappedLocation = false;

  @override
  void initState() {
    super.initState();
    WidgetsBinding.instance.addPostFrameCallback((_) {
      if (!mounted || _bootstrappedLocation) return;
      _bootstrappedLocation = true;
      final plan = ref.read(passengerTripPlanProvider);
      if (plan.hasPickup) return;
      unawaited(
        ref.read(passengerTripPlanProvider.notifier).useCurrentLocationAsPickup(),
      );
    });
  }

  @override
  void dispose() {
    _mapController.dispose();
    super.dispose();
  }

  void _focusNearbyRider(NearbyRider? rider, {double zoom = 15}) {
    if (rider == null) return;
    _focusedRiderId = rider.id;
    WidgetsBinding.instance.addPostFrameCallback((_) {
      if (!mounted) return;
      _mapController.move(rider.point.toMapCoordinate(), zoom);
    });
  }

  void _focusPickup(GeoPoint? pickup) {
    if (pickup == null || pickup == _focusedPickup) return;
    _focusedPickup = pickup;
    WidgetsBinding.instance.addPostFrameCallback((_) {
      if (!mounted) return;
      _mapController.move(pickup.toMapCoordinate(), 16);
    });
  }

  void _fitNearbyRiders(List<NearbyRider> riders) {
    if (riders.isEmpty || _fittedRiders) return;
    _fittedRiders = true;
    final lat =
        riders.map((r) => r.point.latitude).reduce((a, b) => a + b) /
            riders.length;
    final lng =
        riders.map((r) => r.point.longitude).reduce((a, b) => a + b) /
            riders.length;
    WidgetsBinding.instance.addPostFrameCallback((_) {
      if (!mounted) return;
      _mapController.move(
        MapCoordinate(latitude: lat, longitude: lng),
        14.2,
      );
    });
  }

  Future<void> _onRiderMarkerTap(NearbyRider rider) async {
    ref.read(selectedNearbyRiderProvider.notifier).select(rider);
    _focusNearbyRider(rider, zoom: 15.5);
    if (!mounted) return;
    await showModalBottomSheet<void>(
      context: context,
      backgroundColor: Colors.transparent,
      barrierColor: Colors.black.withValues(alpha: 0.35),
      builder: (context) => _NearbyRiderMapSheet(
        rider: rider,
        onRequest: () {
          Navigator.of(context).pop();
          _toast('Set your pickup below, then tap Find a Rider.');
        },
        onClose: () => Navigator.of(context).pop(),
      ),
    );
  }

  Future<void> _continueBooking() async {
    final plan = ref.read(passengerTripPlanProvider);
    final pickup = plan.pickup;
    if (pickup == null) return;
    if (!ref.read(passengerTripPlanProvider.notifier).beginSubmit()) return;
    await startLiveBookingFlow(
      context: context,
      ref: ref,
      pickup: pickup,
      pickupLabel: plan.pickupLabel,
    );
  }

  void _toast(String message) {
    ScaffoldMessenger.of(context).showSnackBar(
      SnackBar(
        behavior: SnackBarBehavior.floating,
        backgroundColor: AppColors.darkGrey,
        content: Text(
          message,
          style: const TextStyle(
            color: Colors.white,
            fontWeight: FontWeight.w700,
          ),
        ),
      ),
    );
  }

  @override
  Widget build(BuildContext context) {
    final pins = ref.watch(tripPinProvider);
    final plan = ref.watch(passengerTripPlanProvider);
    final nearbyRiders = ref.watch(nearbyRidersProvider).items;
    final mapPoses = ref.watch(nearbyRidersMapMotionProvider);
    final movingRiders = ridersWithMapPoses(nearbyRiders, mapPoses);
    final selectedRider = ref.watch(selectedNearbyRiderProvider);
    final activeRequest = ref.watch(activeRideRequestProvider);
    final project = ref.watch(passengerMapProjectProvider);
    final token = ref.watch(mapAccessTokenProvider).value ?? '';
    final theme = Theme.of(context);
    final isDark = theme.brightness == Brightness.dark;
    final shareContact = activeRequest?.sharesContact == true;
    final sharedPickup = pins.pickup ?? activeRequest?.pickupPoint;
    final pickup = plan.pickup ?? sharedPickup;
    final availableCount =
        nearbyRiders.where((rider) => rider.canRequest).length;

    ref.listen(selectedNearbyRiderProvider, (previous, next) {
      if (next != null) _focusNearbyRider(next);
    });
    listenForPendingRideReview(ref, context);
    ref.listen<PassengerCancelNotice?>(passengerCancelNoticeProvider, (
      previous,
      next,
    ) {
      if (next == null) return;
      final notice = next;
      ref.read(passengerCancelNoticeProvider.notifier).clear();
      ScaffoldMessenger.of(context).showSnackBar(
        SnackBar(
          behavior: SnackBarBehavior.floating,
          backgroundColor: AppColors.darkGrey,
          duration: const Duration(seconds: 5),
          content: Text(
            '${notice.title}. ${notice.body}',
            style: const TextStyle(
              color: Colors.white,
              fontWeight: FontWeight.w700,
            ),
          ),
        ),
      );
      context.go(AppRoutes.passengerHome);
    });

    if (shareContact && sharedPickup != null) {
      _focusPickup(sharedPickup);
    } else if (plan.pickup != null) {
      _focusPickup(plan.pickup);
    } else if (selectedRider != null && selectedRider.id != _focusedRiderId) {
      NearbyRider? live;
      for (final rider in movingRiders) {
        if (rider.id == selectedRider.id) {
          live = rider;
          break;
        }
      }
      _focusNearbyRider(live ?? selectedRider);
    } else {
      _fitNearbyRiders(movingRiders);
    }

    return Scaffold(
      body: Stack(
        fit: StackFit.expand,
        children: [
          CyrloMapView(
            project: project,
            accessToken: token,
            isDark: isDark,
            controller: _mapController,
            markers: _markers(
              pins: pins,
              riders: movingRiders,
              poses: mapPoses,
              selectedId: selectedRider?.id ?? activeRequest?.riderId,
              pickup: pickup,
            ),
            onTap: (point) {
              final geo = GeoPoint.fromMapCoordinate(point);
              if (shareContact) {
                unawaited(ref.read(tripPinProvider.notifier).placeAt(geo));
              } else {
                unawaited(
                  ref.read(passengerTripPlanProvider.notifier).placeMapPoint(geo),
                );
              }
            },
          ),
          SafeArea(
            child: Padding(
              padding: const EdgeInsets.all(AppSpacing.md),
              child: Column(
                crossAxisAlignment: CrossAxisAlignment.stretch,
                children: [
                  if (shareContact)
                    _ActiveRideBanner(
                      activeRequest: activeRequest!,
                      pins: pins,
                      availableCount: availableCount,
                      movingRiders: movingRiders,
                      onShowAll: () {
                        _fittedRiders = false;
                        _fitNearbyRiders(movingRiders);
                      },
                      onCancel: () {
                        ref
                            .read(activeRideRequestProvider.notifier)
                            .markCancelled();
                        ref.read(selectedNearbyRiderProvider.notifier).clear();
                      },
                    )
                  else
                    _TripPlanPanel(
                      plan: plan,
                      onFindRider:
                          plan.canFindRider ? _continueBooking : null,
                    ),
                  const Spacer(),
                  Align(
                    alignment: Alignment.bottomRight,
                    child: FloatingActionButton.extended(
                      key: const Key('use-current-location'),
                      onPressed: plan.phase == TripPlanPhase.gettingLocation ||
                              pins.isResolvingLocation
                          ? null
                          : () async {
                              if (shareContact) {
                                await ref
                                    .read(tripPinProvider.notifier)
                                    .useCurrentLocationAsPickup();
                                final next = ref.read(tripPinProvider).pickup;
                                if (next != null) {
                                  _mapController.move(
                                    next.toMapCoordinate(),
                                    15,
                                  );
                                }
                              } else {
                                await ref
                                    .read(passengerTripPlanProvider.notifier)
                                    .useCurrentLocationAsPickup();
                                final next =
                                    ref.read(passengerTripPlanProvider).pickup;
                                if (next != null) {
                                  _focusedPickup = null;
                                  _mapController.move(
                                    next.toMapCoordinate(),
                                    15,
                                  );
                                }
                              }
                            },
                      icon: const Icon(Icons.my_location_rounded),
                      label: const Text('My location'),
                    ),
                  ),
                ],
              ),
            ),
          ),
        ],
      ),
    );
  }

  List<MapMarker> _markers({
    required TripPinState pins,
    required List<NearbyRider> riders,
    required Map<String, MapRiderPose> poses,
    required GeoPoint? pickup,
    String? selectedId,
  }) {
    return [
      for (final rider in riders)
        MapMarker(
          id: 'rider-${rider.id}',
          point: rider.point.toMapCoordinate(),
          width: rider.id == selectedId ? 52 : 44,
          height: rider.id == selectedId ? 70 : 60,
          child: GestureDetector(
            key: Key('map-rider-${rider.id}'),
            onTap: () => _onRiderMarkerTap(rider),
            child: BoltRiderMapMarker(
              rider: rider,
              selected: rider.id == selectedId,
              headingRadians: poses[rider.id]?.headingRadians ?? 0,
            ),
          ),
        ),
      if (pickup != null)
        MapMarker(
          id: 'pickup',
          point: pickup.toMapCoordinate(),
          width: 40,
          height: 40,
          child: const _PinMarker(
            key: Key('pickup-marker'),
            color: AppColors.brand,
            label: 'P',
          ),
        ),
    ];
  }
}

class _TripPlanPanel extends ConsumerWidget {
  const _TripPlanPanel({
    required this.plan,
    required this.onFindRider,
  });

  final PassengerTripPlanState plan;
  final Future<void> Function()? onFindRider;

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final theme = Theme.of(context);
    final nearby = ref.watch(nearbyRidersProvider);
    final ctaLabel = plan.isSubmitting ||
            plan.phase == TripPlanPhase.submittingBooking
        ? 'Finding…'
        : plan.phase == TripPlanPhase.serviceUnavailable
            ? 'Service unavailable'
            : 'Find a Rider';
    final supplyLine = nearby.isLoading
        ? 'Checking nearby riders…'
        : nearby.errorMessage ??
            nearby.message ??
            (nearby.items.isEmpty
                ? null
                : '${nearby.items.length} rider${nearby.items.length == 1 ? '' : 's'} nearby');

    return Material(
      color: theme.colorScheme.surface.withValues(alpha: 0.96),
      borderRadius: BorderRadius.circular(AppRadii.md),
      child: Padding(
        padding: const EdgeInsets.all(AppSpacing.md),
        child: Column(
          crossAxisAlignment: CrossAxisAlignment.stretch,
          mainAxisSize: MainAxisSize.min,
          children: [
            Text(
              'Where should your rider pick you up?',
              style: theme.textTheme.titleMedium?.copyWith(
                fontWeight: FontWeight.w800,
              ),
            ),
            const SizedBox(height: AppSpacing.xs),
            Text(
              'Tap the map to place pickup, or use My location.',
              style: theme.textTheme.bodySmall?.copyWith(
                color: AppColors.inkDim,
              ),
            ),
            if (supplyLine != null) ...[
              const SizedBox(height: AppSpacing.xs),
              Text(
                supplyLine,
                key: const Key('nearby-riders-status'),
                style: theme.textTheme.bodySmall?.copyWith(
                  color: AppColors.textSecondary,
                  fontWeight: FontWeight.w600,
                ),
              ),
            ],
            const SizedBox(height: AppSpacing.sm),
            Ink(
              padding: const EdgeInsets.symmetric(
                horizontal: 12,
                vertical: 12,
              ),
              decoration: BoxDecoration(
                color: AppColors.field,
                borderRadius: BorderRadius.circular(AppRadii.sm),
                border: Border.all(color: AppColors.border),
              ),
              child: Row(
                children: [
                  const Icon(Icons.trip_origin, size: 18, color: AppColors.brand),
                  const SizedBox(width: 10),
                  Expanded(
                    child: Text(
                      plan.pickupLabel ??
                          (plan.phase == TripPlanPhase.gettingLocation
                              ? 'Getting your location…'
                              : 'Pickup'),
                      key: const Key('pickup-label'),
                      maxLines: 2,
                      overflow: TextOverflow.ellipsis,
                      style: theme.textTheme.bodyMedium?.copyWith(
                        fontWeight: FontWeight.w600,
                        color: plan.hasPickup
                            ? AppColors.textPrimary
                            : AppColors.textSecondary,
                      ),
                    ),
                  ),
                ],
              ),
            ),
            const SizedBox(height: AppSpacing.sm),
            Text(
              plan.connectionFeeNote,
              key: const Key('connection-fee-note'),
              style: theme.textTheme.bodySmall?.copyWith(
                color: AppColors.inkDim,
                height: 1.35,
              ),
            ),
            if (plan.message != null) ...[
              const SizedBox(height: AppSpacing.sm),
              Text(
                plan.message!,
                key: const Key('trip-plan-message'),
                style: theme.textTheme.bodySmall?.copyWith(
                  color: plan.phase == TripPlanPhase.serviceUnavailable ||
                          plan.phase == TripPlanPhase.error
                      ? AppColors.error
                      : AppColors.textSecondary,
                  fontWeight: FontWeight.w600,
                ),
              ),
            ],
            const SizedBox(height: AppSpacing.sm),
            CyrloButton(
              key: const Key('find-a-rider'),
              label: ctaLabel,
              onPressed: plan.phase == TripPlanPhase.serviceUnavailable
                  ? null
                  : onFindRider == null
                      ? null
                      : () => onFindRider!(),
            ),
          ],
        ),
      ),
    );
  }
}

class _ActiveRideBanner extends StatelessWidget {
  const _ActiveRideBanner({
    required this.activeRequest,
    required this.pins,
    required this.availableCount,
    required this.movingRiders,
    required this.onShowAll,
    required this.onCancel,
  });

  final ActiveRideRequest activeRequest;
  final TripPinState pins;
  final int availableCount;
  final List<NearbyRider> movingRiders;
  final VoidCallback onShowAll;
  final VoidCallback onCancel;

  @override
  Widget build(BuildContext context) {
    final theme = Theme.of(context);
    return Column(
      crossAxisAlignment: CrossAxisAlignment.stretch,
      children: [
        Material(
          color: theme.colorScheme.surface.withValues(alpha: 0.96),
          borderRadius: BorderRadius.circular(AppRadii.md),
          child: Padding(
            padding: const EdgeInsets.all(AppSpacing.md),
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                Text(
                  '${activeRequest.kindLabel} coming to you',
                  style: theme.textTheme.titleMedium?.copyWith(
                    fontWeight: FontWeight.w800,
                  ),
                ),
                const SizedBox(height: AppSpacing.xs),
                Text(
                  '${activeRequest.etaLabel}. Your exact location is shared — tap to adjust pickup.',
                  style: theme.textTheme.bodyMedium?.copyWith(
                    color: AppColors.inkDim,
                    height: 1.35,
                  ),
                ),
                if (pins.locationMessage != null) ...[
                  const SizedBox(height: AppSpacing.xs),
                  Text(
                    pins.locationMessage!,
                    key: const Key('location-message'),
                    style: theme.textTheme.bodySmall,
                  ),
                ],
                if (pins.isResolvingLocation)
                  const Padding(
                    padding: EdgeInsets.only(top: AppSpacing.xs),
                    child: LinearProgressIndicator(minHeight: 2),
                  ),
                TextButton(
                  key: const Key('show-all-riders'),
                  onPressed: movingRiders.isEmpty ? null : onShowAll,
                  child: Text('$availableCount online · Show all'),
                ),
              ],
            ),
          ),
        ),
        const SizedBox(height: AppSpacing.sm),
        ActiveContactCard(
          title: '${activeRequest.kindLabel} is on the way',
          subtitle:
              'Agree destination and fare with your rider. Cyrlo’s connection fee is GH₵1 — not the transport fare. They’ll end the trip after drop-off.',
          phoneE164: activeRequest.riderPhoneE164,
          contactLabel: 'Rider number',
          onCancel: onCancel,
        ),
      ],
    );
  }
}

class _NearbyRiderMapSheet extends StatelessWidget {
  const _NearbyRiderMapSheet({
    required this.rider,
    required this.onRequest,
    required this.onClose,
  });

  final NearbyRider rider;
  final VoidCallback onRequest;
  final VoidCallback onClose;

  @override
  Widget build(BuildContext context) {
    final theme = Theme.of(context);
    return Align(
      alignment: Alignment.bottomCenter,
      child: ConstrainedBox(
        constraints: const BoxConstraints(maxWidth: 520),
        child: Material(
          color: AppColors.surface,
          borderRadius: const BorderRadius.vertical(top: Radius.circular(28)),
          clipBehavior: Clip.antiAlias,
          child: SafeArea(
            top: false,
            child: Padding(
              padding: const EdgeInsets.fromLTRB(20, 10, 20, 20),
              child: Column(
                mainAxisSize: MainAxisSize.min,
                crossAxisAlignment: CrossAxisAlignment.stretch,
                children: [
                  Center(
                    child: Container(
                      width: 42,
                      height: 4,
                      decoration: BoxDecoration(
                        color: AppColors.border,
                        borderRadius: BorderRadius.circular(AppRadii.pill),
                      ),
                    ),
                  ),
                  const SizedBox(height: 18),
                  Text(
                    rider.displayName,
                    style: theme.textTheme.titleLarge?.copyWith(
                      fontWeight: FontWeight.w800,
                      color: AppColors.textPrimary,
                    ),
                  ),
                  const SizedBox(height: 4),
                  Text(
                    '${rider.kindRiderLabel} · ${rider.etaLabel} · ${rider.ratingLabel}★',
                    style: theme.textTheme.bodyMedium?.copyWith(
                      color: AppColors.textSecondary,
                      fontWeight: FontWeight.w600,
                    ),
                  ),
                  const SizedBox(height: 8),
                  Text(
                    'Set your pickup on the map, then tap Find a Rider to book with Cyrlo.',
                    style: theme.textTheme.bodyMedium?.copyWith(
                      color: AppColors.textSecondary,
                      height: 1.35,
                    ),
                  ),
                  const SizedBox(height: AppSpacing.lg),
                  CyrloButton(
                    key: Key('map-request-${rider.id}'),
                    label: 'Find a Rider',
                    onPressed: rider.canRequest ? onRequest : null,
                  ),
                  const SizedBox(height: AppSpacing.sm),
                  CyrloButton(
                    key: const Key('map-rider-sheet-close'),
                    label: 'Close',
                    variant: CyrloButtonVariant.outlined,
                    onPressed: onClose,
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

class _PinMarker extends StatelessWidget {
  const _PinMarker({
    super.key,
    required this.color,
    required this.label,
  });

  final Color color;
  final String label;

  @override
  Widget build(BuildContext context) {
    return Container(
      width: 36,
      height: 36,
      alignment: Alignment.center,
      decoration: BoxDecoration(
        color: color,
        shape: BoxShape.circle,
        border: Border.all(color: Colors.white, width: 2),
        boxShadow: const [
          BoxShadow(
            color: Color(0x33000000),
            blurRadius: 6,
            offset: Offset(0, 2),
          ),
        ],
      ),
      child: Text(
        label,
        style: const TextStyle(
          color: Colors.white,
          fontWeight: FontWeight.w700,
        ),
      ),
    );
  }
}
