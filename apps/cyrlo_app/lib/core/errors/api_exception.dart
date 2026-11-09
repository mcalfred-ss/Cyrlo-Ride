import 'dart:convert';

class ApiException implements Exception {
  const ApiException({
    required this.code,
    required this.message,
    this.requestId,
    this.statusCode,
    this.details,
  });

  final String code;
  final String message;
  final String? requestId;
  final int? statusCode;
  final Map<String, dynamic>? details;

  int? get resendAfterSeconds {
    final value = details?['resendAfter'];
    if (value is num) return value.toInt();
    if (value is String) return int.tryParse(value);
    return null;
  }

  factory ApiException.fromJson(
    Object? json, {
    int? statusCode,
  }) {
    Object? payload = json;
    if (payload is String && payload.trim().isNotEmpty) {
      try {
        payload = jsonDecode(payload);
      } catch (_) {
        // Keep raw string handling below.
      }
    }

    if (payload is Map) {
      final error = payload['error'] ?? payload;
      if (error is Map) {
        final detailsRaw = error['details'];
        return ApiException(
          code: error['code'] as String? ?? _fallbackCode(statusCode),
          message: error['message'] as String? ?? _fallbackMessage(statusCode),
          requestId: error['requestId'] as String?,
          statusCode: statusCode,
          details: detailsRaw is Map
              ? Map<String, dynamic>.from(detailsRaw)
              : null,
        );
      }
    }

    return ApiException(
      code: _fallbackCode(statusCode),
      message: _fallbackMessage(statusCode),
      statusCode: statusCode,
    );
  }

  static String _fallbackCode(int? statusCode) {
    return switch (statusCode) {
      401 => 'UNAUTHORIZED',
      403 => 'FORBIDDEN',
      404 => 'NOT_FOUND',
      409 => 'CONFLICT',
      429 => 'RATE_LIMITED',
      503 => 'SERVICE_UNAVAILABLE',
      _ => 'INTERNAL_ERROR',
    };
  }

  static String _fallbackMessage(int? statusCode) {
    return switch (statusCode) {
      401 => 'Invalid or expired code.',
      403 => 'Not allowed.',
      404 => 'Service endpoint not found.',
      409 => 'This number is already registered with another role.',
      429 => 'Please wait before requesting another code. Watch the timer on this screen.',
      503 => 'SMS could not be sent. Try again in a moment.',
      _ => 'Could not reach Cyrlo Ride. Check your connection.',
    };
  }

  @override
  String toString() => '$code: $message';
}
