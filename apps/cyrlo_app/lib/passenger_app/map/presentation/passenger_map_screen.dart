import 'dart:async';

import 'package:cyrlo_maps/cyrlo_maps.dart';
import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';

import '../../../core/constants/app_colors.dart';
import '../../../core/mapping/mapping_providers.dart';
import '../../../core/theme/app_radii.dart';
import '../../../core/theme/app_spacing.dart';
import '../../../shared/models/geo_point.dart';
import '../application/trip_pin_controller.dart';
import '../application/trip_pin_state.dart';

/// Passenger map: pick pickup and destination. Booking and payment stay elsewhere.
class PassengerMapScreen extends ConsumerStatefulWidget {
  const PassengerMapScreen({super.key});

  @override
  ConsumerState<PassengerMapScreen> createState() => _PassengerMapScreenState();
}

class _PassengerMapScreenState extends ConsumerState<PassengerMapScreen> {
  final CyrloMapController _mapController = CyrloMapController();

  @override
  void dispose() {
    _mapController.dispose();
    super.dispose();
  }

  @override
  Widget build(BuildContext context) {
    final pins = ref.watch(tripPinProvider);
    final project = ref.watch(passengerMapProjectProvider);
    final token = ref.watch(mapAccessTokenProvider);
    final theme = Theme.of(context);

    return Scaffold(
      body: Stack(
        fit: StackFit.expand,
        children: [
          CyrloMapView(
            project: project,
            accessToken: token,
            isDark: false,
            controller: _mapController,
            markers: _markers(pins),
            polylines: _polylines(pins),
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
                            'Set your trip',
                            style: theme.textTheme.titleMedium,
                          ),
                          const SizedBox(height: AppSpacing.xs),
                          Text(
                            pins.focus == TripPinFocus.pickup
                                ? 'Tap the map to set pickup.'
                                : 'Tap the map to set destination.',
                            style: theme.textTheme.bodyMedium?.copyWith(
                              color: AppColors.inkDim,
                            ),
                          ),
                          const SizedBox(height: AppSpacing.sm),
                          Wrap(
                            spacing: AppSpacing.xs,
                            runSpacing: AppSpacing.xs,
                            children: [
                              ChoiceChip(
                                key: const Key('focus-pickup'),
                                label: Text(
                                  pins.pickup == null
                                      ? 'Pickup'
                                      : 'Pickup set',
                                ),
                                selected: pins.focus == TripPinFocus.pickup,
                                onSelected: (_) {
                                  ref
                                      .read(tripPinProvider.notifier)
                                      .setFocus(TripPinFocus.pickup);
                                },
                              ),
                              ChoiceChip(
                                key: const Key('focus-destination'),
                                label: Text(
                                  pins.destination == null
                                      ? 'Destination'
                                      : 'Destination set',
                                ),
                                selected:
                                    pins.focus == TripPinFocus.destination,
                                onSelected: (_) {
                                  ref
                                      .read(tripPinProvider.notifier)
                                      .setFocus(TripPinFocus.destination);
                                },
                              ),
                              TextButton(
                                key: const Key('clear-pins'),
                                onPressed: pins.pickup == null &&
                                        pins.destination == null
                                    ? null
                                    : () {
                                        ref
                                            .read(tripPinProvider.notifier)
                                            .clearPins();
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
                          if (pins.routeError != null) ...[
                            const SizedBox(height: AppSpacing.xs),
                            Text(
                              pins.routeError!,
                              key: const Key('route-error'),
                              style: theme.textTheme.bodySmall?.copyWith(
                                color: AppColors.tomato,
                              ),
                            ),
                          ],
                          if (pins.isResolvingRoute ||
                              pins.isResolvingLocation)
                            const Padding(
                              padding: EdgeInsets.only(top: AppSpacing.xs),
                              child: LinearProgressIndicator(minHeight: 2),
                            ),
                        ],
                      ),
                    ),
                  ),
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

  List<MapMarker> _markers(TripPinState pins) {
    return [
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
      if (pins.destination != null)
        MapMarker(
          id: 'destination',
          point: pins.destination!.toMapCoordinate(),
          child: const _PinMarker(
            key: Key('destination-marker'),
            color: AppColors.darkGrey,
            label: 'D',
          ),
        ),
    ];
  }

  List<MapPolyline> _polylines(TripPinState pins) {
    if (pins.routePoints.length < 2) return const [];
    return [
      MapPolyline(
        id: 'preview',
        points: [
          for (final point in pins.routePoints) point.toMapCoordinate(),
        ],
        color: AppColors.darkGrey,
        strokeWidth: 4,
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
