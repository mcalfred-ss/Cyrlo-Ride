import 'package:cyrlo_maps/cyrlo_maps.dart';

import '../../shared/models/geo_point.dart';

/// Ride-facing device location. Does not choose a pickup or upload GPS.
enum DeviceLocationStatus { fix, denied, serviceDisabled, unavailable }

class DeviceLocationResult {
  const DeviceLocationResult._({
    required this.status,
    this.point,
    this.accuracyMeters,
  });

  const DeviceLocationResult.fix(GeoPoint point, {double? accuracyMeters})
    : this._(
        status: DeviceLocationStatus.fix,
        point: point,
        accuracyMeters: accuracyMeters,
      );

  const DeviceLocationResult.denied()
    : this._(status: DeviceLocationStatus.denied);

  const DeviceLocationResult.serviceDisabled()
    : this._(status: DeviceLocationStatus.serviceDisabled);

  const DeviceLocationResult.unavailable()
    : this._(status: DeviceLocationStatus.unavailable);

  final DeviceLocationStatus status;
  final GeoPoint? point;
  final double? accuracyMeters;

  bool get hasFix => status == DeviceLocationStatus.fix && point != null;
}

abstract class DeviceLocationGateway {
  Future<DeviceLocationResult> current();
}

class CyrloDeviceLocationGateway implements DeviceLocationGateway {
  CyrloDeviceLocationGateway({DeviceLocationService? service})
    : _service = service ?? DeviceLocationService(GeolocatorLocationClient());

  final DeviceLocationService _service;

  @override
  Future<DeviceLocationResult> current() async {
    final read = await _service.current();
    if (read.serviceDisabled) {
      return const DeviceLocationResult.serviceDisabled();
    }
    if (read.denied || read.fix == null) {
      return const DeviceLocationResult.denied();
    }
    final fix = read.fix!;
    return DeviceLocationResult.fix(
      GeoPoint.fromFix(fix),
      accuracyMeters: fix.accuracyMeters,
    );
  }
}

/// Deterministic stand-in for widget and unit tests.
class FakeDeviceLocationGateway implements DeviceLocationGateway {
  FakeDeviceLocationGateway(this.result);

  DeviceLocationResult result;

  @override
  Future<DeviceLocationResult> current() async => result;
}
