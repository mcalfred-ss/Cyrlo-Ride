import 'dart:async';
import 'dart:convert';

import 'package:dio/dio.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:shared_preferences/shared_preferences.dart';

import '../../../core/errors/api_exception.dart';
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
  static const storageKey = 'cyrlo.auth.session';

  Future<bool>? _refreshInFlight;

  @override
  AuthSession? build() {
    Future.microtask(_restore);
    return null;
  }

  Future<void> _restore() async {
    final prefs = await SharedPreferences.getInstance();
    final raw = prefs.getString(storageKey);
    if (raw == null || raw.isEmpty) return;
    try {
      adopt(AuthSession.fromJson(jsonDecode(raw) as Map<String, dynamic>));
      // Access tokens are short-lived; refresh quietly so the user stays signed in.
      await tryRefresh();
    } catch (_) {
      await prefs.remove(storageKey);
    }
  }

  /// Apply a session already loaded from storage (e.g. signup bootstrap).
  void adopt(AuthSession session) {
    ref.read(apiClientProvider).setAccessToken(session.accessToken);
    state = session;
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
    await prefs.setString(storageKey, jsonEncode(session.toJson()));
  }

  /// Rotates access (+ refresh) tokens. Returns false if the user must sign in again.
  Future<bool> tryRefresh() {
    final existing = _refreshInFlight;
    if (existing != null) return existing;
    final future = _refreshOnce();
    _refreshInFlight = future;
    return future.whenComplete(() {
      if (identical(_refreshInFlight, future)) {
        _refreshInFlight = null;
      }
    });
  }

  Future<bool> _refreshOnce() async {
    final current = state;
    if (current == null || current.refreshToken.isEmpty) return false;
    try {
      final tokens = await ref.read(authApiProvider).refresh(current.refreshToken);
      await save(
        AuthTokens(
          accessToken: tokens.accessToken,
          refreshToken: tokens.refreshToken,
          expiresIn: tokens.expiresIn,
          user: tokens.user.id.isEmpty ? current.user : tokens.user,
          isNewUser: false,
        ),
      );
      return true;
    } on ApiException catch (error) {
      if (error.statusCode == 401 ||
          error.code == 'UNAUTHORIZED' ||
          error.code == 'TOKEN_INVALID' ||
          error.code == 'TOKEN_EXPIRED') {
        await clear(remoteLogout: false);
      }
      return false;
    } on DioException {
      return false;
    } catch (_) {
      return false;
    }
  }

  Future<void> clear({bool remoteLogout = true}) async {
    final current = state;
    state = null;
    ref.read(apiClientProvider).setAccessToken(null);
    final prefs = await SharedPreferences.getInstance();
    await prefs.remove(storageKey);
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
