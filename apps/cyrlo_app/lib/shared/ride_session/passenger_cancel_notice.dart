import 'package:flutter_riverpod/flutter_riverpod.dart';

class PassengerCancelNotice {
  const PassengerCancelNotice({
    required this.title,
    required this.body,
  });

  final String title;
  final String body;
}

final passengerCancelNoticeProvider =
    NotifierProvider<PassengerCancelNoticeController, PassengerCancelNotice?>(
  PassengerCancelNoticeController.new,
);

class PassengerCancelNoticeController extends Notifier<PassengerCancelNotice?> {
  @override
  PassengerCancelNotice? build() => null;

  void set(PassengerCancelNotice notice) => state = notice;

  void clear() => state = null;
}
