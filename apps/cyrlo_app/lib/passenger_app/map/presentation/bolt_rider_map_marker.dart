import 'package:flutter/material.dart';

import '../../../features/auth/application/signup_draft.dart';
import '../../home/domain/nearby_rider.dart';
import 'top_down_vehicle_painter.dart';

/// Bird’s-eye vehicle on the map — illustration only, no pin / card container.
class BoltRiderMapMarker extends StatelessWidget {
  const BoltRiderMapMarker({
    super.key,
    required this.rider,
    this.selected = false,
    this.headingRadians = 0,
  });

  final NearbyRider rider;
  final bool selected;
  final double headingRadians;

  @override
  Widget build(BuildContext context) {
    final size = topDownVehicleSize(selected: selected);
    final dimmed = !rider.canRequest;

    return SizedBox(
      width: size.width,
      height: size.height,
      child: Transform.rotate(
        angle: headingRadians + topDownHeadingCorrection(rider.kind),
        child: CustomPaint(
          size: size,
          painter: TopDownVehiclePainter(
            kind: rider.kind,
            selected: selected,
            dimmed: dimmed,
          ),
        ),
      ),
    );
  }
}

/// Kept for call sites that still resolve assets by kind (sheets / history).
String vehicleAssetFor(DriverKind kind) => switch (kind) {
      DriverKind.okada => 'assets/illustrations/vehicle_okada.jpg',
      DriverKind.pragya => 'assets/illustrations/vehicle_pragya.jpg',
      DriverKind.aboboyaa => 'assets/illustrations/vehicle_aboboyaa.jpg',
    };
