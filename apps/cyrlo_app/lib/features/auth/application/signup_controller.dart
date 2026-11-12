import 'dart:async';
import 'dart:convert';

import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:shared_preferences/shared_preferences.dart';

import '../../../core/errors/api_exception.dart';
import '../../../core/utils/phone_numbers.dart';
import '../../../rider_app/onboarding/data/rider_onboarding_api.dart';
import '../../../rider_app/onboarding/data/rider_onboarding_models.dart';
import '../../../shared/models/geo_point.dart';
import '../../../shared/push/push_messaging.dart';
import '../data/auth_api.dart';
import '../data/auth_models.dart';
import 'auth_session.dart';
import 'signup_draft.dart';

class SignupController extends Notifier<SignupDraft> {
  static const _draftStorageKey = 'cyrlo.signup.draft';

  @override
  SignupDraft build() {
    ref.listen<AuthSession?>(authSessionProvider, (previous, next) {
      if (next == null) {
        // Session revoked/expired — require OTP again; keep phone for confirm/prefill.
        if (previous != null && state.otpVerified) {
          _set(
            state.copyWith(
              otpVerified: false,
              phoneConfirmed: false,
              accountReady: false,
            ),
          );
        }
        return;
      }
      if (state.otpVerified && state.phoneE164 != null) {
        // Valid session + verified OTP must never bounce to confirm-phone.
        if (!state.phoneConfirmed) {
          _set(state.copyWith(phoneConfirmed: true));
        }
        return;
      }
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
    if (session != null) {
      if (!state.otpVerified) {
        _applyRestoredSession(session);
      } else if (!state.phoneConfirmed) {
        // Older drafts forced phoneConfirmed=false on fromJson; heal on reopen.
        state = state.copyWith(phoneConfirmed: true);
        unawaited(_persist());
      }
      unawaited(
        ref.read(authSessionProvider.notifier).ensureFreshAccess().then((_) {
          final fresh = ref.read(authSessionProvider);
          if (fresh != null) {
            return _hydrateProfileFromApi(fresh);
          }
        }),
      );
    }
    // Always play the branded splash once per cold start, even for
    // returning sessions that already persisted splashDone=true.
    if (state.splashDone) {
      state = state.copyWith(splashDone: false);
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
      vehicleCategory: state.vehicleCategory,
      driverKind: state.driverKind,
      riderDriversLicenceNumber: state.riderDriversLicenceNumber,
      riderDriversLicenceExpiry: state.riderDriversLicenceExpiry,
      riderGhanaCardNumber: state.riderGhanaCardNumber,
      riderVehicleNumber: state.riderVehicleNumber,
      riderVehicleMake: state.riderVehicleMake,
      riderVehicleModel: state.riderVehicleModel,
      riderVehicleColour: state.riderVehicleColour,
      riderVehicleCapacity: state.riderVehicleCapacity,
      docGhanaCardPath: state.docGhanaCardPath,
      docDriversLicencePath: state.docDriversLicencePath,
      docRiderPhotoPath: state.docRiderPhotoPath,
      docVehiclePhotoPath: state.docVehiclePhotoPath,
      docVehicleRegistrationPath: state.docVehicleRegistrationPath,
      docRoadworthinessPath: state.docRoadworthinessPath,
      docInsurancePath: state.docInsurancePath,
      applicationSubmitted: state.applicationSubmitted,
      riderApproved: state.riderApproved,
      riderRejectionReason: state.riderRejectionReason,
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
    try {
      if (session.user.role == RideRole.passenger) {
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
        return;
      }
      if (session.user.role == RideRole.rider) {
        await refreshRiderApplicationStatus();
      }
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
        phoneConfirmed: false,
        otpVerified: false,
        accountReady: returning,
        // Keep a role already chosen on the confirm step; prefer DB role when known.
        role: knownRole ?? state.role,
        clearRole: knownRole == null && state.role == null,
      ),
    );
    return true;
  }

  void chooseRole(RideRole role) {
    _set(
      state.copyWith(
        role: role,
        phoneConfirmed: false,
        otpVerified: false,
        accountReady: false,
      ),
    );
  }

  /// Confirm the current number so OTP can be requested.
  void confirmPhoneForOtp() {
    if (state.phoneE164 == null) return;
    _set(state.copyWith(phoneConfirmed: true, otpVerified: false));
  }

  /// Wrong number after role — keep role, clear phone, go enter another.
  void changePhoneKeepRole() {
    _set(
      state.copyWith(
        clearPhone: true,
        phoneConfirmed: false,
        otpVerified: false,
        accountReady: false,
      ),
    );
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

  /// Verifies the SMS code and persists the session, but does **not** flip
  /// [SignupDraft.otpVerified] yet — the OTP screen shows the check animation
  /// first, then calls [markOtpVerified] so the router does not leave early.
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
    _set(
      state.copyWith(
        phoneConfirmed: true,
        phoneE164: tokens.user.phoneNumber,
        role: tokens.user.role,
        // Passengers only become "ready" after a complete profile exists
        // (local or hydrated from GET /users/me). Riders hydrate approval from API.
        accountReady: tokens.user.role == RideRole.passenger
            ? state.hasPassengerProfile
            : false,
      ),
    );
    final session = ref.read(authSessionProvider);
    if (session != null) {
      await _hydrateProfileFromApi(session);
      if (state.hasPassengerProfile) {
        _set(state.copyWith(accountReady: true));
      }
      if (tokens.user.role == RideRole.rider && state.riderApproved) {
        _set(state.copyWith(accountReady: true));
      }
    }
    return tokens.user;
  }

  /// Opens the next onboarding step after the OTP success animation.
  void markOtpVerified() {
    if (state.otpVerified) return;
    _set(state.copyWith(otpVerified: true, phoneConfirmed: true));
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

  void chooseVehicleCategory(VehicleCategory category) {
    // Pilot: only Pragya riders are onboarded for now.
    if (category != VehicleCategory.pragya) return;
    _set(
      state.copyWith(
        vehicleCategory: VehicleCategory.pragya,
        driverKind: DriverKind.pragya,
      ),
    );
  }

  @Deprecated('Use chooseVehicleCategory')
  void chooseDriver(DriverKind kind) {
    if (kind != DriverKind.pragya) return;
    chooseVehicleCategory(VehicleCategory.pragya);
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

  /// Uploads one ID (Ghana Card **or** licence) + selfie + plate, then submits.
  Future<void> submitRiderOnboarding({
    required String registrationNumber,
    required String riderPhotoPath,
    String? driversLicenceNumber,
    DateTime? driversLicenceExpiry,
    String? driversLicencePath,
    String? ghanaCardNumber,
    String? ghanaCardPath,
  }) async {
    final category = state.vehicleCategory ?? VehicleCategory.pragya;
    final fullName = state.riderName;
    if (fullName == null || !state.hasRiderProfile) {
      throw const ApiException(
        code: 'ONBOARDING_INCOMPLETE',
        message: 'Complete vehicle type and rider details first.',
      );
    }

    final plate = registrationNumber.trim().toUpperCase();
    final licence = driversLicenceNumber?.trim();
    final ghana = ghanaCardNumber?.trim().toUpperCase();
    final ghanaOk =
        ghana != null && RegExp(r'^GHA-\d{9}-\d$').hasMatch(ghana);
    final licenceOk = (licence?.length ?? 0) >= 5 &&
        driversLicenceExpiry != null &&
        (driversLicencePath?.isNotEmpty ?? false);
    final ghanaPathOk = ghanaOk && (ghanaCardPath?.isNotEmpty ?? false);

    if (plate.length < 2) {
      throw const ApiException(
        code: 'VEHICLE_INVALID',
        message: 'Enter your vehicle / car number.',
      );
    }
    if (riderPhotoPath.trim().isEmpty) {
      throw const ApiException(
        code: 'SELFIE_REQUIRED',
        message: 'Upload a selfie.',
      );
    }
    if (!ghanaPathOk && !licenceOk) {
      throw const ApiException(
        code: 'ID_REQUIRED',
        message: "Provide either Ghana Card or driver's licence details.",
      );
    }

    final session = ref.read(authSessionProvider);
    if (session == null) {
      throw const ApiException(
        code: 'UNAUTHORIZED',
        message: 'Sign in again to submit your application.',
      );
    }

    final api = ref.read(riderOnboardingApiProvider);
    final token = session.accessToken;

    try {
      await api.startOnboarding(
        accessToken: token,
        fullName: fullName,
        driversLicenceNumber: licenceOk ? licence : null,
        driversLicenceExpiry: licenceOk ? driversLicenceExpiry : null,
        ghanaCardNumber: ghanaPathOk ? ghana : null,
      );
    } on ApiException catch (error) {
      if (error.code != 'CONFLICT' && error.statusCode != 409) rethrow;
      await api.updateOnboarding(
        accessToken: token,
        fullName: fullName,
        driversLicenceNumber: licenceOk ? licence : null,
        driversLicenceExpiry: licenceOk ? driversLicenceExpiry : null,
        ghanaCardNumber: ghanaPathOk ? ghana : null,
      );
    }

    await api.createVehicle(
      accessToken: token,
      input: CreateVehicleInput(
        category: category,
        registrationNumber: plate,
        make: category.label,
        model: 'Standard',
        colour: 'Yellow',
        capacity: category.defaultCapacity,
      ),
    );

    Future<void> upload(RiderDocumentKind kind, String path) async {
      await api.uploadDocument(
        accessToken: token,
        kind: kind,
        filePath: path,
      );
    }

    if (ghanaPathOk) {
      await upload(RiderDocumentKind.ghanaCard, ghanaCardPath!);
    }
    if (licenceOk) {
      await upload(RiderDocumentKind.driversLicence, driversLicencePath!);
    }
    await upload(RiderDocumentKind.riderPhoto, riderPhotoPath);

    final application = await api.submitApplication(token);
    _applyApplication(application);
    _set(
      state.copyWith(
        riderDriversLicenceNumber: licenceOk ? licence : null,
        riderDriversLicenceExpiry: licenceOk ? driversLicenceExpiry : null,
        riderGhanaCardNumber: ghanaPathOk ? ghana : null,
        riderVehicleNumber: plate,
        riderVehicleMake: category.label,
        riderVehicleModel: 'Standard',
        riderVehicleColour: 'Yellow',
        riderVehicleCapacity: category.defaultCapacity,
        docGhanaCardPath: ghanaPathOk ? ghanaCardPath : null,
        docDriversLicencePath: licenceOk ? driversLicencePath : null,
        docRiderPhotoPath: riderPhotoPath,
        applicationSubmitted: true,
        riderApproved: application.isApproved,
        clearRejectionReason: !application.isRejected,
        riderRejectionReason: application.latestRejectionReason,
      ),
    );
  }

  Future<RiderApplicationView?> refreshRiderApplicationStatus() async {
    final session = ref.read(authSessionProvider);
    if (session == null || session.user.role != RideRole.rider) return null;
    try {
      final application = await ref
          .read(riderOnboardingApiProvider)
          .getMyApplication(session.accessToken);
      _applyApplication(application);
      return application;
    } on ApiException catch (error) {
      if (error.statusCode == 404 || error.code == 'NOT_FOUND') {
        _set(
          state.copyWith(
            applicationSubmitted: false,
            riderApproved: false,
            accountReady: false,
          ),
        );
        return null;
      }
      rethrow;
    }
  }

  void _applyApplication(RiderApplicationView application) {
    final approved = application.isApproved;
    final submitted = application.isPendingReview ||
        application.isApproved ||
        application.isRejected ||
        application.submittedAt != null;
    _set(
      state.copyWith(
        applicationSubmitted: submitted,
        riderApproved: approved,
        accountReady: approved,
        riderRejectionReason: application.latestRejectionReason,
        clearRejectionReason: !application.isRejected,
        riderFirstName: state.riderFirstName ??
            application.fullName?.split(RegExp(r'\s+')).first,
        riderLastName: state.riderLastName ??
            (application.fullName == null
                ? null
                : application.fullName!
                    .split(RegExp(r'\s+'))
                    .skip(1)
                    .join(' ')),
        riderDriversLicenceNumber:
            state.riderDriversLicenceNumber ?? application.driversLicenceNumber,
        riderDriversLicenceExpiry:
            state.riderDriversLicenceExpiry ?? application.driversLicenceExpiry,
        vehicleCategory: state.vehicleCategory ??
            (application.vehicles.isNotEmpty
                ? application.vehicles.first.category
                : null),
      ),
    );
  }

  /// Called when the backend marks the rider application approved.
  void markRiderApproved() {
    _set(state.copyWith(riderApproved: true, accountReady: true));
  }

  /// Allows rejected riders to edit and resubmit.
  void resetForResubmit() {
    _set(
      state.copyWith(
        applicationSubmitted: false,
        riderApproved: false,
        accountReady: false,
        clearRejectionReason: true,
      ),
    );
  }

  Future<void> signOut() async {
    await ref.read(pushMessagingControllerProvider).deactivateOnSignOut();
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
    await ref.read(pushMessagingControllerProvider).deactivateOnSignOut();
    await ref.read(authSessionProvider.notifier).clear();
    await ref.read(authSessionProvider.notifier).clearLastPhoneE164();
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
