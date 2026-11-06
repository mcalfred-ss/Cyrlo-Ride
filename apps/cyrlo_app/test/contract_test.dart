import 'package:flutter_test/flutter_test.dart';
import 'package:cyrlo_app/core/constants/realtime_events.dart';
import 'package:cyrlo_app/core/errors/api_exception.dart';

void main() {
  test('realtime event names match the backend contract', () {
    expect(RealtimeEvents.all, [
      'booking.requested',
      'booking.accepted',
      'booking.rejected',
      'booking.cancelled',
      'booking.completed',
      'rider.location.updated',
      'rider.availability.updated',
    ]);
  });

  test('reads the standard API error envelope', () {
    final error = ApiException.fromJson({
      'success': false,
      'error': {
        'code': 'VALIDATION_ERROR',
        'message': 'Request validation failed',
        'requestId': 'req-1',
      },
    }, statusCode: 400);

    expect(error.code, 'VALIDATION_ERROR');
    expect(error.message, 'Request validation failed');
    expect(error.requestId, 'req-1');
    expect(error.statusCode, 400);
  });
}
