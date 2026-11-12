import 'dart:async';
import 'dart:convert';
import 'dart:developer' as developer;

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
    this.accessExpiresAtMs,
    this.lastRefreshAtMs,
  });

  final String accessToken;
  final String refreshToken;
  final AuthUser user;

  /// Epoch ms when the access token should be treated as expired.
  final int? accessExpiresAtMs;

  /// Epoch ms of the last successful refresh/save.
  final int? lastRefreshAtMs;

  bool get accessNearExpiry {
    final expiresAt = accessExpiresAtMs;
    if (expiresAt == null) return true;
    // Refresh a minute early so API calls rarely see a raw 401.
    return DateTime.now().millisecondsSinceEpoch >= expiresAt - 60_000;
  }

  AuthSession copyWith({
    String? accessToken,
    String? refreshToken,
    AuthUser? user,
    int? accessExpiresAtMs,
    int? lastRefreshAtMs,
  }) {
    return AuthSession(
      accessToken: accessToken ?? this.accessToken,
      refreshToken: refreshToken ?? this.refreshToken,
      user: user ?? this.user,
      accessExpiresAtMs: accessExpiresAtMs ?? this.accessExpiresAtMs,
      lastRefreshAtMs: lastRefreshAtMs ?? this.lastRefreshAtMs,
    );
  }

  Map<String, dynamic> toJson() => {
        'accessToken': accessToken,
        'refreshToken': refreshToken,
        'user': user.toJson(),
        if (accessExpiresAtMs != null) 'accessExpiresAtMs': accessExpiresAtMs,
        if (lastRefreshAtMs != null) 'lastRefreshAtMs': lastRefreshAtMs,
      };

  factory AuthSession.fromJson(Map<String, dynamic> json) {
    return AuthSession(
      accessToken: json['accessToken'] as String,
      refreshToken: json['refreshToken'] as String,
      user: AuthUser.fromJson(json['user'] as Map<String, dynamic>),
      accessExpiresAtMs: (json['accessExpiresAtMs'] as num?)?.toInt(),
      lastRefreshAtMs: (json['lastRefreshAtMs'] as num?)?.toInt(),
    );
  }
}

final authSessionProvider =
    NotifierProvider<AuthSessionController, AuthSession?>(
  AuthSessionController.new,
);

class AuthSessionController extends Notifier<AuthSession?> {
  static const storageKey = 'cyrlo.auth.session';
  static const lastPhoneStorageKey = 'cyrlo.auth.lastPhoneE164';

  Future<bool>? _refreshInFlight;

  @override
  AuthSession? build() {
    Future.microtask(_restore);
    return null;
  }

  Future<void> _restore() async {
    final prefs = await SharedPreferences.getInstance();
    final raw = prefs.getString(storageKey);
    if (raw == null || raw.isEmpty) {
      _log('restore_miss', 'no stored session');
      return;
    }
    try {
      adopt(AuthSession.fromJson(jsonDecode(raw) as Map<String, dynamic>));
      _log('restore_ok', 'session adopted; refreshing');
      // Access tokens are short-lived; refresh quietly so the user stays signed in.
      await tryRefresh(reason: 'cold_start');
    } catch (error) {
      _log('restore_corrupt', error.toString());
      await prefs.remove(storageKey);
    }
  }

  /// Apply a session already loaded from storage (e.g. signup bootstrap).
  void adopt(AuthSession session) {
    ref.read(apiClientProvider).setAccessToken(session.accessToken);
    state = session;
  }

  Future<void> save(AuthTokens tokens) async {
    final now = DateTime.now().millisecondsSinceEpoch;
    final session = AuthSession(
      accessToken: tokens.accessToken,
      refreshToken: tokens.refreshToken,
      user: tokens.user.id.isEmpty && state != null
          ? state!.user
          : tokens.user,
      accessExpiresAtMs: now + (tokens.expiresIn * 1000),
      lastRefreshAtMs: now,
    );
    ref.read(apiClientProvider).setAccessToken(session.accessToken);
    state = session;
    final prefs = await SharedPreferences.getInstance();
    await prefs.setString(storageKey, jsonEncode(session.toJson()));
    final phone = session.user.phoneNumber.trim();
    if (phone.isNotEmpty) {
      await prefs.setString(lastPhoneStorageKey, phone);
    }
  }

  /// Last phone used for a successful login (survives sign-out / session expiry).
  Future<String?> readLastPhoneE164() async {
    final prefs = await SharedPreferences.getInstance();
    final phone = prefs.getString(lastPhoneStorageKey)?.trim();
    if (phone == null || phone.isEmpty) return null;
    return phone;
  }

  Future<void> clearLastPhoneE164() async {
    final prefs = await SharedPreferences.getInstance();
    await prefs.remove(lastPhoneStorageKey);
  }

  /// Rotates access (+ refresh) tokens. Returns false if the user must sign in again.
  ///
  /// Network failures return false **without** clearing the stored session.
  Future<bool> tryRefresh({String reason = 'api_401'}) {
    final existing = _refreshInFlight;
    if (existing != null) return existing;
    final future = _refreshOnce(reason: reason);
    _refreshInFlight = future;
    return future.whenComplete(() {
      if (identical(_refreshInFlight, future)) {
        _refreshInFlight = null;
      }
    });
  }

  /// Refresh when the access token is missing expiry metadata or near expiry.
  Future<bool> ensureFreshAccess() {
    final current = state;
    if (current == null) return Future.value(false);
    if (!current.accessNearExpiry) return Future.value(true);
    return tryRefresh(reason: 'proactive');
  }

  Future<bool> _refreshOnce({required String reason}) async {
    final current = state;
    if (current == null || current.refreshToken.isEmpty) {
      _log('refresh_skip', 'no session ($reason)');
      return false;
    }
    try {
      final tokens =
          await ref.read(authApiProvider).refresh(current.refreshToken);
      await save(
        AuthTokens(
          accessToken: tokens.accessToken,
          refreshToken: tokens.refreshToken,
          expiresIn: tokens.expiresIn,
          user: tokens.user.id.isEmpty ? current.user : tokens.user,
          isNewUser: false,
        ),
      );
      _log('refresh_ok', reason);
      return true;
    } on ApiException catch (error) {
      if (_isDefinitiveAuthFailure(error)) {
        _log(
          'refresh_auth_fail',
          '$reason ${error.code} status=${error.statusCode}',
        );
        await clear(remoteLogout: false);
      } else {
        // Keep session on flaky network / 5xx — retry later.
        _log(
          'refresh_soft_fail',
          '$reason ${error.code} status=${error.statusCode}',
        );
      }
      return false;
    } on DioException catch (error) {
      _log('refresh_network', '$reason ${error.type}');
      return false;
    } catch (error) {
      _log('refresh_unknown', '$reason $error');
      return false;
    }
  }

  bool _isDefinitiveAuthFailure(ApiException error) {
    if (error.statusCode == 401) return true;
    switch (error.code) {
      case 'UNAUTHORIZED':
      case 'TOKEN_INVALID':
      case 'TOKEN_EXPIRED':
      case 'REFRESH_REUSE':
      case 'SESSION_REVOKED':
        return true;
      default:
        return false;
    }
  }

  Future<void> clear({bool remoteLogout = true}) async {
    final current = state;
    state = null;
    ref.read(apiClientProvider).setAccessToken(null);
    final prefs = await SharedPreferences.getInstance();
    await prefs.remove(storageKey);
    // Keep lastPhoneStorageKey so re-auth can prefill the number.
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

  void _log(String code, String detail) {
    developer.log('$code: $detail', name: 'cyrlo.auth.session');
  }
}
