enum VehicleCategory { tricycle, car }

enum RiderDocumentKind {
  ghanaCard,
  driversLicence,
  riderPhoto,
  vehiclePhoto,
  vehicleRegistration,
  roadworthiness,
  insurance,
}

enum RiderVerificationStatus {
  draft,
  pendingReview,
  approved,
  rejected,
  unknown,
}

extension VehicleCategoryApi on VehicleCategory {
  String get apiValue => switch (this) {
        VehicleCategory.tricycle => 'TRICYCLE',
        VehicleCategory.car => 'CAR',
      };

  static VehicleCategory? fromApi(String? raw) {
    return switch (raw) {
      'TRICYCLE' => VehicleCategory.tricycle,
      'CAR' => VehicleCategory.car,
      _ => null,
    };
  }
}

extension RiderDocumentKindApi on RiderDocumentKind {
  String get apiValue => switch (this) {
        RiderDocumentKind.ghanaCard => 'GHANA_CARD',
        RiderDocumentKind.driversLicence => 'DRIVERS_LICENCE',
        RiderDocumentKind.riderPhoto => 'RIDER_PHOTO',
        RiderDocumentKind.vehiclePhoto => 'VEHICLE_PHOTO',
        RiderDocumentKind.vehicleRegistration => 'VEHICLE_REGISTRATION',
        RiderDocumentKind.roadworthiness => 'ROADWORTHINESS',
        RiderDocumentKind.insurance => 'INSURANCE',
      };

  String get label => switch (this) {
        RiderDocumentKind.ghanaCard => 'Ghana Card photo',
        RiderDocumentKind.driversLicence => "Driver's licence photo",
        RiderDocumentKind.riderPhoto => 'Selfie / rider photo',
        RiderDocumentKind.vehiclePhoto => 'Vehicle photo',
        RiderDocumentKind.vehicleRegistration => 'Vehicle registration',
        RiderDocumentKind.roadworthiness => 'Roadworthiness',
        RiderDocumentKind.insurance => 'Insurance',
      };

  bool get requiresVehicle => switch (this) {
        RiderDocumentKind.vehiclePhoto ||
        RiderDocumentKind.vehicleRegistration ||
        RiderDocumentKind.roadworthiness ||
        RiderDocumentKind.insurance =>
          true,
        _ => false,
      };
}

extension RiderVerificationStatusApi on RiderVerificationStatus {
  static RiderVerificationStatus fromApi(String? raw) {
    return switch (raw) {
      'DRAFT' => RiderVerificationStatus.draft,
      'PENDING_REVIEW' => RiderVerificationStatus.pendingReview,
      'APPROVED' => RiderVerificationStatus.approved,
      'REJECTED' => RiderVerificationStatus.rejected,
      _ => RiderVerificationStatus.unknown,
    };
  }
}

class RiderVehicleView {
  const RiderVehicleView({
    required this.id,
    required this.category,
    required this.registrationNumber,
    required this.make,
    required this.model,
    required this.colour,
    required this.capacity,
    required this.verificationStatus,
    this.rejectionReason,
  });

  final String id;
  final VehicleCategory category;
  final String registrationNumber;
  final String make;
  final String model;
  final String colour;
  final int capacity;
  final String verificationStatus;
  final String? rejectionReason;

  factory RiderVehicleView.fromJson(Map<String, dynamic> json) {
    return RiderVehicleView(
      id: json['id'] as String,
      category: VehicleCategoryApi.fromApi(json['category'] as String?) ??
          VehicleCategory.tricycle,
      registrationNumber: json['registrationNumber'] as String? ?? '',
      make: json['make'] as String? ?? '',
      model: json['model'] as String? ?? '',
      colour: json['colour'] as String? ?? '',
      capacity: (json['capacity'] as num?)?.toInt() ?? 1,
      verificationStatus: json['verificationStatus'] as String? ?? 'DRAFT',
      rejectionReason: json['rejectionReason'] as String?,
    );
  }
}

class RiderDocumentView {
  const RiderDocumentView({
    required this.id,
    required this.kind,
    required this.contentType,
    required this.sizeBytes,
    required this.createdAt,
    this.vehicleId,
  });

  final String id;
  final String kind;
  final String contentType;
  final int sizeBytes;
  final DateTime createdAt;
  final String? vehicleId;

  factory RiderDocumentView.fromJson(Map<String, dynamic> json) {
    return RiderDocumentView(
      id: json['id'] as String,
      kind: json['kind'] as String? ?? '',
      contentType: json['contentType'] as String? ?? '',
      sizeBytes: (json['sizeBytes'] as num?)?.toInt() ?? 0,
      createdAt: DateTime.tryParse(json['createdAt'] as String? ?? '') ??
          DateTime.now().toUtc(),
      vehicleId: json['vehicleId'] as String?,
    );
  }
}

class RiderApplicationView {
  const RiderApplicationView({
    required this.riderId,
    required this.verificationStatus,
    required this.verificationEligible,
    required this.hasEncryptedGhanaCard,
    required this.documents,
    required this.vehicles,
    this.fullName,
    this.driversLicenceNumber,
    this.driversLicenceExpiry,
    this.submittedAt,
    this.availability,
    this.reviewHistory = const [],
  });

  final String riderId;
  final RiderVerificationStatus verificationStatus;
  final bool verificationEligible;
  final bool hasEncryptedGhanaCard;
  final String? fullName;
  final String? driversLicenceNumber;
  final DateTime? driversLicenceExpiry;
  final DateTime? submittedAt;
  final String? availability;
  final List<RiderDocumentView> documents;
  final List<RiderVehicleView> vehicles;
  final List<Map<String, dynamic>> reviewHistory;

  bool get isApproved =>
      verificationStatus == RiderVerificationStatus.approved;
  bool get isPendingReview =>
      verificationStatus == RiderVerificationStatus.pendingReview;
  bool get isRejected =>
      verificationStatus == RiderVerificationStatus.rejected;

  String? get latestRejectionReason {
    for (final item in reviewHistory.reversed) {
      if (item['decision'] == 'REJECTED') {
        final reason = item['reason'] as String?;
        if (reason != null && reason.trim().isNotEmpty) return reason;
      }
    }
    for (final vehicle in vehicles) {
      final reason = vehicle.rejectionReason;
      if (reason != null && reason.trim().isNotEmpty) return reason;
    }
    return null;
  }

  factory RiderApplicationView.fromJson(Map<String, dynamic> json) {
    final docs = <RiderDocumentView>[];
    final rawDocs = json['documents'];
    if (rawDocs is List) {
      for (final item in rawDocs) {
        if (item is Map) {
          docs.add(RiderDocumentView.fromJson(Map<String, dynamic>.from(item)));
        }
      }
    }
    final vehicles = <RiderVehicleView>[];
    final rawVehicles = json['vehicles'];
    if (rawVehicles is List) {
      for (final item in rawVehicles) {
        if (item is Map) {
          vehicles
              .add(RiderVehicleView.fromJson(Map<String, dynamic>.from(item)));
        }
      }
    }
    final history = <Map<String, dynamic>>[];
    final rawHistory = json['reviewHistory'];
    if (rawHistory is List) {
      for (final item in rawHistory) {
        if (item is Map) {
          history.add(Map<String, dynamic>.from(item));
        }
      }
    }
    return RiderApplicationView(
      riderId: json['riderId'] as String? ?? '',
      fullName: json['fullName'] as String?,
      verificationStatus:
          RiderVerificationStatusApi.fromApi(json['verificationStatus'] as String?),
      driversLicenceNumber: json['driversLicenceNumber'] as String?,
      driversLicenceExpiry:
          DateTime.tryParse(json['driversLicenceExpiry'] as String? ?? ''),
      submittedAt: DateTime.tryParse(json['submittedAt'] as String? ?? ''),
      hasEncryptedGhanaCard: json['hasEncryptedGhanaCard'] as bool? ?? false,
      verificationEligible: json['verificationEligible'] as bool? ?? false,
      availability: json['availability'] as String?,
      documents: docs,
      vehicles: vehicles,
      reviewHistory: history,
    );
  }
}

class CreateVehicleInput {
  const CreateVehicleInput({
    required this.category,
    required this.registrationNumber,
    required this.make,
    required this.model,
    required this.colour,
    required this.capacity,
  });

  final VehicleCategory category;
  final String registrationNumber;
  final String make;
  final String model;
  final String colour;
  final int capacity;

  Map<String, dynamic> toJson() => {
        'category': category.apiValue,
        'registrationNumber': registrationNumber,
        'make': make,
        'model': model,
        'colour': colour,
        'capacity': capacity,
      };
}
