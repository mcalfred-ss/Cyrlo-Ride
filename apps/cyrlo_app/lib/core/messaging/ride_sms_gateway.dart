import 'package:flutter/foundation.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';

/// Outbound ride SMS (cancel, OTP later). Vendor wiring lives behind this edge.
abstract class RideSmsGateway {
  Future<RideSmsResult> send({required String toE164, required String body});
}

class RideSmsResult {
  const RideSmsResult({required this.sent, this.errorMessage});

  const RideSmsResult.ok() : this(sent: true);

  const RideSmsResult.failed(String message)
      : this(sent: false, errorMessage: message);

  final bool sent;
  final String? errorMessage;
}

class RideSmsMessage {
  const RideSmsMessage({
    required this.toE164,
    required this.body,
    required this.sentAt,
  });

  final String toE164;
  final String body;
  final DateTime sentAt;
}

/// Local stand-in until a production SMS vendor is wired through the API.
/// Records outbound messages so cancel flows can prove SMS was attempted.
class DevelopmentRideSmsGateway implements RideSmsGateway {
  final List<RideSmsMessage> sent = [];

  @override
  Future<RideSmsResult> send({
    required String toE164,
    required String body,
  }) async {
    if (toE164.trim().isEmpty || body.trim().isEmpty) {
      return const RideSmsResult.failed('Missing phone or message body.');
    }
    sent.add(
      RideSmsMessage(
        toE164: toE164,
        body: body,
        sentAt: DateTime.now(),
      ),
    );
    debugPrint('Cyrlo SMS → $toE164 (${body.length} chars)');
    return const RideSmsResult.ok();
  }
}

final rideSmsGatewayProvider = Provider<RideSmsGateway>((ref) {
  return DevelopmentRideSmsGateway();
});
