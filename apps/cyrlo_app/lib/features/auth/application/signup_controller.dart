import 'package:flutter_riverpod/flutter_riverpod.dart';

import '../../../core/utils/phone_numbers.dart';
import '../../../shared/models/geo_point.dart';
import 'signup_draft.dart';

class SignupController extends Notifier<SignupDraft> {
  /// Local stand-in until SMS OTP is connected.
  static const testOtp = '123456';

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
    if (code.trim() != testOtp) return false;
    state = state.copyWith(otpVerified: true);
    return true;
  }

  void chooseRole(RideRole role) {
    state = state.copyWith(role: role);
  }

  /// Go back from vehicle type to role selection.
  void clearRole() {
    state = state.copyWith(clearRole: true, clearDriverKind: true);
  }

  bool savePassengerDetails({
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

    state = state.copyWith(
      passengerFirstName: first,
      passengerLastName: last,
      passengerDateOfBirth: dateOfBirth,
      passengerGender: gender,
      passengerLocation: place,
      passengerLocationPoint: locationPoint,
    );
    return true;
  }

  void chooseDriver(DriverKind kind) {
    if (kind == DriverKind.aboboyaa) return;
    state = state.copyWith(driverKind: kind);
  }

  /// Go back from rider details to vehicle type.
  void clearDriverKind() {
    state = state.copyWith(clearDriverKind: true);
  }

  /// Go back from documents to rider personal details.
  void clearRiderProfile() {
    state = state.copyWith(clearRiderProfile: true);
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

    state = state.copyWith(
      riderFirstName: first,
      riderLastName: last,
      riderDateOfBirth: dateOfBirth,
      riderGender: gender,
      riderLocation: place,
      riderLocationPoint: locationPoint,
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

    state = state.copyWith(
      riderIdType: idType,
      riderIdFrontPath: idFrontPath,
      riderVehicleNumber: plate,
      riderSelfiePath: selfiePath,
      applicationSubmitted: true,
      // Local testing: skip the waiting-for-approval gate.
      riderApproved: true,
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

  /// Clears all profile data on this device (local stand-in until API delete).
  void deleteAccount() {
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
