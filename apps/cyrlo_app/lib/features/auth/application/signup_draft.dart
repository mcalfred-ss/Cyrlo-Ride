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
    this.accountReady = false,
  });

  final bool splashDone;
  final bool onboardingDone;
  final bool welcomeDone;
  final String? phoneE164;
  final bool otpVerified;
  final RideRole? role;
  /// Returning DB user — skip profile / approval gates and open role home.
  final bool accountReady;
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

  Map<String, dynamic> toJson() => {
        'splashDone': splashDone,
        'onboardingDone': onboardingDone,
        'welcomeDone': welcomeDone,
        'phoneE164': phoneE164,
        'otpVerified': otpVerified,
        'role': switch (role) {
          RideRole.passenger => 'PASSENGER',
          RideRole.rider => 'RIDER',
          null => null,
        },
        'passengerFirstName': passengerFirstName,
        'passengerLastName': passengerLastName,
        'passengerDateOfBirth': passengerDateOfBirth?.toIso8601String(),
        'passengerGender': passengerGender?.name,
        'passengerLocation': passengerLocation,
        'passengerLocationPoint': passengerLocationPoint?.toJson(),
        'riderFirstName': riderFirstName,
        'riderLastName': riderLastName,
        'riderDateOfBirth': riderDateOfBirth?.toIso8601String(),
        'riderGender': riderGender?.name,
        'riderLocation': riderLocation,
        'riderLocationPoint': riderLocationPoint?.toJson(),
        'riderIdType': riderIdType?.name,
        'riderIdFrontPath': riderIdFrontPath,
        'riderVehicleNumber': riderVehicleNumber,
        'riderSelfiePath': riderSelfiePath,
        'driverKind': driverKind?.name,
        'applicationSubmitted': applicationSubmitted,
        'riderApproved': riderApproved,
        'accountReady': accountReady,
      };

  factory SignupDraft.fromJson(Map<String, dynamic> json) {
    RideRole? role;
    final roleRaw = json['role'] as String?;
    if (roleRaw == 'PASSENGER') role = RideRole.passenger;
    if (roleRaw == 'RIDER') role = RideRole.rider;

    PassengerGender? passengerGender;
    final pg = json['passengerGender'] as String?;
    if (pg != null) {
      passengerGender = PassengerGender.values.asNameMap()[pg];
    }

    PassengerGender? riderGender;
    final rg = json['riderGender'] as String?;
    if (rg != null) {
      riderGender = PassengerGender.values.asNameMap()[rg];
    }

    RiderIdType? riderIdType;
    final idType = json['riderIdType'] as String?;
    if (idType != null) {
      riderIdType = RiderIdType.values.asNameMap()[idType];
    }

    DriverKind? driverKind;
    final kind = json['driverKind'] as String?;
    if (kind != null) {
      driverKind = DriverKind.values.asNameMap()[kind];
    }

    GeoPoint? passengerPoint;
    final pp = json['passengerLocationPoint'];
    if (pp is Map) {
      passengerPoint = GeoPoint.fromJson(Map<String, dynamic>.from(pp));
    }

    GeoPoint? riderPoint;
    final rp = json['riderLocationPoint'];
    if (rp is Map) {
      riderPoint = GeoPoint.fromJson(Map<String, dynamic>.from(rp));
    }

    return SignupDraft(
      splashDone: json['splashDone'] as bool? ?? false,
      onboardingDone: json['onboardingDone'] as bool? ?? false,
      welcomeDone: json['welcomeDone'] as bool? ?? false,
      phoneE164: json['phoneE164'] as String?,
      otpVerified: json['otpVerified'] as bool? ?? false,
      role: role,
      passengerFirstName: json['passengerFirstName'] as String?,
      passengerLastName: json['passengerLastName'] as String?,
      passengerDateOfBirth: DateTime.tryParse(
        json['passengerDateOfBirth'] as String? ?? '',
      ),
      passengerGender: passengerGender,
      passengerLocation: json['passengerLocation'] as String?,
      passengerLocationPoint: passengerPoint,
      riderFirstName: json['riderFirstName'] as String?,
      riderLastName: json['riderLastName'] as String?,
      riderDateOfBirth: DateTime.tryParse(
        json['riderDateOfBirth'] as String? ?? '',
      ),
      riderGender: riderGender,
      riderLocation: json['riderLocation'] as String?,
      riderLocationPoint: riderPoint,
      riderIdType: riderIdType,
      riderIdFrontPath: json['riderIdFrontPath'] as String?,
      riderVehicleNumber: json['riderVehicleNumber'] as String?,
      riderSelfiePath: json['riderSelfiePath'] as String?,
      driverKind: driverKind,
      applicationSubmitted: json['applicationSubmitted'] as bool? ?? false,
      riderApproved: json['riderApproved'] as bool? ?? false,
      accountReady: json['accountReady'] as bool? ?? false,
    );
  }

  /// Draft filled enough to skip phone/OTP after a restored DB session.
  factory SignupDraft.restoredSession({
    required String phoneE164,
    required RideRole role,
    String? displayName,
  }) {
    final name = displayName?.trim();
    String? first;
    String? last;
    if (name != null && name.isNotEmpty) {
      final parts = name.split(RegExp(r'\s+'));
      first = parts.first;
      last = parts.length > 1 ? parts.sublist(1).join(' ') : parts.first;
    }
    return SignupDraft(
      splashDone: true,
      onboardingDone: true,
      welcomeDone: true,
      phoneE164: phoneE164,
      otpVerified: true,
      role: role,
      accountReady: true,
      passengerFirstName: role == RideRole.passenger ? first : null,
      passengerLastName: role == RideRole.passenger ? last : null,
      riderFirstName: role == RideRole.rider ? first : null,
      riderLastName: role == RideRole.rider ? last : null,
      applicationSubmitted: role == RideRole.rider,
      riderApproved: role == RideRole.rider,
    );
  }

  SignupDraft copyWith({
    bool? splashDone,
    bool? onboardingDone,
    bool? welcomeDone,
    String? phoneE164,
    bool? otpVerified,
    RideRole? role,
    bool? accountReady,
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
    bool clearRole = false,
    bool clearDriverKind = false,
    bool clearRiderProfile = false,
  }) {
    return SignupDraft(
      splashDone: splashDone ?? this.splashDone,
      onboardingDone: onboardingDone ?? this.onboardingDone,
      welcomeDone: welcomeDone ?? this.welcomeDone,
      phoneE164: phoneE164 ?? this.phoneE164,
      otpVerified: otpVerified ?? this.otpVerified,
      role: clearRole ? null : (role ?? this.role),
      accountReady: accountReady ?? this.accountReady,
      passengerFirstName: passengerFirstName ?? this.passengerFirstName,
      passengerLastName: passengerLastName ?? this.passengerLastName,
      passengerDateOfBirth: passengerDateOfBirth ?? this.passengerDateOfBirth,
      passengerGender: passengerGender ?? this.passengerGender,
      passengerLocation: passengerLocation ?? this.passengerLocation,
      passengerLocationPoint: passengerLocationPoint ?? this.passengerLocationPoint,
      riderFirstName: clearRiderProfile ? null : (riderFirstName ?? this.riderFirstName),
      riderLastName: clearRiderProfile ? null : (riderLastName ?? this.riderLastName),
      riderDateOfBirth:
          clearRiderProfile ? null : (riderDateOfBirth ?? this.riderDateOfBirth),
      riderGender: clearRiderProfile ? null : (riderGender ?? this.riderGender),
      riderLocation: clearRiderProfile ? null : (riderLocation ?? this.riderLocation),
      riderLocationPoint:
          clearRiderProfile ? null : (riderLocationPoint ?? this.riderLocationPoint),
      riderIdType: riderIdType ?? this.riderIdType,
      riderIdFrontPath: riderIdFrontPath ?? this.riderIdFrontPath,
      riderVehicleNumber: riderVehicleNumber ?? this.riderVehicleNumber,
      riderSelfiePath: riderSelfiePath ?? this.riderSelfiePath,
      driverKind: clearDriverKind ? null : (driverKind ?? this.driverKind),
      applicationSubmitted: applicationSubmitted ?? this.applicationSubmitted,
      riderApproved: riderApproved ?? this.riderApproved,
    );
  }
}

