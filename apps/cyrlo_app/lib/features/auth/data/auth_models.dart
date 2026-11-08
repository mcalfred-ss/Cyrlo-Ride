import '../application/signup_draft.dart';

class AuthUser {
  const AuthUser({
    required this.id,
    required this.phoneNumber,
    required this.role,
    required this.status,
    this.displayName,
  });

  final String id;
  final String phoneNumber;
  final RideRole role;
  final String status;
  final String? displayName;

  factory AuthUser.fromJson(Map<String, dynamic> json) {
    return AuthUser(
      id: json['id'] as String,
      phoneNumber: json['phoneNumber'] as String,
      role: (json['role'] as String) == 'RIDER' ? RideRole.rider : RideRole.passenger,
      status: json['status'] as String? ?? 'ACTIVE',
      displayName: json['displayName'] as String?,
    );
  }

  Map<String, dynamic> toJson() => {
        'id': id,
        'phoneNumber': phoneNumber,
        'role': role == RideRole.rider ? 'RIDER' : 'PASSENGER',
        'status': status,
        'displayName': displayName,
      };
}

class RequestOtpResult {
  const RequestOtpResult({
    required this.expiresIn,
    required this.resendAfter,
    this.developmentCode,
  });

  final int expiresIn;
  final int resendAfter;
  final String? developmentCode;

  factory RequestOtpResult.fromJson(Map<String, dynamic> json) {
    return RequestOtpResult(
      expiresIn: (json['expiresIn'] as num?)?.toInt() ?? 300,
      resendAfter: (json['resendAfter'] as num?)?.toInt() ?? 60,
      developmentCode: json['developmentCode'] as String?,
    );
  }
}

class AuthTokens {
  const AuthTokens({
    required this.accessToken,
    required this.refreshToken,
    required this.expiresIn,
    required this.user,
  });

  final String accessToken;
  final String refreshToken;
  final int expiresIn;
  final AuthUser user;

  factory AuthTokens.fromJson(Map<String, dynamic> json) {
    return AuthTokens(
      accessToken: json['accessToken'] as String,
      refreshToken: json['refreshToken'] as String,
      expiresIn: (json['expiresIn'] as num?)?.toInt() ?? 900,
      user: AuthUser.fromJson(json['user'] as Map<String, dynamic>),
    );
  }
}
