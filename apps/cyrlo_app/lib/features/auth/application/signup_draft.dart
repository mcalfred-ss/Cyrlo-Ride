import '../../../rider_app/onboarding/data/rider_onboarding_models.dart';
import '../../../shared/models/geo_point.dart';

enum RideRole { passenger, rider }

/// Passenger map sprite kinds (kept for nearby/map UI until supply API returns categories).
enum DriverKind { okada, pragya, aboboyaa }

enum PassengerGender { male, female }

@Deprecated('Use RiderDocumentKind paths on SignupDraft instead')
enum RiderIdType { driversLicense, ghanaCard }

class SignupDraft {
  const SignupDraft({
    this.splashDone = false,
    this.onboardingDone = false,
    this.welcomeDone = false,
    this.phoneE164,
    this.phoneConfirmed = false,
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
    this.riderDriversLicenceNumber,
    this.riderDriversLicenceExpiry,
    this.riderGhanaCardNumber,
    this.vehicleCategory,
    this.riderVehicleNumber,
    this.riderVehicleMake,
    this.riderVehicleModel,
    this.riderVehicleColour,
    this.riderVehicleCapacity,
    this.docGhanaCardPath,
    this.docDriversLicencePath,
    this.docRiderPhotoPath,
    this.docVehiclePhotoPath,
    this.docVehicleRegistrationPath,
    this.docRoadworthinessPath,
    this.docInsurancePath,
    this.driverKind,
    this.applicationSubmitted = false,
    this.riderApproved = false,
    this.riderRejectionReason,
    this.accountReady = false,
  });

  final bool splashDone;
  final bool onboardingDone;
  final bool welcomeDone;
  final String? phoneE164;
  /// User confirmed this number after role selection (before OTP is sent).
  final bool phoneConfirmed;
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
  final String? riderDriversLicenceNumber;
  final DateTime? riderDriversLicenceExpiry;
  final String? riderGhanaCardNumber;
  final VehicleCategory? vehicleCategory;
  final String? riderVehicleNumber;
  final String? riderVehicleMake;
  final String? riderVehicleModel;
  final String? riderVehicleColour;
  final int? riderVehicleCapacity;
  final String? docGhanaCardPath;
  final String? docDriversLicencePath;
  final String? docRiderPhotoPath;
  final String? docVehiclePhotoPath;
  final String? docVehicleRegistrationPath;
  final String? docRoadworthinessPath;
  final String? docInsurancePath;
  final DriverKind? driverKind;
  final bool applicationSubmitted;
  final bool riderApproved;
  final String? riderRejectionReason;

  bool get hasPassengerProfile =>
      passengerFirstName != null &&
      passengerLastName != null &&
      passengerDateOfBirth != null &&
      passengerGender != null &&
      passengerLocation != null;

  /// Personal details (same shape as passenger). IDs/uploads come next.
  bool get hasRiderProfile =>
      riderFirstName != null &&
      riderLastName != null &&
      riderDateOfBirth != null &&
      riderGender != null &&
      riderLocation != null;

  bool get hasRiderDocuments =>
      vehicleCategory != null &&
      riderVehicleNumber != null &&
      riderVehicleMake != null &&
      riderVehicleModel != null &&
      riderVehicleColour != null &&
      riderVehicleCapacity != null &&
      docGhanaCardPath != null &&
      docDriversLicencePath != null &&
      docRiderPhotoPath != null &&
      docVehiclePhotoPath != null &&
      docVehicleRegistrationPath != null &&
      docRoadworthinessPath != null &&
      docInsurancePath != null;

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
        'phoneConfirmed': phoneConfirmed,
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
        'riderDriversLicenceNumber': riderDriversLicenceNumber,
        'riderDriversLicenceExpiry':
            riderDriversLicenceExpiry?.toIso8601String(),
        'riderGhanaCardNumber': riderGhanaCardNumber,
        'vehicleCategory': vehicleCategory?.apiValue,
        'riderVehicleNumber': riderVehicleNumber,
        'riderVehicleMake': riderVehicleMake,
        'riderVehicleModel': riderVehicleModel,
        'riderVehicleColour': riderVehicleColour,
        'riderVehicleCapacity': riderVehicleCapacity,
        'docGhanaCardPath': docGhanaCardPath,
        'docDriversLicencePath': docDriversLicencePath,
        'docRiderPhotoPath': docRiderPhotoPath,
        'docVehiclePhotoPath': docVehiclePhotoPath,
        'docVehicleRegistrationPath': docVehicleRegistrationPath,
        'docRoadworthinessPath': docRoadworthinessPath,
        'docInsurancePath': docInsurancePath,
        'driverKind': driverKind?.name,
        'applicationSubmitted': applicationSubmitted,
        'riderApproved': riderApproved,
        'riderRejectionReason': riderRejectionReason,
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

    DriverKind? driverKind;
    final kind = json['driverKind'] as String?;
    if (kind != null) {
      driverKind = DriverKind.values.asNameMap()[kind];
    }

    VehicleCategory? vehicleCategory =
        VehicleCategoryApi.fromApi(json['vehicleCategory'] as String?);
    if (vehicleCategory == null && driverKind != null) {
      vehicleCategory = switch (driverKind) {
        DriverKind.okada => VehicleCategory.okada,
        DriverKind.pragya => VehicleCategory.pragya,
        DriverKind.aboboyaa => VehicleCategory.aboboyaa,
      };
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
      // Keep confirm/OTP flags so a logged-in reopen goes home, not confirm-phone.
      // Incomplete signups still persist phoneConfirmed=false until the user confirms.
      phoneConfirmed: json['phoneConfirmed'] as bool? ?? false,
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
      riderDriversLicenceNumber: json['riderDriversLicenceNumber'] as String?,
      riderDriversLicenceExpiry: DateTime.tryParse(
        json['riderDriversLicenceExpiry'] as String? ?? '',
      ),
      riderGhanaCardNumber: json['riderGhanaCardNumber'] as String?,
      vehicleCategory: vehicleCategory,
      riderVehicleNumber: json['riderVehicleNumber'] as String?,
      riderVehicleMake: json['riderVehicleMake'] as String?,
      riderVehicleModel: json['riderVehicleModel'] as String?,
      riderVehicleColour: json['riderVehicleColour'] as String?,
      riderVehicleCapacity: (json['riderVehicleCapacity'] as num?)?.toInt(),
      docGhanaCardPath: json['docGhanaCardPath'] as String? ??
          (json['riderIdType'] == 'ghanaCard'
              ? json['riderIdFrontPath'] as String?
              : null),
      docDriversLicencePath: json['docDriversLicencePath'] as String? ??
          (json['riderIdType'] == 'driversLicense'
              ? json['riderIdFrontPath'] as String?
              : null),
      docRiderPhotoPath:
          json['docRiderPhotoPath'] as String? ?? json['riderSelfiePath'] as String?,
      docVehiclePhotoPath: json['docVehiclePhotoPath'] as String?,
      docVehicleRegistrationPath:
          json['docVehicleRegistrationPath'] as String?,
      docRoadworthinessPath: json['docRoadworthinessPath'] as String?,
      docInsurancePath: json['docInsurancePath'] as String?,
      driverKind: driverKind,
      applicationSubmitted: json['applicationSubmitted'] as bool? ?? false,
      riderApproved: json['riderApproved'] as bool? ?? false,
      riderRejectionReason: json['riderRejectionReason'] as String?,
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
      phoneConfirmed: true,
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
    bool? phoneConfirmed,
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
    String? riderDriversLicenceNumber,
    DateTime? riderDriversLicenceExpiry,
    String? riderGhanaCardNumber,
    VehicleCategory? vehicleCategory,
    String? riderVehicleNumber,
    String? riderVehicleMake,
    String? riderVehicleModel,
    String? riderVehicleColour,
    int? riderVehicleCapacity,
    String? docGhanaCardPath,
    String? docDriversLicencePath,
    String? docRiderPhotoPath,
    String? docVehiclePhotoPath,
    String? docVehicleRegistrationPath,
    String? docRoadworthinessPath,
    String? docInsurancePath,
    DriverKind? driverKind,
    bool? applicationSubmitted,
    bool? riderApproved,
    String? riderRejectionReason,
    bool clearPhone = false,
    bool clearRole = false,
    bool clearDriverKind = false,
    bool clearRiderProfile = false,
    bool clearRejectionReason = false,
  }) {
    return SignupDraft(
      splashDone: splashDone ?? this.splashDone,
      onboardingDone: onboardingDone ?? this.onboardingDone,
      welcomeDone: welcomeDone ?? this.welcomeDone,
      phoneE164: clearPhone ? null : (phoneE164 ?? this.phoneE164),
      phoneConfirmed: phoneConfirmed ?? this.phoneConfirmed,
      otpVerified: otpVerified ?? this.otpVerified,
      role: clearRole ? null : (role ?? this.role),
      accountReady: accountReady ?? this.accountReady,
      passengerFirstName: passengerFirstName ?? this.passengerFirstName,
      passengerLastName: passengerLastName ?? this.passengerLastName,
      passengerDateOfBirth: passengerDateOfBirth ?? this.passengerDateOfBirth,
      passengerGender: passengerGender ?? this.passengerGender,
      passengerLocation: passengerLocation ?? this.passengerLocation,
      passengerLocationPoint:
          passengerLocationPoint ?? this.passengerLocationPoint,
      riderFirstName:
          clearRiderProfile ? null : (riderFirstName ?? this.riderFirstName),
      riderLastName:
          clearRiderProfile ? null : (riderLastName ?? this.riderLastName),
      riderDateOfBirth: clearRiderProfile
          ? null
          : (riderDateOfBirth ?? this.riderDateOfBirth),
      riderGender: clearRiderProfile ? null : (riderGender ?? this.riderGender),
      riderLocation:
          clearRiderProfile ? null : (riderLocation ?? this.riderLocation),
      riderLocationPoint: clearRiderProfile
          ? null
          : (riderLocationPoint ?? this.riderLocationPoint),
      riderDriversLicenceNumber: clearRiderProfile
          ? null
          : (riderDriversLicenceNumber ?? this.riderDriversLicenceNumber),
      riderDriversLicenceExpiry: clearRiderProfile
          ? null
          : (riderDriversLicenceExpiry ?? this.riderDriversLicenceExpiry),
      riderGhanaCardNumber: clearRiderProfile
          ? null
          : (riderGhanaCardNumber ?? this.riderGhanaCardNumber),
      vehicleCategory:
          clearDriverKind ? null : (vehicleCategory ?? this.vehicleCategory),
      riderVehicleNumber: riderVehicleNumber ?? this.riderVehicleNumber,
      riderVehicleMake: riderVehicleMake ?? this.riderVehicleMake,
      riderVehicleModel: riderVehicleModel ?? this.riderVehicleModel,
      riderVehicleColour: riderVehicleColour ?? this.riderVehicleColour,
      riderVehicleCapacity: riderVehicleCapacity ?? this.riderVehicleCapacity,
      docGhanaCardPath: docGhanaCardPath ?? this.docGhanaCardPath,
      docDriversLicencePath:
          docDriversLicencePath ?? this.docDriversLicencePath,
      docRiderPhotoPath: docRiderPhotoPath ?? this.docRiderPhotoPath,
      docVehiclePhotoPath: docVehiclePhotoPath ?? this.docVehiclePhotoPath,
      docVehicleRegistrationPath:
          docVehicleRegistrationPath ?? this.docVehicleRegistrationPath,
      docRoadworthinessPath:
          docRoadworthinessPath ?? this.docRoadworthinessPath,
      docInsurancePath: docInsurancePath ?? this.docInsurancePath,
      driverKind: clearDriverKind ? null : (driverKind ?? this.driverKind),
      applicationSubmitted: applicationSubmitted ?? this.applicationSubmitted,
      riderApproved: riderApproved ?? this.riderApproved,
      riderRejectionReason: clearRejectionReason
          ? null
          : (riderRejectionReason ?? this.riderRejectionReason),
    );
  }
}
