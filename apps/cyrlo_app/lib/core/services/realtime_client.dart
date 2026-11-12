import 'package:socket_io_client/socket_io_client.dart' as io;

import '../constants/realtime_events.dart';

typedef RealtimeEventHandler = void Function(dynamic data);

/// Authenticated Socket.IO connection.
///
/// The server joins each socket to its own user room (so `notification.created`
/// needs no subscription). Persistence never depends on this — poll as fallback.
/// Exact pre-accept rider GPS is never delivered on passenger discovery events.
class RealtimeClient {
  RealtimeClient({required this.socketUrl});

  final String socketUrl;
  io.Socket? _socket;
  final Map<String, List<RealtimeEventHandler>> _handlers = {};

  bool get isConnected => _socket?.connected ?? false;

  void connect({
    required String accessToken,
    Map<String, void Function(dynamic payload)> handlers = const {},
  }) {
    disconnect();
    final socket = io.io(
      socketUrl,
      io.OptionBuilder()
          .setTransports(const ['websocket'])
          .setAuth({'token': accessToken})
          .disableAutoConnect()
          .enableReconnection()
          .build(),
    );
    handlers.forEach(socket.on);
    _socket = socket;
    for (final event in RealtimeEvents.all) {
      socket.on(event, (data) {
        final listeners = _handlers[event];
        if (listeners == null) return;
        for (final handler in List<RealtimeEventHandler>.from(listeners)) {
          handler(data);
        }
      });
    }
    socket.connect();
  }

  void on(String event, RealtimeEventHandler handler) {
    _handlers.putIfAbsent(event, () => []).add(handler);
  }

  void off(String event, [RealtimeEventHandler? handler]) {
    if (handler == null) {
      _handlers.remove(event);
      return;
    }
    _handlers[event]?.remove(handler);
  }

  void subscribeBooking(String bookingId) {
    _socket?.emit('booking:subscribe', bookingId);
  }

  void unsubscribeBooking(String bookingId) {
    _socket?.emit('booking:unsubscribe', bookingId);
  }

  void disconnect() {
    _socket?.dispose();
    _socket = null;
  }
}
