import 'package:flutter_riverpod/flutter_riverpod.dart';

import '../domain/passenger_notification.dart';

final passengerNotificationsProvider = NotifierProvider<
    PassengerNotificationsController, List<PassengerNotification>>(
  PassengerNotificationsController.new,
);

class PassengerNotificationsController
    extends Notifier<List<PassengerNotification>> {
  @override
  List<PassengerNotification> build() {
    final now = DateTime.now();
    return [
      PassengerNotification(
        id: 'notif-pragya-nearby',
        kind: PassengerNotificationKind.riderNearby,
        title: 'Pragya is 2 mins away',
        body: 'A Pragya rider is close to your area. Open Home to request a ride.',
        createdAt: now.subtract(const Duration(minutes: 1)),
      ),
      PassengerNotification(
        id: 'notif-ride-tip',
        kind: PassengerNotificationKind.rideUpdate,
        title: 'Set pickup on the map',
        body: 'After you request, mark where the rider should meet you. Destination stays off the app.',
        createdAt: now.subtract(const Duration(hours: 2)),
        read: true,
      ),
      PassengerNotification(
        id: 'notif-welcome',
        kind: PassengerNotificationKind.promo,
        title: 'Welcome to Cyrlo Ride',
        body: 'You’re set. Nearby Okada and Pragya riders will show up here.',
        createdAt: now.subtract(const Duration(days: 1)),
        read: true,
      ),
    ];
  }

  int get unreadCount => state.where((item) => !item.read).length;

  void markAllRead() {
    state = [
      for (final item in state) item.copyWith(read: true),
    ];
  }

  void markRead(String id) {
    state = [
      for (final item in state)
        if (item.id == id) item.copyWith(read: true) else item,
    ];
  }
}

final unreadNotificationCountProvider = Provider<int>((ref) {
  return ref.watch(passengerNotificationsProvider).where((item) => !item.read).length;
});
