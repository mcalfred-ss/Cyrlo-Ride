import 'dart:async';
import 'dart:convert';

import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:shared_preferences/shared_preferences.dart';

import '../../../features/auth/application/signup_controller.dart';
import '../../../features/auth/application/signup_draft.dart';
import '../../../shared/ride_session/active_ride_request.dart';
import '../../../shared/ride_session/active_ride_request_controller.dart';
import '../domain/passenger_notification.dart';

final passengerNotificationsProvider = NotifierProvider<
    PassengerNotificationsController, List<PassengerNotification>>(
  PassengerNotificationsController.new,
);

class PassengerNotificationsController
    extends Notifier<List<PassengerNotification>> {
  static const _storageKey = 'cyrlo.passenger.notifications.v1';
  static const _welcomeKey = 'cyrlo.passenger.notifications.welcome.v1';

  var _ready = false;
  String? _lastRideNotifiedId;

  @override
  List<PassengerNotification> build() {
    Future.microtask(_bootstrap);
    ref.listen<SignupDraft>(signupProvider, (previous, next) {
      unawaited(_maybeWelcome(next));
    });
    ref.listen<ActiveRideRequest?>(activeRideRequestProvider, (previous, next) {
      _onRideChanged(previous, next);
    });
    return const [];
  }

  Future<void> _bootstrap() async {
    await _restore();
    _ready = true;
    await _maybeWelcome(ref.read(signupProvider));
    final ride = ref.read(activeRideRequestProvider);
    if (ride != null) {
      _onRideChanged(null, ride);
    }
  }

  Future<void> _restore() async {
    final prefs = await SharedPreferences.getInstance();
    final raw = prefs.getString(_storageKey);
    if (raw == null || raw.isEmpty) return;
    try {
      final list = (jsonDecode(raw) as List<dynamic>)
          .whereType<Map>()
          .map((e) => PassengerNotification.fromJson(
                Map<String, dynamic>.from(e),
              ))
          .toList();
      // Drop old demo seeds if they somehow remain.
      state = [
        for (final item in list)
          if (!_isLegacyDemo(item.id)) item,
      ];
    } catch (_) {
      await prefs.remove(_storageKey);
    }
  }

  bool _isLegacyDemo(String id) {
    return id == 'notif-pragya-nearby' ||
        id == 'notif-ride-tip' ||
        id == 'notif-welcome';
  }

  Future<void> _persist() async {
    if (!_ready) return;
    final prefs = await SharedPreferences.getInstance();
    final encoded = jsonEncode([
      for (final item in state.take(40)) item.toJson(),
    ]);
    await prefs.setString(_storageKey, encoded);
  }

  Future<void> _maybeWelcome(SignupDraft draft) async {
    if (draft.role != RideRole.passenger) return;
    if (!draft.otpVerified) return;
    if (!draft.hasPassengerProfile && !draft.accountReady) return;

    final prefs = await SharedPreferences.getInstance();
    if (prefs.getBool(_welcomeKey) == true) return;
    if (state.any((n) => n.id.startsWith('notif-welcome-'))) {
      await prefs.setBool(_welcomeKey, true);
      return;
    }

    final name = draft.passengerFirstName?.trim();
    final greeting = (name == null || name.isEmpty) ? 'You’re in' : 'Hi $name';
    prepend(
      PassengerNotification(
        id: 'notif-welcome-${DateTime.now().millisecondsSinceEpoch}',
        kind: PassengerNotificationKind.promo,
        title: '$greeting — welcome to Cyrlo',
        body:
            'Your passenger account is ready. When riders are online near you, they’ll show on Home and Map (red Okada, yellow Pragya, blue Aboboyaa).',
        createdAt: DateTime.now(),
        action: PassengerNotificationAction.home,
      ),
    );
    await prefs.setBool(_welcomeKey, true);
  }

  void _onRideChanged(ActiveRideRequest? previous, ActiveRideRequest? next) {
    if (next == null) {
      _lastRideNotifiedId = null;
      return;
    }
    if (_lastRideNotifiedId == next.id) return;
    _lastRideNotifiedId = next.id;

    final eta = next.etaLabel;
    prepend(
      PassengerNotification(
        id: 'notif-ride-${next.id}',
        kind: PassengerNotificationKind.rideUpdate,
        title: '${next.kindLabel} connected',
        body:
            '${next.riderLabel} · $eta. Your pickup pin is shared — open Map if you need to adjust it.',
        createdAt: DateTime.now(),
        action: PassengerNotificationAction.map,
        vehicleKind: next.kind,
      ),
    );
  }

  int get unreadCount => state.where((item) => !item.read).length;

  void prepend(PassengerNotification notification) {
    // Avoid exact duplicate ids.
    if (state.any((item) => item.id == notification.id)) return;
    state = [notification, ...state];
    unawaited(_persist());
  }

  void markAllRead() {
    state = [
      for (final item in state) item.copyWith(read: true),
    ];
    unawaited(_persist());
  }

  void markRead(String id) {
    state = [
      for (final item in state)
        if (item.id == id) item.copyWith(read: true) else item,
    ];
    unawaited(_persist());
  }

  Future<void> clearAll() async {
    state = const [];
    final prefs = await SharedPreferences.getInstance();
    await prefs.remove(_storageKey);
  }
}

final unreadNotificationCountProvider = Provider<int>((ref) {
  return ref
      .watch(passengerNotificationsProvider)
      .where((item) => !item.read)
      .length;
});
