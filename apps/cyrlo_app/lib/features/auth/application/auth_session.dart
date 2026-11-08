import 'dart:convert';

import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:shared_preferences/shared_preferences.dart';

import '../../../shared/providers/core_providers.dart';
import '../data/auth_api.dart';
import '../data/auth_models.dart';

class AuthSession {
  const AuthSession({
    required this.accessToken,
    required this.refreshToken,
    required this.user,
  });

  final String accessToken;
  final String refreshToken;
  final AuthUser user;

  AuthSession copyWith({
    String? accessToken,
    String? refreshToken,
    AuthUser? user,
  }) {
    return AuthSession(
      accessToken: accessToken ?? this.accessToken,
      refreshToken: refreshToken ?? this.refreshToken,
      user: user ?? this.user,
    );
  }

  Map<String, dynamic> toJson() => {
        'accessToken': accessToken,
        'refreshToken': refreshToken,
        'user': user.toJson(),
      };

  factory AuthSession.fromJson(Map<String, dynamic> json) {
    return AuthSession(
      accessToken: json['accessToken'] as String,
      refreshToken: json['refreshToken'] as String,
      user: AuthUser.fromJson(json['user'] as Map<String, dynamic>),
    );
  }
}

final authSessionProvider =
    NotifierProvider<AuthSessionController, AuthSession?>(
  AuthSessionController.new,
);

class AuthSessionController extends Notifier<AuthSession?> {
  static const _storageKey = 'cyrlo.auth.session';

  @override
  AuthSession? build() {
    Future.microtask(_restore);
    return null;
  }

  Future<void> _restore() async {
    final prefs = await SharedPreferences.getInstance();
    final raw = prefs.getString(_storageKey);
    if (raw == null || raw.isEmpty) return;
    try {
      final session = AuthSession.fromJson(
        jsonDecode(raw) as Map<String, dynamic>,
      );
      ref.read(apiClientProvider).setAccessToken(session.accessToken);
      state = session;
    } catch (_) {
      await prefs.remove(_storageKey);
    }
  }

  Future<void> save(AuthTokens tokens) async {
    final session = AuthSession(
      accessToken: tokens.accessToken,
      refreshToken: tokens.refreshToken,
      user: tokens.user.id.isEmpty && state != null
          ? state!.user
          : tokens.user,
    );
    ref.read(apiClientProvider).setAccessToken(session.accessToken);
    state = session;
    final prefs = await SharedPreferences.getInstance();
    await prefs.setString(_storageKey, jsonEncode(session.toJson()));
  }

  Future<void> clear({bool remoteLogout = true}) async {
    final current = state;
    state = null;
    ref.read(apiClientProvider).setAccessToken(null);
    final prefs = await SharedPreferences.getInstance();
    await prefs.remove(_storageKey);
    if (!remoteLogout || current == null) return;
    try {
      await ref.read(authApiProvider).logout(
            accessToken: current.accessToken,
            refreshToken: current.refreshToken,
          );
    } catch (_) {
      // Local sign-out still succeeds if the network call fails.
    }
  }
}
