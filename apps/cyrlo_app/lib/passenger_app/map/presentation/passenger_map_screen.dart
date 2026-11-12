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
import '../../../shared/ride_session/active_ride_request_controller.dart';
import '../../../shared/ride_session/passenger_cancel_notice.dart';
import '../../../shared/ride_session/passenger_cancel_ride.dart';
import '../../../shared/widgets/active_contact_card.dart';
import '../../../shared/widgets/cyrlo_button.dart';
import '../../home/application/nearby_riders_provider.dart';
import '../../home/application/pragya_supply_provider.dart';
import '../../home/domain/nearby_rider.dart';
import '../../home/presentation/live_booking_flow.dart';
import '../../home/presentation/request_ride_flow.dart';
import '../../rides/presentation/rate_rider_sheet.dart';
import '../application/nearby_riders_map_motion.dart';
import '../application/trip_pin_controller.dart';
import '../application/trip_pin_state.dart';
import 'bolt_rider_map_marker.dart';
import 'top_down_vehicle_painter.dart';

/// Passenger map: nearby riders on the map + pickup pin for the rider.
/// Works with Carto fallback now; swap in Mapbox token when ready.
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
          startRequestRideFlow(context: context, ref: ref, rider: rider);
        },
        onClose: () => Navigator.of(context).pop(),
      ),
    );
  }

  @override
  Widget build(BuildContext context) {
    final pins = ref.watch(tripPinProvider);
    final nearbyState = ref.watch(nearbyRidersProvider);
    final nearbyRiders = nearbyState.items;
    final mapPoses = ref.watch(nearbyRidersMapMotionProvider);
    final movingRiders = ridersWithMapPoses(nearbyRiders, mapPoses);
    final selectedRider = ref.watch(selectedNearbyRiderProvider);
    final supply = ref.watch(pragyaSupplyProvider);
    final activeRequest = ref.watch(activeRideRequestProvider);
    final project = ref.watch(passengerMapProjectProvider);
    final token = ref.watch(mapAccessTokenProvider).value ?? '';
    final theme = Theme.of(context);
    final isDark = theme.brightness == Brightness.dark;
    final shareContact = activeRequest?.sharesContact == true;
    final sharedPickup = pins.pickup ?? activeRequest?.pickupPoint;
    final availableCount =
        nearbyRiders.where((rider) => rider.canRequest).length;
    final nearbyStatus = nearbyState.isLoading
        ? 'Checking nearby riders…'
        : nearbyState.errorMessage ??
            nearbyState.message ??
            '$availableCount nearby on the map';

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

    if (sharedPickup != null) {
      _focusPickup(sharedPickup);
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
            ),
            onTap: (point) {
              unawaited(
                ref
                    .read(tripPinProvider.notifier)
                    .placeAt(GeoPoint.fromMapCoordinate(point)),
              );
            },
          ),
          SafeArea(
            child: Padding(
              padding: const EdgeInsets.all(AppSpacing.md),
              child: Column(
                crossAxisAlignment: CrossAxisAlignment.stretch,
                children: [
                  DecoratedBox(
                    decoration: BoxDecoration(
                      color: AppColors.surface.withValues(alpha: 0.96),
                      borderRadius: BorderRadius.circular(20),
                      boxShadow: [
                        BoxShadow(
                          color: AppColors.elevationShadow(
                            lightAlpha: 0.08,
                            darkAlpha: 0.35,
                          ),
                          blurRadius: 20,
                          offset: const Offset(0, 8),
                        ),
                      ],
                    ),
                    child: Padding(
                      padding: const EdgeInsets.fromLTRB(16, 14, 12, 14),
                      child: Column(
                        crossAxisAlignment: CrossAxisAlignment.start,
                        children: [
                          Row(
                            crossAxisAlignment: CrossAxisAlignment.start,
                            children: [
                              Expanded(
                                child: Text(
                                  shareContact
                                      ? '${activeRequest!.kindLabel} coming to you'
                                      : 'Nearby riders on the map',
                                  style: theme.textTheme.titleMedium?.copyWith(
                                    fontWeight: FontWeight.w800,
                                    height: 1.2,
                                  ),
                                ),
                              ),
                              TextButton(
                                key: const Key('show-all-riders'),
                                style: TextButton.styleFrom(
                                  foregroundColor: AppColors.textPrimary,
                                  disabledForegroundColor:
                                      AppColors.textSecondary.withValues(
                                    alpha: 0.45,
                                  ),
                                  padding: const EdgeInsets.symmetric(
                                    horizontal: 8,
                                    vertical: 4,
                                  ),
                                  minimumSize: Size.zero,
                                  tapTargetSize:
                                      MaterialTapTargetSize.shrinkWrap,
                                  visualDensity: VisualDensity.compact,
                                ),
                                onPressed: movingRiders.isEmpty
                                    ? null
                                    : () {
                                        _fittedRiders = false;
                                        _fitNearbyRiders(movingRiders);
                                      },
                                child: const Text(
                                  'Show all',
                                  style: TextStyle(fontWeight: FontWeight.w700),
                                ),
                              ),
                            ],
                          ),
                          const SizedBox(height: 6),
                          Text(
                            shareContact
                                ? '${activeRequest!.etaLabel}. Your exact location is shared — tap to adjust pickup.'
                                : nearbyStatus,
                            key: const Key('nearby-riders-status'),
                            style: theme.textTheme.bodyMedium?.copyWith(
                              color: AppColors.textSecondary,
                              height: 1.35,
                              fontWeight: FontWeight.w500,
                            ),
                          ),
                          if (!shareContact) ...[
                            const SizedBox(height: 10),
                            const _MapKindLegend(),
                          ],
                          const SizedBox(height: 12),
                          Row(
                            children: [
                              Expanded(
                                child: _MapStatusPill(
                                  key: const Key('rider-count-chip'),
                                  icon: Icons.two_wheeler_rounded,
                                  label: '$availableCount online',
                                  filled: true,
                                ),
                              ),
                              const SizedBox(width: 8),
                              Expanded(
                                child: _MapStatusPill(
                                  key: const Key('focus-pickup'),
                                  icon: pins.pickup == null
                                      ? Icons.place_outlined
                                      : Icons.check_circle_rounded,
                                  label: pins.pickup == null
                                      ? 'Pickup needed'
                                      : 'Pickup set',
                                  filled: pins.pickup != null,
                                ),
                              ),
                            ],
                          ),
                          if (pins.locationMessage != null) ...[
                            const SizedBox(height: 8),
                            Text(
                              pins.locationMessage!,
                              key: const Key('location-message'),
                              style: theme.textTheme.bodySmall?.copyWith(
                                color: AppColors.textSecondary,
                              ),
                            ),
                          ],
                          if (pins.isResolvingLocation)
                            const Padding(
                              padding: EdgeInsets.only(top: 8),
                              child: LinearProgressIndicator(minHeight: 2),
                            ),
                        ],
                      ),
                    ),
                  ),
                  if (shareContact) ...[
                    const SizedBox(height: AppSpacing.sm),
                    ActiveContactCard(
                      title: '${activeRequest!.kindLabel} is on the way',
                      subtitle:
                          'Call the rider if they need help finding you. Tell them your destination when they arrive. They’ll end the trip after drop-off.',
                      phoneE164: activeRequest.riderPhoneE164,
                      contactLabel: 'Rider number',
                      onCancel: () =>
                          cancelActiveRideWithFeedback(context, ref),
                    ),
                  ],
                  const Spacer(),
                  if (!shareContact &&
                      !supply.isLoading &&
                      supply.available &&
                      pins.pickup != null &&
                      pins.pickup!.isValid) ...[
                    CyrloButton(
                      key: const Key('map-book-live-ride'),
                      label: 'Book a Pragya',
                      onPressed: () => startLiveBookingFlow(
                        context: context,
                        ref: ref,
                        pickup: pins.pickup!,
                      ),
                    ),
                    const SizedBox(height: AppSpacing.sm),
                  ],
                  Align(
                    alignment: Alignment.bottomRight,
                    child: FloatingActionButton.extended(
                      key: const Key('use-current-location'),
                      onPressed: pins.isResolvingLocation
                          ? null
                          : () async {
                              await ref
                                  .read(tripPinProvider.notifier)
                                  .useCurrentLocationAsPickup();
                              final pickup = ref.read(tripPinProvider).pickup;
                              if (pickup != null) {
                                _mapController.move(
                                  pickup.toMapCoordinate(),
                                  15,
                                );
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
    String? selectedId,
  }) {
    return [
      for (final rider in riders)
        MapMarker(
          id: 'rider-${rider.id}',
          point: rider.point.toMapCoordinate(),
          // Compact hit target — okada sprite is taller (bike + rider).
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
      if (pins.pickup != null)
        MapMarker(
          id: 'pickup',
          point: pins.pickup!.toMapCoordinate(),
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
                    rider.statusLabel,
                    style: theme.textTheme.bodyMedium?.copyWith(
                      color: AppColors.textSecondary,
                      height: 1.35,
                    ),
                  ),
                  const SizedBox(height: AppSpacing.lg),
                  CyrloButton(
                    key: Key('map-request-${rider.id}'),
                    label: rider.canRequest ? 'Request ${rider.kindLabel}' : 'Unavailable',
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

class _MapKindLegend extends StatelessWidget {
  const _MapKindLegend();

  @override
  Widget build(BuildContext context) {
    return const Wrap(
      spacing: 12,
      runSpacing: 6,
      children: [
        _MapKindDot(color: MapVehicleColors.okada, label: 'Okada'),
        _MapKindDot(color: MapVehicleColors.pragya, label: 'Pragya'),
        _MapKindDot(color: MapVehicleColors.aboboyaa, label: 'Aboboyaa'),
      ],
    );
  }
}

class _MapKindDot extends StatelessWidget {
  const _MapKindDot({required this.color, required this.label});

  final Color color;
  final String label;

  @override
  Widget build(BuildContext context) {
    final theme = Theme.of(context);
    return Row(
      mainAxisSize: MainAxisSize.min,
      children: [
        Container(
          width: 8,
          height: 8,
          decoration: BoxDecoration(color: color, shape: BoxShape.circle),
        ),
        const SizedBox(width: 6),
        Text(
          label,
          style: theme.textTheme.labelMedium?.copyWith(
            color: AppColors.textSecondary,
            fontWeight: FontWeight.w600,
          ),
        ),
      ],
    );
  }
}

class _MapStatusPill extends StatelessWidget {
  const _MapStatusPill({
    super.key,
    required this.icon,
    required this.label,
    required this.filled,
  });

  final IconData icon;
  final String label;
  final bool filled;

  @override
  Widget build(BuildContext context) {
    final fg = filled ? AppColors.onBrandLight : AppColors.textPrimary;
    return Container(
      padding: const EdgeInsets.symmetric(horizontal: 12, vertical: 10),
      decoration: BoxDecoration(
        color: filled ? AppColors.brandLight : AppColors.field,
        borderRadius: BorderRadius.circular(14),
      ),
      child: Row(
        mainAxisAlignment: MainAxisAlignment.center,
        children: [
          Icon(icon, size: 18, color: fg),
          const SizedBox(width: 8),
          Flexible(
            child: Text(
              label,
              maxLines: 1,
              overflow: TextOverflow.ellipsis,
              style: TextStyle(
                color: fg,
                fontWeight: FontWeight.w700,
                fontSize: 13,
              ),
            ),
          ),
        ],
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
