import 'package:socket_io_client/socket_io_client.dart' as io;

import '../constants/realtime_events.dart';

/// Authenticated Socket.IO connection.
///
/// The server joins each socket to its own user room (so `notification.created`
/// needs no subscription). Event names live in [RealtimeEvents].
class RealtimeClient {
  RealtimeClient({required this.socketUrl});

  final String socketUrl;
  io.Socket? _socket;

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
          .build(),
    );
    handlers.forEach(socket.on);
    _socket = socket;
    socket.connect();
  }

  void disconnect() {
    _socket?.dispose();
    _socket = null;
  }
}
