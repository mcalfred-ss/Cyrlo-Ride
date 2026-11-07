import 'package:flutter_riverpod/flutter_riverpod.dart';

/// Rider starts offline and must tap Go online before job offers appear.
final riderOnlineProvider =
    NotifierProvider<RiderAvailabilityController, bool>(
  RiderAvailabilityController.new,
);

class RiderAvailabilityController extends Notifier<bool> {
  @override
  bool build() => false;

  void goOnline() => state = true;

  void goOffline() => state = false;

  void setOnline(bool online) => state = online;
}
