import 'package:cyrlo_app/core/messaging/ride_sms_gateway.dart';
import 'package:flutter_test/flutter_test.dart';

void main() {
  test('development SMS gateway records outbound cancel messages', () async {
    final gateway = DevelopmentRideSmsGateway();

    final result = await gateway.send(
      toE164: '+233201234567',
      body: 'Cyrlo Ride: Your Pragya rider cancelled the pickup.',
    );

    expect(result.sent, isTrue);
    expect(gateway.sent, hasLength(1));
    expect(gateway.sent.single.toE164, '+233201234567');
    expect(gateway.sent.single.body, contains('cancelled'));
  });

  test('development SMS gateway rejects empty phone', () async {
    final gateway = DevelopmentRideSmsGateway();
    final result = await gateway.send(toE164: '', body: 'hello');
    expect(result.sent, isFalse);
    expect(gateway.sent, isEmpty);
  });
}
