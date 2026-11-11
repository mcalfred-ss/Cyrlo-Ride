import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';

import '../../core/constants/app_colors.dart';
import '../../core/errors/api_exception.dart';
import '../../features/auth/application/auth_session.dart';
import '../../features/bookings/data/bookings_api.dart';
import '../../passenger_app/home/application/nearby_riders_provider.dart';
import '../../passenger_app/map/application/trip_pin_controller.dart';
import '../../passenger_app/rides/application/passenger_rides_provider.dart';
import 'active_ride_request_controller.dart';

class PassengerCancelResult {
  const PassengerCancelResult.cancelled() : this._(cancelled: true);

  const PassengerCancelResult.failed(String message)
      : this._(cancelled: false, errorMessage: message);

  const PassengerCancelResult._({required this.cancelled, this.errorMessage});

  final bool cancelled;
  final String? errorMessage;
}

/// Cancel button handler: runs [cancelActiveRideByPassenger] and tells the
/// passenger when the server refused.
Future<void> cancelActiveRideWithFeedback(
  BuildContext context,
  WidgetRef ref,
) async {
  final messenger = ScaffoldMessenger.of(context);
  final result = await cancelActiveRideByPassenger(ref);
  if (result.cancelled) return;
  messenger.showSnackBar(
    SnackBar(
      behavior: SnackBarBehavior.floating,
      backgroundColor: AppColors.darkGrey,
      content: Text(
        result.errorMessage ?? 'Could not cancel right now.',
        style: const TextStyle(color: Colors.white, fontWeight: FontWeight.w700),
      ),
    ),
  );
}

/// Cancels the passenger's live request.
///
/// Bookings created through the API are cancelled server-side first
/// (`/cancel` while searching, `/cancel-after-accept` once a rider accepted) so
/// fees and rider availability are settled. The local session only clears after
/// the server agrees. Direct-contact requests have no booking and clear locally.
Future<PassengerCancelResult> cancelActiveRideByPassenger(
  WidgetRef ref,
) async {
  final job = ref.read(activeRideRequestProvider);
  if (job == null) return const PassengerCancelResult.cancelled();

  final bookingId = job.bookingId;
  final session = ref.read(authSessionProvider);
  if (bookingId != null && session != null) {
    try {
      final api = ref.read(bookingsApiProvider);
      final booking = job.isAccepted
          ? await api.cancelAfterAccept(
              accessToken: session.accessToken,
              bookingId: bookingId,
              reason: 'Passenger cancelled after rider accepted',
            )
          : await api.cancel(
              accessToken: session.accessToken,
              bookingId: bookingId,
              reason: 'Passenger cancelled while searching',
            );
      ref.read(passengerRidesProvider.notifier).upsertBooking(booking);
    } on ApiException catch (error) {
      return PassengerCancelResult.failed(error.message);
    } catch (_) {
      return const PassengerCancelResult.failed(
        'Could not cancel right now. Check your connection and try again.',
      );
    }
  }

  ref.read(activeRideRequestProvider.notifier).markCancelled();
  ref.read(selectedNearbyRiderProvider.notifier).clear();
  ref.read(tripPinProvider.notifier).forceClear();
  return const PassengerCancelResult.cancelled();
}
