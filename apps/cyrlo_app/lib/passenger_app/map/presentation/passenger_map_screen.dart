import 'dart:async';

import 'package:cyrlo_maps/cyrlo_maps.dart';
import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';

import '../../../core/constants/app_colors.dart';
import '../../../core/mapping/mapping_providers.dart';
import '../../../core/theme/app_radii.dart';
import '../../../core/theme/app_spacing.dart';
import '../../../shared/models/geo_point.dart';
import '../../../shared/ride_session/active_ride_request_controller.dart';
import '../../../shared/widgets/active_contact_card.dart';
import '../../home/application/nearby_riders_provider.dart';
import '../../home/domain/nearby_rider.dart';
import '../application/trip_pin_controller.dart';
import '../application/trip_pin_state.dart';

/// Passenger map: set pickup so the rider can come to you.
/// Destination is agreed in person — the app does not take trip fare.
class PassengerMapScreen extends ConsumerStatefulWidget {
  const PassengerMapScreen({super.key});

  @override
  ConsumerState<PassengerMapScreen> createState() => _PassengerMapScreenState();
}

class _PassengerMapScreenState extends ConsumerState<PassengerMapScreen> {
  final CyrloMapController _mapController = CyrloMapController();
  String? _focusedRiderId;

  @override
  void dispose() {
    _mapController.dispose();
    super.dispose();
  }

  void _focusNearbyRider(NearbyRider? rider) {
    if (rider == null || rider.id == _focusedRiderId) return;
    _focusedRiderId = rider.id;
    WidgetsBinding.instance.addPostFrameCallback((_) {
      if (!mounted) return;
      _mapController.move(rider.point.toMapCoordinate(), 15);
    });
  }

  @override
  Widget build(BuildContext context) {
    final pins = ref.watch(tripPinProvider);
    final nearbyRider = ref.watch(selectedNearbyRiderProvider);
    final activeRequest = ref.watch(activeRideRequestProvider);
    final project = ref.watch(passengerMapProjectProvider);
    final token = ref.watch(mapAccessTokenProvider);
    final theme = Theme.of(context);
    final shareContact = activeRequest?.sharesContact == true;

    ref.listen(selectedNearbyRiderProvider, (previous, next) {
      _focusNearbyRider(next);
    });
    if (nearbyRider != null && nearbyRider.id != _focusedRiderId) {
      _focusNearbyRider(nearbyRider);
    }

    return Scaffold(
      body: Stack(
        fit: StackFit.expand,
        children: [
          CyrloMapView(
            project: project,
            accessToken: token,
            isDark: false,
            controller: _mapController,
            markers: _markers(pins, nearbyRider),
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
                  Material(
                    color: theme.colorScheme.surface.withValues(alpha: 0.96),
                    borderRadius: BorderRadius.circular(AppRadii.md),
                    child: Padding(
                      padding: const EdgeInsets.all(AppSpacing.md),
                      child: Column(
                        crossAxisAlignment: CrossAxisAlignment.start,
                        children: [
                          Text(
                            nearbyRider == null
                                ? 'Set your pickup'
                                : '${nearbyRider.kindLabel} coming to you',
                            style: theme.textTheme.titleMedium?.copyWith(
                              fontWeight: FontWeight.w800,
                            ),
                          ),
                          const SizedBox(height: AppSpacing.xs),
                          Text(
                            nearbyRider != null
                                ? '${nearbyRider.etaLabel}. Mark where the rider should meet you — tell them your destination when they arrive.'
                                : 'Mark where the rider should meet you. Destination stays between you and the rider.',
                            style: theme.textTheme.bodyMedium?.copyWith(
                              color: AppColors.inkDim,
                              height: 1.35,
                            ),
                          ),
                          const SizedBox(height: AppSpacing.sm),
                          Wrap(
                            spacing: AppSpacing.xs,
                            runSpacing: AppSpacing.xs,
                            children: [
                              Chip(
                                key: const Key('focus-pickup'),
                                avatar: Icon(
                                  pins.pickup == null
                                      ? Icons.place_outlined
                                      : Icons.check_circle_rounded,
                                  size: 18,
                                  color: pins.pickup == null
                                      ? AppColors.textPrimary
                                      : AppColors.onBrandLight,
                                ),
                                label: Text(
                                  pins.pickup == null
                                      ? 'Pickup needed'
                                      : 'Pickup set',
                                  style: TextStyle(
                                    color: pins.pickup == null
                                        ? AppColors.textPrimary
                                        : AppColors.onBrandLight,
                                    fontWeight: FontWeight.w700,
                                  ),
                                ),
                                backgroundColor: pins.pickup == null
                                    ? AppColors.field
                                    : AppColors.brandLight,
                              ),
                              TextButton(
                                key: const Key('clear-pins'),
                                onPressed: pins.pickup == null
                                    ? null
                                    : () {
                                        ref
                                            .read(tripPinProvider.notifier)
                                            .clearPickup();
                                      },
                                child: const Text('Clear'),
                              ),
                            ],
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
                        ],
                      ),
                    ),
                  ),
                  if (shareContact) ...[
                    const SizedBox(height: AppSpacing.sm),
                    ActiveContactCard(
                      title: '${activeRequest!.kindLabel} is on the way',
                      subtitle:
                          'Call the rider if they need help finding you. Tell them your destination when they arrive.',
                      phoneE164: activeRequest.riderPhoneE164,
                      contactLabel: 'Rider number',
                      onCancel: () {
                        ref.read(activeRideRequestProvider.notifier).markCancelled();
                        ref.read(selectedNearbyRiderProvider.notifier).clear();
                      },
                      onComplete: () {
                        ref.read(activeRideRequestProvider.notifier).markCompleted();
                        ref.read(selectedNearbyRiderProvider.notifier).clear();
                      },
                    ),
                  ],
                  const Spacer(),
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

  List<MapMarker> _markers(TripPinState pins, NearbyRider? nearbyRider) {
    return [
      if (nearbyRider != null)
        MapMarker(
          id: 'nearby-rider',
          point: nearbyRider.point.toMapCoordinate(),
          child: _PinMarker(
            key: const Key('nearby-rider-marker'),
            color: AppColors.darkGrey,
            label: nearbyRider.kindLabel.substring(0, 1),
          ),
        ),
      if (pins.pickup != null)
        MapMarker(
          id: 'pickup',
          point: pins.pickup!.toMapCoordinate(),
          child: const _PinMarker(
            key: Key('pickup-marker'),
            color: AppColors.brand,
            label: 'P',
          ),
        ),
    ];
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
