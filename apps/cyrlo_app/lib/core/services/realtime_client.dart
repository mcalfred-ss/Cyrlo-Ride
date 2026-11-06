import 'package:socket_io_client/socket_io_client.dart' as io;

import '../constants/realtime_events.dart';

/// Authenticated Socket.IO connection.
///
/// Event names live in [RealtimeEvents]. The backend does not emit them yet,
/// so this client only opens and closes the connection.
class RealtimeClient {
  RealtimeClient({required this.socketUrl});

  final String socketUrl;
  io.Socket? _socket;

  bool get isConnected => _socket?.connected ?? false;

  void connect({required String accessToken}) {
    disconnect();
    final socket = io.io(
      socketUrl,
      io.OptionBuilder()
          .setTransports(const ['websocket'])
          .setAuth({'token': accessToken})
          .disableAutoConnect()
          .build(),
    );
    _socket = socket;
    socket.connect();
  }

  void disconnect() {
    _socket?.dispose();
    _socket = null;
  }
}
