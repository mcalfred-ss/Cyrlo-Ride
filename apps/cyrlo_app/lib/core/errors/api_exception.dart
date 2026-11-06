class ApiException implements Exception {
  const ApiException({
    required this.code,
    required this.message,
    this.requestId,
    this.statusCode,
  });

  final String code;
  final String message;
  final String? requestId;
  final int? statusCode;

  factory ApiException.fromJson(
    Object? json, {
    int? statusCode,
  }) {
    if (json is Map) {
      final error = json['error'] ?? json;
      if (error is Map) {
        return ApiException(
          code: error['code'] as String? ?? 'INTERNAL_ERROR',
          message: error['message'] as String? ?? 'Request failed',
          requestId: error['requestId'] as String?,
          statusCode: statusCode,
        );
      }
    }
    return ApiException(
      code: 'INTERNAL_ERROR',
      message: 'Request failed',
      statusCode: statusCode,
    );
  }

  @override
  String toString() => '$code: $message';
}
