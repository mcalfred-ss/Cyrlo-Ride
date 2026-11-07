enum PassengerNotificationKind { riderNearby, rideUpdate, promo }

class PassengerNotification {
  const PassengerNotification({
    required this.id,
    required this.kind,
    required this.title,
    required this.body,
    required this.createdAt,
    this.read = false,
  });

  final String id;
  final PassengerNotificationKind kind;
  final String title;
  final String body;
  final DateTime createdAt;
  final bool read;

  PassengerNotification copyWith({bool? read}) {
    return PassengerNotification(
      id: id,
      kind: kind,
      title: title,
      body: body,
      createdAt: createdAt,
      read: read ?? this.read,
    );
  }
}
