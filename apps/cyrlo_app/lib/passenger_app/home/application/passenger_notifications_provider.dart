import 'dart:async';
import 'dart:convert';

import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:shared_preferences/shared_preferences.dart';

import '../../../features/auth/application/auth_session.dart';
import '../../../features/auth/application/signup_controller.dart';
import '../../../features/auth/application/signup_draft.dart';
import '../../../shared/models/loadable_list.dart';
import '../../../shared/ride_session/active_ride_request.dart';
import '../../../shared/push/notifications_api.dart';
import '../../../shared/ride_session/active_ride_request_controller.dart';
import '../domain/passenger_notification.dart';

final passengerNotificationsProvider = NotifierProvider<
    PassengerNotificationsController, LoadableList<PassengerNotification>>(
  PassengerNotificationsController.new,
);

class PassengerNotificationsController
    extends Notifier<LoadableList<PassengerNotification>> {
  static const _storageKey = 'cyrlo.passenger.notifications.v1';
  static const _welcomeKey = 'cyrlo.passenger.notifications.welcome.v1';

  var _ready = false;
  String? _lastRideNotifiedId;

  @override
  LoadableList<PassengerNotification> build() {
    Future.microtask(_bootstrap);
    ref.listen<SignupDraft>(signupProvider, (previous, next) {
      unawaited(_maybeWelcome(next));
    });
    ref.listen<ActiveRideRequest?>(activeRideRequestProvider, (previous, next) {
      _onRideChanged(previous, next);
    });
    ref.listen<AuthSession?>(authSessionProvider, (previous, next) {
      if (next == null) {
        if (previous != null) unawaited(clearAll());
        return;
      }
      if (previous?.user.id != next.user.id) unawaited(refresh());
    });
    return const LoadableList(isLoading: true);
  }

  Future<void> _bootstrap() async {
    await _restore();
    _ready = true;
    state = state.copyWith(isLoading: false);
    await _maybeWelcome(ref.read(signupProvider));
    final ride = ref.read(activeRideRequestProvider);
    if (ride != null) {
      _onRideChanged(null, ride);
    }
    await refresh();
  }

  /// Pulls the server inbox (`GET /notifications`) and merges it with the
  /// on-device notices. Server rows are authoritative for read state.
  Future<void> refresh() async {
    final session = ref.read(authSessionProvider);
    if (session == null || !_ready) return;
    try {
      final inbox = await ref.read(notificationsApiProvider).listInbox(
            accessToken: session.accessToken,
          );
      if (!ref.mounted) return;
      final server = [for (final row in inbox) _fromInbox(row)];
      final serverIds = {for (final item in server) item.id};
      final merged = [
        ...server,
        for (final item in state.items)
          if (_isLocalId(item.id) && !serverIds.contains(item.id)) item,
      ]..sort((a, b) => b.createdAt.compareTo(a.createdAt));
      state = LoadableList(items: merged.take(60).toList(), isLoading: false);
      unawaited(_persist());
    } catch (_) {
      // Keep on-device notices when the inbox is unreachable.
    }
  }

  static bool _isLocalId(String id) => id.startsWith('notif-');

  static PassengerNotification _fromInbox(InboxNotification row) {
    final category = row.category?.toUpperCase();
    final isTrip = row.entityType == 'booking' ||
        category == 'TRIP' ||
        category == 'BOOKING' ||
        category == 'MATCHING';
    return PassengerNotification(
      id: row.id,
      kind: isTrip
          ? PassengerNotificationKind.rideUpdate
          : PassengerNotificationKind.promo,
      title: row.title,
      body: row.body,
      createdAt: row.createdAt,
      read: row.isRead,
      action: row.entityType == 'booking'
          ? PassengerNotificationAction.map
          : PassengerNotificationAction.home,
    );
  }

  Future<void> _syncRead({String? id}) async {
    final session = ref.read(authSessionProvider);
    if (session == null) return;
    try {
      final api = ref.read(notificationsApiProvider);
      if (id == null) {
        await api.markAllRead(session.accessToken);
      } else {
        await api.markRead(
          accessToken: session.accessToken,
          notificationId: id,
        );
      }
    } catch (_) {
      // Next refresh reconciles read state with the server.
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
      state = LoadableList(
        items: [
          for (final item in list)
            if (!_isLegacyDemo(item.id)) item,
        ],
        isLoading: true,
      );
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
      for (final item in state.items.take(40)) item.toJson(),
    ]);
    await prefs.setString(_storageKey, encoded);
  }

  Future<void> _maybeWelcome(SignupDraft draft) async {
    if (draft.role != RideRole.passenger) return;
    if (!draft.otpVerified) return;
    if (!draft.hasPassengerProfile && !draft.accountReady) return;

    final prefs = await SharedPreferences.getInstance();
    if (prefs.getBool(_welcomeKey) == true) return;
    if (state.items.any((n) => n.id.startsWith('notif-welcome-'))) {
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
            'Your passenger account is ready. When riders are online near you, they’ll show on Home and Map.',
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

  void prepend(PassengerNotification notification) {
    if (state.items.any((item) => item.id == notification.id)) return;
    state = LoadableList(
      items: [notification, ...state.items],
      isLoading: false,
    );
    unawaited(_persist());
  }

  void markAllRead() {
    state = LoadableList(
      items: [
        for (final item in state.items) item.copyWith(read: true),
      ],
      isLoading: false,
    );
    unawaited(_persist());
    unawaited(_syncRead());
  }

  void markRead(String id) {
    state = LoadableList(
      items: [
        for (final item in state.items)
          if (item.id == id) item.copyWith(read: true) else item,
      ],
      isLoading: false,
    );
    unawaited(_persist());
    if (!_isLocalId(id)) unawaited(_syncRead(id: id));
  }

  Future<void> clearAll() async {
    state = const LoadableList(isLoading: false);
    final prefs = await SharedPreferences.getInstance();
    await prefs.remove(_storageKey);
  }
}

final unreadNotificationCountProvider = Provider<int>((ref) {
  return ref
      .watch(passengerNotificationsProvider)
      .items
      .where((item) => !item.read)
      .length;
});
