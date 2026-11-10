import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:go_router/go_router.dart';

import '../../../core/constants/app_colors.dart';
import '../../../core/errors/api_exception.dart';
import '../../../core/mapping/device_location_gateway.dart';
import '../../../core/mapping/mapping_providers.dart';
import '../../../core/routing/app_routes.dart';
import '../../../core/theme/app_spacing.dart';
import '../../../features/auth/application/auth_session.dart';
import '../../../features/bookings/data/bookings_api.dart';
import '../../../rider_app/onboarding/data/rider_onboarding_models.dart';
import '../../../shared/account/presentation/in_app_web_screen.dart';
import '../../../shared/models/geo_point.dart';
import '../../../shared/ride_session/active_ride_request.dart';
import '../../../shared/ride_session/active_ride_request_controller.dart';
import '../../../shared/widgets/cyrlo_button.dart';
import '../../map/application/trip_pin_controller.dart';
import '../../rides/application/passenger_rides_provider.dart';

/// Creates a live booking + opens Paystack for the booking fee.
///
/// Nearby rider supply is not exposed by the API yet; matching runs server-side
/// after payment moves the booking to SEARCHING.
Future<void> startLiveBookingFlow({
  required BuildContext context,
  required WidgetRef ref,
}) async {
  final category = await showModalBottomSheet<VehicleCategory>(
    context: context,
    backgroundColor: Colors.transparent,
    builder: (context) => const _VehicleCategorySheet(),
  );
  if (category == null || !context.mounted) return;

  final pickup = await _resolvePickup(context, ref);
  if (pickup == null || !context.mounted) return;

  // Pilot: destination defaults ~800m north of pickup until destination picker lands.
  final destination = GeoPoint(
    latitude: pickup.latitude + 0.007,
    longitude: pickup.longitude,
  );

  final session = ref.read(authSessionProvider);
  if (session == null) {
    _toast(context, 'Sign in again to request a ride.');
    return;
  }

  showDialog<void>(
    context: context,
    barrierDismissible: false,
    builder: (context) => const Center(child: CircularProgressIndicator()),
  );

  try {
    final booking = await ref.read(bookingsApiProvider).create(
          accessToken: session.accessToken,
          pickup: pickup,
          destination: destination,
          vehicleCategory: category.apiValue,
          pickupLabel: 'Current location',
          destinationLabel: 'Nearby destination',
        );

    var checkout = booking.payment;
    checkout ??= await ref.read(bookingsApiProvider).initializeBookingFee(
          accessToken: session.accessToken,
          bookingId: booking.id,
        );

    if (!context.mounted) return;
    Navigator.of(context).pop(); // loading

    if (checkout.authorizationUrl.isEmpty) {
      _toast(context, 'Payment link unavailable. Try again.');
      return;
    }

    await Navigator.of(context).push<void>(
      MaterialPageRoute(
        builder: (_) => InAppWebScreen(
          title: 'Pay booking fee',
          url: checkout!.authorizationUrl,
        ),
      ),
    );
    if (!context.mounted) return;

    // Poll booking status after returning from Paystack.
    final refreshed = await ref.read(bookingsApiProvider).get(
          accessToken: session.accessToken,
          bookingId: booking.id,
        );
    ref.read(passengerRidesProvider.notifier).upsertBooking(refreshed);

    if (refreshed.isSearching ||
        refreshed.isAccepted ||
        refreshed.isInProgress) {
      ref.read(activeRideRequestProvider.notifier).adoptBooking(
            refreshed,
            status: refreshed.isSearching
                ? ActiveRideStatus.requested
                : ActiveRideStatus.ongoing,
          );
      ref.read(tripPinProvider.notifier).seedPickup(
            pickup,
            message: refreshed.isSearching
                ? 'Looking for a nearby rider…'
                : 'Your rider is on the way.',
          );
      _toast(
        context,
        refreshed.isSearching
            ? 'Payment received. Searching for a rider…'
            : 'Rider assigned. Open the map for pickup.',
      );
      context.go(AppRoutes.passengerMap);
      return;
    }

    _toast(
      context,
      'If you paid, wait a moment for confirmation, then check Rides.',
    );
  } on ApiException catch (error) {
    if (context.mounted) {
      Navigator.of(context).pop();
      _toast(context, error.message);
    }
  } catch (_) {
    if (context.mounted) {
      Navigator.of(context).pop();
      _toast(context, 'Could not start booking. Try again.');
    }
  }
}

Future<GeoPoint?> _resolvePickup(BuildContext context, WidgetRef ref) async {
  final result = await ref.read(deviceLocationGatewayProvider).current();
  if (result.hasFix && result.point != null) return result.point;
  if (!context.mounted) return null;
  _toast(
    context,
    switch (result.status) {
      DeviceLocationStatus.denied => 'Allow location to set your pickup.',
      DeviceLocationStatus.serviceDisabled => 'Turn on location services.',
      _ => 'Could not read your location.',
    },
  );
  return null;
}

void _toast(BuildContext context, String message) {
  ScaffoldMessenger.of(context).showSnackBar(
    SnackBar(
      behavior: SnackBarBehavior.floating,
      backgroundColor: AppColors.darkGrey,
      content: Text(
        message,
        style: const TextStyle(color: Colors.white, fontWeight: FontWeight.w700),
      ),
    ),
  );
}

class _VehicleCategorySheet extends StatelessWidget {
  const _VehicleCategorySheet();

  @override
  Widget build(BuildContext context) {
    return SafeArea(
      child: Container(
        margin: const EdgeInsets.all(12),
        padding: const EdgeInsets.fromLTRB(20, 20, 20, 16),
        decoration: BoxDecoration(
          color: AppColors.surface,
          borderRadius: BorderRadius.circular(24),
        ),
        child: Column(
          mainAxisSize: MainAxisSize.min,
          crossAxisAlignment: CrossAxisAlignment.stretch,
          children: [
            Text(
              'Book a Pragya',
              style: Theme.of(context).textTheme.titleLarge?.copyWith(
                    fontWeight: FontWeight.w800,
                  ),
            ),
            const SizedBox(height: AppSpacing.sm),
            const Text(
              'We’re matching Pragya riders for now. Pay the fee to start the search.',
            ),
            const SizedBox(height: AppSpacing.lg),
            CyrloButton(
              key: const Key('book-pragya'),
              label: 'Continue',
              onPressed: () => Navigator.pop(context, VehicleCategory.pragya),
            ),
          ],
        ),
      ),
    );
  }
}
