enum RideRole { passenger, rider }

enum DriverKind { okada, pragya, aboboyaa }

class SignupDraft {
  const SignupDraft({
    this.splashDone = false,
    this.onboardingDone = false,
    this.welcomeDone = false,
    this.phoneE164,
    this.otpVerified = false,
    this.role,
    this.passengerName,
    this.riderName,
    this.driverKind,
    this.applicationSubmitted = false,
    this.riderApproved = false,
  });

  final bool splashDone;
  final bool onboardingDone;
  final bool welcomeDone;
  final String? phoneE164;
  final bool otpVerified;
  final RideRole? role;
  final String? passengerName;
  final String? riderName;
  final DriverKind? driverKind;
  final bool applicationSubmitted;
  final bool riderApproved;

  SignupDraft copyWith({
    bool? splashDone,
    bool? onboardingDone,
    bool? welcomeDone,
    String? phoneE164,
    bool? otpVerified,
    RideRole? role,
    String? passengerName,
    String? riderName,
    DriverKind? driverKind,
    bool? applicationSubmitted,
    bool? riderApproved,
  }) {
    return SignupDraft(
      splashDone: splashDone ?? this.splashDone,
      onboardingDone: onboardingDone ?? this.onboardingDone,
      welcomeDone: welcomeDone ?? this.welcomeDone,
      phoneE164: phoneE164 ?? this.phoneE164,
      otpVerified: otpVerified ?? this.otpVerified,
      role: role ?? this.role,
      passengerName: passengerName ?? this.passengerName,
      riderName: riderName ?? this.riderName,
      driverKind: driverKind ?? this.driverKind,
      applicationSubmitted: applicationSubmitted ?? this.applicationSubmitted,
      riderApproved: riderApproved ?? this.riderApproved,
    );
  }
}
