import 'package:flutter_riverpod/flutter_riverpod.dart';

import '../../core/constants/realtime_events.dart';
import '../../features/auth/application/auth_session.dart';
import '../../features/auth/application/signup_draft.dart';
import '../../features/auth/application/signup_controller.dart';
import '../../passenger_app/map/application/passenger_booking_recovery.dart';
import '../../rider_app/availability/application/rider_availability_provider.dart';
import '../ride_session/active_ride_request_controller.dart';
import 'core_providers.dart';

/// Connects Socket.IO when a session exists; disconnects on logout.
/// Rider offer polling remains the durable fallback.
final realtimeSessionProvider = Provider<void>((ref) {
  final session = ref.watch(authSessionProvider);
  final client = ref.watch(realtimeClientProvider);

  void onOfferCreated(dynamic _) {
    final draft = ref.read(signupProvider);
    if (draft.role != RideRole.rider) return;
    if (!ref.read(riderOnlineProvider)) return;
    ref.read(riderJobOffersProvider.notifier).refresh();
  }

  void onBookingAccepted(dynamic data) {
    final draft = ref.read(signupProvider);
    if (draft.role == RideRole.passenger) {
      ref.read(passengerBookingRecoveryProvider.notifier).refreshFromEvent(data);
    } else if (draft.role == RideRole.rider) {
      ref.read(riderJobOffersProvider.notifier).refresh();
    }
  }

  if (session == null) {
    client.disconnect();
    return;
  }

  client.connect(accessToken: session.accessToken);
  client.on(RealtimeEvents.matchingOfferCreated, onOfferCreated);
  client.on(RealtimeEvents.bookingAccepted, onBookingAccepted);

  ref.onDispose(() {
    client.off(RealtimeEvents.matchingOfferCreated, onOfferCreated);
    client.off(RealtimeEvents.bookingAccepted, onBookingAccepted);
  });
});
