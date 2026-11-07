import '../../../features/auth/application/signup_draft.dart';
import '../../../shared/models/geo_point.dart';

class NearbyRider {
  const NearbyRider({
    required this.id,
    required this.kind,
    required this.etaMinutes,
    required this.point,
    this.phoneE164,
    this.available = true,
  });

  final String id;
  final DriverKind kind;
  final int etaMinutes;
  final GeoPoint point;
  /// Shared only after a paid request — never shown on the public nearby list UI.
  final String? phoneE164;
  final bool available;

  String get kindLabel => switch (kind) {
        DriverKind.okada => 'Okada',
        DriverKind.pragya => 'Pragya',
        DriverKind.aboboyaa => 'Aboboyaa',
      };

  String get etaLabel => etaMinutes <= 1 ? '1 min away' : '$etaMinutes mins away';
}
