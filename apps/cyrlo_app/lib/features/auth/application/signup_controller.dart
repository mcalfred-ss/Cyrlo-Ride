import 'package:flutter_riverpod/flutter_riverpod.dart';

import '../../../core/utils/phone_numbers.dart';
import 'signup_draft.dart';

class SignupController extends Notifier<SignupDraft> {
  @override
  SignupDraft build() => const SignupDraft();

  void finishSplash() {
    if (state.splashDone) return;
    state = state.copyWith(splashDone: true);
  }

  void finishOnboarding() {
    state = state.copyWith(onboardingDone: true);
  }

  void finishWelcome() {
    state = state.copyWith(welcomeDone: true);
  }

  void editPhone() {
    state = SignupDraft(
      splashDone: state.splashDone,
      onboardingDone: state.onboardingDone,
      welcomeDone: state.welcomeDone,
    );
  }

  bool submitPhone(String raw) {
    final phone = PhoneNumbers.normalizeGhanaToE164(raw);
    if (phone == null) return false;
    state = state.copyWith(phoneE164: phone, otpVerified: false);
    return true;
  }

  bool verifyOtp(String code) {
    if (!RegExp(r'^\d{6}$').hasMatch(code.trim())) return false;
    state = state.copyWith(otpVerified: true);
    return true;
  }

  void chooseRole(RideRole role) {
    state = state.copyWith(role: role);
  }

  bool savePassengerDetails(String name) {
    final trimmed = name.trim();
    if (trimmed.length < 2) return false;
    state = state.copyWith(passengerName: trimmed);
    return true;
  }

  void chooseDriver(DriverKind kind) {
    if (kind == DriverKind.aboboyaa) return;
    state = state.copyWith(driverKind: kind);
  }

  bool submitRiderApplication(String name) {
    final trimmed = name.trim();
    if (trimmed.length < 2 || state.driverKind == null) return false;
    state = state.copyWith(
      riderName: trimmed,
      applicationSubmitted: true,
    );
    return true;
  }

  /// Called when the backend marks the rider application approved.
  void markRiderApproved() {
    state = state.copyWith(riderApproved: true);
  }

  void signOut() {
    state = SignupDraft(
      splashDone: state.splashDone,
      onboardingDone: state.onboardingDone,
      welcomeDone: state.welcomeDone,
    );
  }
}

final signupProvider = NotifierProvider<SignupController, SignupDraft>(
  SignupController.new,
);
