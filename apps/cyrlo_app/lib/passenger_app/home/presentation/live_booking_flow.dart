import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:go_router/go_router.dart';

import '../../../core/constants/app_colors.dart';
import '../../../core/errors/api_exception.dart';
import '../../../core/routing/app_routes.dart';
import '../../../core/theme/app_spacing.dart';
import '../../../features/auth/application/auth_session.dart';
import '../../../features/bookings/data/bookings_api.dart';
import '../../../rider_app/onboarding/data/rider_onboarding_models.dart';
import '../../../shared/models/geo_point.dart';
import '../../../shared/ride_session/active_ride_request.dart';
import '../../../shared/ride_session/active_ride_request_controller.dart';
import '../../../shared/widgets/cyrlo_button.dart';
import '../../../shared/widgets/skeleton.dart';
import '../../map/application/passenger_trip_plan.dart';
import '../../map/application/trip_pin_controller.dart';
import '../../rides/application/passenger_rides_provider.dart';

/// Creates a live pickup-only booking. Matching starts server-side in SEARCHING.
/// Connection-fee checkout is not opened at create — it is charged when a rider accepts.
Future<void> startLiveBookingFlow({
  required BuildContext context,
  required WidgetRef ref,
  required GeoPoint pickup,
  String? pickupLabel,
}) async {
  final plan = ref.read(passengerTripPlanProvider.notifier);

  if (!pickup.isValid) {
    plan.markSubmitError('Confirm a valid pickup first.');
    _toast(context, 'Confirm a valid pickup first.');
    return;
  }

  final category = await showModalBottomSheet<VehicleCategory>(
    context: context,
    backgroundColor: Colors.transparent,
    builder: (context) => const _VehicleCategorySheet(),
  );
  if (category == null || !context.mounted) {
    plan.clearSubmitLock();
    return;
  }

  final session = ref.read(authSessionProvider);
  if (session == null) {
    plan.markSubmitError('Sign in again to request a ride.');
    _toast(context, 'Sign in again to request a ride.');
    return;
  }

  // UI may already have locked submit; otherwise lock here.
  if (!ref.read(passengerTripPlanProvider).isSubmitting) {
    if (!plan.beginSubmit()) {
      _toast(context, 'Confirm a pickup first.');
      return;
    }
  }

  showDialog<void>(
    context: context,
    barrierDismissible: false,
    builder: (context) => const Center(
      child: Material(
        color: Colors.transparent,
        child: SizedBox(
          width: 280,
          height: 160,
          child: SkeletonBox(height: 160),
        ),
      ),
    ),
  );

  try {
    final booking = await ref.read(bookingsApiProvider).create(
          accessToken: session.accessToken,
          pickup: pickup,
          vehicleCategory: category.apiValue,
          pickupLabel: _labelOrNull(pickupLabel),
        );

    if (!context.mounted) return;
    Navigator.of(context).pop(); // loading

    ref.read(passengerRidesProvider.notifier).upsertBooking(booking);

    if (booking.isSearching) {
      plan.markSearchingRider();
      ref.read(activeRideRequestProvider.notifier).adoptBooking(
            booking,
            status: ActiveRideStatus.requested,
          );
      ref.read(tripPinProvider.notifier).seedPickup(
            pickup,
            message: 'Looking for a nearby rider…',
          );
      _toast(context, 'Looking for a rider…');
      context.go(AppRoutes.passengerMap);
      return;
    }

    if (booking.isAccepted || booking.isInProgress) {
      plan.markRiderAssigned(needsConnectionFee: false);
      ref.read(activeRideRequestProvider.notifier).adoptBooking(
            booking,
            status: ActiveRideStatus.ongoing,
          );
      ref.read(tripPinProvider.notifier).seedPickup(
            pickup,
            message: 'Your rider is on the way.',
          );
      _toast(context, 'Rider assigned. Open the map for pickup.');
      context.go(AppRoutes.passengerMap);
      return;
    }

    plan.clearSubmitLock();
    _toast(context, 'Booking created. Check Rides for status.');
    context.go(AppRoutes.passengerRides);
  } on ApiException catch (error) {
    if (context.mounted) {
      Navigator.of(context).pop();
      if (isServiceAreaRejection(error)) {
        const message =
            'Cyrlo Ride is not available at this pickup yet. No active service zone covers this area.';
        plan.markServiceUnavailable(message);
        _toast(context, message);
      } else if (error.statusCode == 401 || error.code == 'UNAUTHORIZED') {
        plan.markSubmitError('Sign in again to request a ride.');
        _toast(context, 'Sign in again to request a ride.');
      } else {
        plan.markSubmitError(error.message);
        _toast(context, error.message);
      }
    }
  } catch (_) {
    if (context.mounted) {
      Navigator.of(context).pop();
      plan.markSubmitError('Could not start booking. Try again.');
      _toast(context, 'Could not start booking. Try again.');
    }
  }
}

String? _labelOrNull(String? value) {
  final trimmed = value?.trim();
  if (trimmed == null || trimmed.isEmpty) return null;
  return trimmed.length > 200 ? trimmed.substring(0, 200) : trimmed;
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
              'We’re matching Pragya riders for now. Cyrlo charges GH₵1 connection fee when a rider accepts. Transport fare is agreed with your rider.',
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
