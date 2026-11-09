import 'dart:async';
import 'dart:convert';

import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:shared_preferences/shared_preferences.dart';

import '../../../core/errors/api_exception.dart';
import '../../../core/utils/phone_numbers.dart';
import '../../../shared/models/geo_point.dart';
import '../data/auth_api.dart';
import '../data/auth_models.dart';
import 'auth_session.dart';
import 'signup_draft.dart';

class SignupController extends Notifier<SignupDraft> {
  static const _draftStorageKey = 'cyrlo.signup.draft';

  @override
  SignupDraft build() {
    ref.listen<AuthSession?>(authSessionProvider, (previous, next) {
      if (next == null) return;
      if (state.otpVerified && state.phoneE164 != null) return;
      _applyRestoredSession(next);
    });
    Future.microtask(_restore);
    return const SignupDraft();
  }

  Future<void> _restore() async {
    final prefs = await SharedPreferences.getInstance();
    final raw = prefs.getString(_draftStorageKey);
    if (raw != null && raw.isNotEmpty) {
      try {
        final restored = SignupDraft.fromJson(
          jsonDecode(raw) as Map<String, dynamic>,
        );
        state = restored;
      } catch (_) {
        await prefs.remove(_draftStorageKey);
      }
    }

    var session = ref.read(authSessionProvider);
    if (session == null) {
      final sessionRaw = prefs.getString(AuthSessionController.storageKey);
      if (sessionRaw != null && sessionRaw.isNotEmpty) {
        try {
          session = AuthSession.fromJson(
            jsonDecode(sessionRaw) as Map<String, dynamic>,
          );
          ref.read(authSessionProvider.notifier).adopt(session);
        } catch (_) {
          await prefs.remove(AuthSessionController.storageKey);
          session = null;
        }
      }
    }
    if (session != null && !state.otpVerified) {
      _applyRestoredSession(session);
    }
    if (session != null) {
      unawaited(_hydrateProfileFromApi(session));
    }
    ref.read(authBootstrapProvider.notifier).markReady();
  }

  void _applyRestoredSession(AuthSession session) {
    final fromSession = SignupDraft.restoredSession(
      phoneE164: session.user.phoneNumber,
      role: session.user.role,
      displayName: session.user.displayName,
    );
    // Keep richer local profile fields when draft was already persisted.
    state = fromSession.copyWith(
      passengerFirstName:
          state.passengerFirstName ?? fromSession.passengerFirstName,
      passengerLastName:
          state.passengerLastName ?? fromSession.passengerLastName,
      passengerDateOfBirth: state.passengerDateOfBirth,
      passengerGender: state.passengerGender,
      passengerLocation: state.passengerLocation,
      passengerLocationPoint: state.passengerLocationPoint,
      riderFirstName: state.riderFirstName ?? fromSession.riderFirstName,
      riderLastName: state.riderLastName ?? fromSession.riderLastName,
      riderDateOfBirth: state.riderDateOfBirth,
      riderGender: state.riderGender,
      riderLocation: state.riderLocation,
      riderLocationPoint: state.riderLocationPoint,
      riderIdType: state.riderIdType,
      riderIdFrontPath: state.riderIdFrontPath,
      riderVehicleNumber: state.riderVehicleNumber,
      riderSelfiePath: state.riderSelfiePath,
      driverKind: state.driverKind,
      applicationSubmitted: state.applicationSubmitted,
      riderApproved: state.riderApproved,
    );
    _applyPassengerProfile(session.user.passengerProfile);
    unawaited(_persist());
  }

  void _applyPassengerProfile(PassengerProfileInfo? profile) {
    if (profile == null || !profile.isComplete) return;
    final name = profile.fullName!.trim();
    final parts = name.split(RegExp(r'\s+'));
    final first = parts.first;
    final last = parts.length > 1 ? parts.sublist(1).join(' ') : parts.first;
    GeoPoint? point;
    if (profile.homeLatitude != null && profile.homeLongitude != null) {
      point = GeoPoint(
        latitude: profile.homeLatitude!,
        longitude: profile.homeLongitude!,
      );
    }
    state = state.copyWith(
      passengerFirstName: first,
      passengerLastName: last,
      passengerDateOfBirth: profile.dateOfBirth,
      passengerGender: profile.gender,
      passengerLocation: profile.homeLocation,
      passengerLocationPoint: point ?? state.passengerLocationPoint,
      accountReady: true,
    );
  }

  Future<void> _hydrateProfileFromApi(AuthSession session) async {
    if (session.user.role != RideRole.passenger) return;
    try {
      final me = await ref.read(authApiProvider).me(session.accessToken);
      _applyPassengerProfile(me.passengerProfile);
      if (me.displayName != null &&
          me.displayName!.trim().isNotEmpty &&
          !state.hasPassengerProfile) {
        final fromName = SignupDraft.restoredSession(
          phoneE164: me.phoneNumber,
          role: me.role,
          displayName: me.displayName,
        );
        state = state.copyWith(
          passengerFirstName:
              state.passengerFirstName ?? fromName.passengerFirstName,
          passengerLastName:
              state.passengerLastName ?? fromName.passengerLastName,
        );
      }
      await _persist();
    } catch (_) {
      // Offline / transient failures keep local draft; router may still ask
      // for passenger details when nothing is available.
    }
  }

  Future<void> _persist() async {
    final prefs = await SharedPreferences.getInstance();
    await prefs.setString(_draftStorageKey, jsonEncode(state.toJson()));
  }

  Future<void> _clearPersisted() async {
    final prefs = await SharedPreferences.getInstance();
    await prefs.remove(_draftStorageKey);
  }

  void _set(SignupDraft next) {
    state = next;
    unawaited(_persist());
  }

  void finishSplash() {
    if (state.splashDone) return;
    _set(state.copyWith(splashDone: true));
  }

  void finishOnboarding() {
    _set(state.copyWith(onboardingDone: true));
  }

  void finishWelcome() {
    _set(state.copyWith(welcomeDone: true));
  }

  void editPhone() {
    _set(
      SignupDraft(
        splashDone: state.splashDone,
        onboardingDone: state.onboardingDone,
        welcomeDone: state.welcomeDone,
      ),
    );
  }

  /// Saves the phone and, when it already exists in the DB, restores its role
  /// so the router can skip role selection and go to OTP → role home.
  Future<bool> submitPhone(String raw) async {
    final phone = PhoneNumbers.normalizeGhanaToE164(raw);
    if (phone == null) return false;

    RideRole? knownRole;
    var returning = false;
    try {
      final status = await ref.read(authApiProvider).lookupAccount(phone);
      if (status.registered && status.role != null) {
        knownRole = status.role;
        returning = true;
      }
    } catch (_) {
      // Lookup failure should not block signup — user can still pick a role.
    }

    _set(
      state.copyWith(
        phoneE164: phone,
        otpVerified: false,
        accountReady: returning,
        role: knownRole,
        clearRole: knownRole == null,
      ),
    );
    return true;
  }

  void chooseRole(RideRole role) {
    _set(state.copyWith(role: role, otpVerified: false, accountReady: false));
  }

  /// Sends an SMS OTP through the live API.
  Future<RequestOtpResult> requestOtp() async {
    final phone = state.phoneE164;
    if (phone == null) {
      throw const ApiException(
        code: 'PHONE_REQUIRED',
        message: 'Enter your phone number first.',
      );
    }
    return ref.read(authApiProvider).requestOtp(phone);
  }

  /// Verifies the SMS code against the live API and persists the DB session.
  Future<AuthUser> verifyOtp(String code) async {
    final phone = state.phoneE164;
    final role = state.role;
    if (phone == null || role == null) {
      throw const ApiException(
        code: 'SIGNUP_INCOMPLETE',
        message: 'Choose a role before verifying.',
      );
    }
    final tokens = await ref.read(authApiProvider).verifyOtp(
          phoneNumber: phone,
          code: code.trim(),
          role: role,
        );
    await ref.read(authSessionProvider.notifier).save(tokens);
    final returning = !tokens.isNewUser || state.accountReady;
    _set(
      state.copyWith(
        otpVerified: true,
        phoneE164: tokens.user.phoneNumber,
        role: tokens.user.role,
        // Passengers only become "ready" after a complete profile exists
        // (local or hydrated from GET /users/me).
        accountReady: tokens.user.role == RideRole.passenger
            ? state.hasPassengerProfile
            : returning,
        applicationSubmitted: returning && tokens.user.role == RideRole.rider
            ? true
            : null,
        riderApproved: returning && tokens.user.role == RideRole.rider
            ? true
            : null,
      ),
    );
    final session = ref.read(authSessionProvider);
    if (session != null) {
      await _hydrateProfileFromApi(session);
      if (state.hasPassengerProfile) {
        _set(state.copyWith(accountReady: true));
      }
    }
    return tokens.user;
  }

  /// Go back from vehicle type to role selection.
  void clearRole() {
    _set(state.copyWith(clearRole: true, clearDriverKind: true));
  }

  Future<bool> savePassengerDetails({
    required String firstName,
    required String lastName,
    required DateTime? dateOfBirth,
    required PassengerGender? gender,
    required String location,
    GeoPoint? locationPoint,
  }) async {
    final first = firstName.trim();
    final last = lastName.trim();
    final place = location.trim();
    if (first.length < 2) return false;
    if (last.length < 2) return false;
    if (dateOfBirth == null) return false;
    if (gender == null) return false;
    if (place.length < 2) return false;
    if (!_isAtLeast16(dateOfBirth)) return false;

    final session = ref.read(authSessionProvider);
    if (session == null) {
      throw const ApiException(
        code: 'UNAUTHORIZED',
        message: 'Sign in again to save your profile.',
      );
    }

    final fullName = '$first $last';
    final saved = await ref.read(authApiProvider).updatePassengerProfile(
          accessToken: session.accessToken,
          fullName: fullName,
          dateOfBirth: dateOfBirth,
          gender: gender,
          homeLocation: place,
          homeLatitude: locationPoint?.latitude,
          homeLongitude: locationPoint?.longitude,
        );

    _applyPassengerProfile(saved);
    _set(
      state.copyWith(
        passengerFirstName: first,
        passengerLastName: last,
        passengerDateOfBirth: dateOfBirth,
        passengerGender: gender,
        passengerLocation: place,
        passengerLocationPoint: locationPoint,
        accountReady: true,
      ),
    );
    await ref.read(authSessionProvider.notifier).save(
          AuthTokens(
            accessToken: session.accessToken,
            refreshToken: session.refreshToken,
            expiresIn: 900,
            user: AuthUser(
              id: session.user.id,
              phoneNumber: session.user.phoneNumber,
              role: session.user.role,
              status: session.user.status,
              displayName: fullName,
              passengerProfile: saved,
            ),
            isNewUser: false,
          ),
        );
    return true;
  }

  void chooseDriver(DriverKind kind) {
    if (kind == DriverKind.aboboyaa) return;
    _set(state.copyWith(driverKind: kind));
  }

  /// Go back from rider details to vehicle type.
  void clearDriverKind() {
    _set(state.copyWith(clearDriverKind: true));
  }

  /// Go back from documents to rider personal details.
  void clearRiderProfile() {
    _set(state.copyWith(clearRiderProfile: true));
  }

  bool saveRiderDetails({
    required String firstName,
    required String lastName,
    required DateTime? dateOfBirth,
    required PassengerGender? gender,
    required String location,
    GeoPoint? locationPoint,
  }) {
    final first = firstName.trim();
    final last = lastName.trim();
    final place = location.trim();
    if (first.length < 2) return false;
    if (last.length < 2) return false;
    if (dateOfBirth == null) return false;
    if (gender == null) return false;
    if (place.length < 2) return false;
    if (!_isAtLeast16(dateOfBirth)) return false;

    _set(
      state.copyWith(
        riderFirstName: first,
        riderLastName: last,
        riderDateOfBirth: dateOfBirth,
        riderGender: gender,
        riderLocation: place,
        riderLocationPoint: locationPoint,
      ),
    );
    return true;
  }

  bool submitRiderDocuments({
    required RiderIdType? idType,
    required String? idFrontPath,
    required String vehicleNumber,
    required String? selfiePath,
  }) {
    final plate = vehicleNumber.trim().toUpperCase();
    if (state.driverKind == null) return false;
    if (!state.hasRiderProfile) return false;
    if (idType == null) return false;
    if (idFrontPath == null || idFrontPath.isEmpty) return false;
    if (plate.length < 3) return false;
    if (selfiePath == null || selfiePath.isEmpty) return false;

    _set(
      state.copyWith(
        riderIdType: idType,
        riderIdFrontPath: idFrontPath,
        riderVehicleNumber: plate,
        riderSelfiePath: selfiePath,
        applicationSubmitted: true,
        // Approval comes from ops once onboarding API is wired.
        riderApproved: false,
      ),
    );
    return true;
  }

  /// Called when the backend marks the rider application approved.
  void markRiderApproved() {
    _set(state.copyWith(riderApproved: true));
  }

  Future<void> signOut() async {
    await ref.read(authSessionProvider.notifier).clear();
    await _clearPersisted();
    state = SignupDraft(
      splashDone: state.splashDone,
      onboardingDone: state.onboardingDone,
      welcomeDone: state.welcomeDone,
    );
  }

  /// Clears local profile data and remote session.
  Future<void> deleteAccount() async {
    await ref.read(authSessionProvider.notifier).clear();
    await _clearPersisted();
    state = SignupDraft(
      splashDone: state.splashDone,
      onboardingDone: state.onboardingDone,
      welcomeDone: state.welcomeDone,
    );
  }

  bool _isAtLeast16(DateTime dateOfBirth) {
    final now = DateTime.now();
    final age = now.year -
        dateOfBirth.year -
        ((now.month < dateOfBirth.month ||
                (now.month == dateOfBirth.month && now.day < dateOfBirth.day))
            ? 1
            : 0);
    return age >= 16;
  }
}

final signupProvider = NotifierProvider<SignupController, SignupDraft>(
  SignupController.new,
);

/// False until local session + signup draft have been read from storage.
final authBootstrapProvider =
    NotifierProvider<AuthBootstrapController, bool>(AuthBootstrapController.new);

class AuthBootstrapController extends Notifier<bool> {
  @override
  bool build() => false;

  void markReady() => state = true;
}
