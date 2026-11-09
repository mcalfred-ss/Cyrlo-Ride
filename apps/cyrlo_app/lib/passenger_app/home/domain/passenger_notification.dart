import '../../../features/auth/application/signup_draft.dart';

enum PassengerNotificationKind { riderNearby, rideUpdate, promo }

/// Where tapping a notification should take the passenger.
enum PassengerNotificationAction { none, home, map }

class PassengerNotification {
  const PassengerNotification({
    required this.id,
    required this.kind,
    required this.title,
    required this.body,
    required this.createdAt,
    this.read = false,
    this.action = PassengerNotificationAction.none,
    this.vehicleKind,
  });

  final String id;
  final PassengerNotificationKind kind;
  final String title;
  final String body;
  final DateTime createdAt;
  final bool read;
  final PassengerNotificationAction action;
  final DriverKind? vehicleKind;

  PassengerNotification copyWith({bool? read}) {
    return PassengerNotification(
      id: id,
      kind: kind,
      title: title,
      body: body,
      createdAt: createdAt,
      read: read ?? this.read,
      action: action,
      vehicleKind: vehicleKind,
    );
  }

  Map<String, dynamic> toJson() => {
        'id': id,
        'kind': kind.name,
        'title': title,
        'body': body,
        'createdAt': createdAt.toIso8601String(),
        'read': read,
        'action': action.name,
        'vehicleKind': vehicleKind?.name,
      };

  factory PassengerNotification.fromJson(Map<String, dynamic> json) {
    final kindName = json['kind'] as String? ?? 'rideUpdate';
    final actionName = json['action'] as String? ?? 'none';
    final vehicleName = json['vehicleKind'] as String?;
    return PassengerNotification(
      id: json['id'] as String,
      kind: PassengerNotificationKind.values.asNameMap()[kindName] ??
          PassengerNotificationKind.rideUpdate,
      title: json['title'] as String? ?? '',
      body: json['body'] as String? ?? '',
      createdAt: DateTime.tryParse(json['createdAt'] as String? ?? '') ??
          DateTime.now(),
      read: json['read'] as bool? ?? false,
      action: PassengerNotificationAction.values.asNameMap()[actionName] ??
          PassengerNotificationAction.none,
      vehicleKind: vehicleName == null
          ? null
          : DriverKind.values.asNameMap()[vehicleName],
    );
  }
}
