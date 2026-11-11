import 'dart:async';

import 'package:firebase_core/firebase_core.dart';
import 'package:firebase_messaging/firebase_messaging.dart';
import 'package:flutter/foundation.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:shared_preferences/shared_preferences.dart';

import '../../features/auth/application/auth_session.dart';
import 'notifications_api.dart';

const _deviceIdStorageKey = 'cyrlo.push.deviceId.v1';

bool get _isMobilePushPlatform {
  if (kIsWeb) return false;
  return defaultTargetPlatform == TargetPlatform.android ||
      defaultTargetPlatform == TargetPlatform.iOS;
}

/// Top-level handler for FCM messages when the app is in the background.
@pragma('vm:entry-point')
Future<void> firebaseMessagingBackgroundHandler(RemoteMessage message) async {
  try {
    if (Firebase.apps.isEmpty) {
      await Firebase.initializeApp();
    }
  } catch (_) {
    // Native config missing — ignore in background.
  }
}

Future<bool> initializeFirebaseApp() async {
  if (!_isMobilePushPlatform) return false;
  try {
    if (Firebase.apps.isEmpty) {
      await Firebase.initializeApp();
    }
    FirebaseMessaging.onBackgroundMessage(firebaseMessagingBackgroundHandler);
    return true;
  } catch (error, stack) {
    debugPrint('Firebase init skipped: $error\n$stack');
    return false;
  }
}

String pushPlatformLabel() {
  if (defaultTargetPlatform == TargetPlatform.iOS) return 'IOS';
  return 'ANDROID';
}

final pushMessagingControllerProvider =
    Provider<PushMessagingController>((ref) {
  return PushMessagingController(ref);
});

class PushMessagingController {
  PushMessagingController(this._ref);

  final Ref _ref;
  StreamSubscription<String>? _tokenRefreshSub;
  StreamSubscription<RemoteMessage>? _foregroundSub;
  var _started = false;

  NotificationsApi get _api => _ref.read(notificationsApiProvider);

  Future<void> startAfterAuth() async {
    if (!_isMobilePushPlatform) return;

    final session = _ref.read(authSessionProvider);
    if (session == null) return;

    final ready = await initializeFirebaseApp();
    if (!ready) return;

    final messaging = FirebaseMessaging.instance;
    final settings = await messaging.requestPermission(
      alert: true,
      badge: true,
      sound: true,
      provisional: false,
    );
    if (settings.authorizationStatus == AuthorizationStatus.denied) {
      return;
    }

    if (defaultTargetPlatform == TargetPlatform.iOS) {
      await messaging.setForegroundNotificationPresentationOptions(
        alert: true,
        badge: true,
        sound: true,
      );
    }

    final token = await messaging.getToken();
    if (token != null && token.isNotEmpty) {
      await _registerToken(session.accessToken, token);
    }

    if (_started) return;
    _started = true;

    _tokenRefreshSub = messaging.onTokenRefresh.listen((newToken) async {
      final current = _ref.read(authSessionProvider);
      if (current == null || newToken.isEmpty) return;
      await _registerToken(current.accessToken, newToken);
    });

    _foregroundSub = FirebaseMessaging.onMessage.listen((message) {
      final title = message.notification?.title ?? message.data['title'];
      final body = message.notification?.body ?? message.data['body'];
      debugPrint('FCM foreground: $title — $body');
    });
  }

  Future<void> _registerToken(String accessToken, String token) async {
    try {
      final device = await _api.registerDevice(
        accessToken: accessToken,
        token: token,
        platform: pushPlatformLabel(),
        provider: 'FCM',
      );
      final prefs = await SharedPreferences.getInstance();
      await prefs.setString(_deviceIdStorageKey, device.id);
    } catch (error) {
      debugPrint('FCM device register failed: $error');
    }
  }

  Future<void> deactivateOnSignOut() async {
    final session = _ref.read(authSessionProvider);
    final prefs = await SharedPreferences.getInstance();
    final deviceId = prefs.getString(_deviceIdStorageKey);

    if (session != null && deviceId != null && deviceId.isNotEmpty) {
      try {
        await _api.deactivateDevice(
          accessToken: session.accessToken,
          deviceId: deviceId,
        );
      } catch (error) {
        debugPrint('FCM device deactivate failed: $error');
      }
    }

    await prefs.remove(_deviceIdStorageKey);

    try {
      if (Firebase.apps.isNotEmpty) {
        await FirebaseMessaging.instance.deleteToken();
      }
    } catch (_) {}

    await _tokenRefreshSub?.cancel();
    await _foregroundSub?.cancel();
    _tokenRefreshSub = null;
    _foregroundSub = null;
    _started = false;
  }
}
