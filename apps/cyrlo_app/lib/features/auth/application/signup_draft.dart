import '../../../shared/models/geo_point.dart';

enum RideRole { passenger, rider }

enum DriverKind { okada, pragya, aboboyaa }

enum PassengerGender { male, female }

enum RiderIdType { driversLicense, ghanaCard }

class SignupDraft {
  const SignupDraft({
    this.splashDone = false,
    this.onboardingDone = false,
    this.welcomeDone = false,
    this.phoneE164,
    this.otpVerified = false,
    this.role,
    this.passengerFirstName,
    this.passengerLastName,
    this.passengerDateOfBirth,
    this.passengerGender,
    this.passengerLocation,
    this.passengerLocationPoint,
    this.riderFirstName,
    this.riderLastName,
    this.riderDateOfBirth,
    this.riderGender,
    this.riderLocation,
    this.riderLocationPoint,
    this.riderIdType,
    this.riderIdFrontPath,
    this.riderVehicleNumber,
    this.riderSelfiePath,
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
  final String? passengerFirstName;
  final String? passengerLastName;
  final DateTime? passengerDateOfBirth;
  final PassengerGender? passengerGender;
  final String? passengerLocation;
  final GeoPoint? passengerLocationPoint;
  final String? riderFirstName;
  final String? riderLastName;
  final DateTime? riderDateOfBirth;
  final PassengerGender? riderGender;
  final String? riderLocation;
  final GeoPoint? riderLocationPoint;
  final RiderIdType? riderIdType;
  final String? riderIdFrontPath;
  final String? riderVehicleNumber;
  final String? riderSelfiePath;
  final DriverKind? driverKind;
  final bool applicationSubmitted;
  final bool riderApproved;

  bool get hasPassengerProfile =>
      passengerFirstName != null &&
      passengerLastName != null &&
      passengerDateOfBirth != null &&
      passengerGender != null &&
      passengerLocation != null;

  bool get hasRiderProfile =>
      riderFirstName != null &&
      riderLastName != null &&
      riderDateOfBirth != null &&
      riderGender != null &&
      riderLocation != null;

  bool get hasRiderDocuments =>
      riderIdType != null &&
      riderIdFrontPath != null &&
      riderVehicleNumber != null &&
      riderSelfiePath != null;

  String? get passengerName {
    if (passengerFirstName == null || passengerLastName == null) return null;
    return '$passengerFirstName $passengerLastName';
  }

  String? get riderName {
    if (riderFirstName == null || riderLastName == null) return null;
    return '$riderFirstName $riderLastName';
  }

  SignupDraft copyWith({
    bool? splashDone,
    bool? onboardingDone,
    bool? welcomeDone,
    String? phoneE164,
    bool? otpVerified,
    RideRole? role,
    String? passengerFirstName,
    String? passengerLastName,
    DateTime? passengerDateOfBirth,
    PassengerGender? passengerGender,
    String? passengerLocation,
    GeoPoint? passengerLocationPoint,
    String? riderFirstName,
    String? riderLastName,
    DateTime? riderDateOfBirth,
    PassengerGender? riderGender,
    String? riderLocation,
    GeoPoint? riderLocationPoint,
    RiderIdType? riderIdType,
    String? riderIdFrontPath,
    String? riderVehicleNumber,
    String? riderSelfiePath,
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
      passengerFirstName: passengerFirstName ?? this.passengerFirstName,
      passengerLastName: passengerLastName ?? this.passengerLastName,
      passengerDateOfBirth: passengerDateOfBirth ?? this.passengerDateOfBirth,
      passengerGender: passengerGender ?? this.passengerGender,
      passengerLocation: passengerLocation ?? this.passengerLocation,
      passengerLocationPoint: passengerLocationPoint ?? this.passengerLocationPoint,
      riderFirstName: riderFirstName ?? this.riderFirstName,
      riderLastName: riderLastName ?? this.riderLastName,
      riderDateOfBirth: riderDateOfBirth ?? this.riderDateOfBirth,
      riderGender: riderGender ?? this.riderGender,
      riderLocation: riderLocation ?? this.riderLocation,
      riderLocationPoint: riderLocationPoint ?? this.riderLocationPoint,
      riderIdType: riderIdType ?? this.riderIdType,
      riderIdFrontPath: riderIdFrontPath ?? this.riderIdFrontPath,
      riderVehicleNumber: riderVehicleNumber ?? this.riderVehicleNumber,
      riderSelfiePath: riderSelfiePath ?? this.riderSelfiePath,
      driverKind: driverKind ?? this.driverKind,
      applicationSubmitted: applicationSubmitted ?? this.applicationSubmitted,
      riderApproved: riderApproved ?? this.riderApproved,
    );
  }
}
